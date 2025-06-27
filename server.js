const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { google } = require('googleapis');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
// Load environment variables (only in local development)
// Railway sets RAILWAY_ENVIRONMENT, so we can detect it
const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
const isProduction = process.env.NODE_ENV === 'production' || isRailway;

// Set NODE_ENV to production if on Railway
if (isRailway && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

if (!isProduction) {
  require('dotenv').config();
}

// Debug environment
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Railway detected:', !!isRailway);
console.log('Is production:', isProduction);
console.log('Node version:', process.version);
console.log('Available env vars:', Object.keys(process.env).filter(key => 
  key.startsWith('GOOGLE_') || key === 'SESSION_SECRET' || key.startsWith('RAILWAY_')
));

// Environment variables validation
const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please set these environment variables in Railway dashboard:');
  console.error('Settings → Variables');
  console.error('Current NODE_ENV:', process.env.NODE_ENV);
  process.exit(1);
}

console.log('✅ All required environment variables are set');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const dbDir = path.join(__dirname, 'database');
const dbPath = path.join(dbDir, 'scheduler.db');

// Ensure database directory exists with proper permissions
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { mode: 0o755 });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to the SQLite database.');
    // Set database file permissions
    try {
      fs.chmodSync(dbPath, 0o644);
    } catch (chmodErr) {
      console.warn('Could not set database file permissions:', chmodErr);
    }
  }
});

// Initialize database tables
db.serialize(() => {
  // Enable WAL mode for better concurrency
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA synchronous=NORMAL");
  db.run("PRAGMA temp_store=MEMORY");
  
  db.run(`CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    calendar_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    show_details BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: isProduction ? "https://schedule.ciesta.co/auth/google/callback" : "/auth/google/callback",
  accessType: 'offline',
  prompt: 'consent'
}, (accessToken, refreshToken, profile, done) => {
  console.log('OAuth Token Debug:');
  console.log('  Access Token:', accessToken ? 'EXISTS' : 'NULL');
  console.log('  Refresh Token:', refreshToken ? 'EXISTS' : 'NULL');
  console.log('  Profile ID:', profile.id);
  
  const user = {
    id: profile.id,
    email: profile.emails[0].value,
    name: profile.displayName,
    accessToken: accessToken,
    refreshToken: refreshToken
  };
  return done(null, user);
}));

// Authentication middleware
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/admin/login');
};

// Routes
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Admin routes
app.get('/admin', ensureAuthenticated, async (req, res) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      access_token: req.user.accessToken,
      refresh_token: req.user.refreshToken
    });

    // Handle token refresh automatically
    oauth2Client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        req.user.refreshToken = tokens.refresh_token;
      }
      if (tokens.access_token) {
        req.user.accessToken = tokens.access_token;
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();

    // Get existing schedules
    db.all("SELECT * FROM schedules WHERE user_email = ?", [req.user.email], (err, schedules) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Database error');
      }
      
      res.render('admin', {
        user: req.user,
        calendars: calendarList.data.items,
        schedules: schedules
      });
    });
  } catch (error) {
    console.error('Error fetching calendars:', error);
    res.status(500).send('Error fetching calendars');
  }
});

app.get('/admin/login', (req, res) => {
  res.render('login');
});

// Create new schedule
app.post('/admin/schedule', ensureAuthenticated, (req, res) => {
  const { page_name, display_name, calendar_id, calendar_name, show_details } = req.body;
  
  // Check for reserved page names
  const reservedNames = ['admin', 'auth', 'logout', 'privacy', 'api'];
  if (reservedNames.includes(page_name.toLowerCase())) {
    return res.status(400).json({ error: `페이지명 '${page_name}'은 사용할 수 없습니다. 다른 이름을 선택해주세요.` });
  }
  
  db.run(
    `INSERT OR REPLACE INTO schedules 
     (page_name, display_name, calendar_id, calendar_name, user_email, access_token, refresh_token, show_details) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [page_name, display_name, calendar_id, calendar_name, req.user.email, req.user.accessToken, req.user.refreshToken || null, show_details ? 1 : 0],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      res.json({ success: true, message: 'Schedule created successfully' });
    }
  );
});

// Update schedule settings
app.put('/admin/schedule/:id', ensureAuthenticated, (req, res) => {
  const scheduleId = req.params.id;
  const { show_details } = req.body;
  
  db.run(
    "UPDATE schedules SET show_details = ? WHERE id = ? AND user_email = ?", 
    [show_details ? 1 : 0, scheduleId, req.user.email], 
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      res.json({ success: true, message: 'Schedule settings updated successfully' });
    }
  );
});

// Delete schedule
app.delete('/admin/schedule/:id', ensureAuthenticated, (req, res) => {
  const scheduleId = req.params.id;
  
  db.run("DELETE FROM schedules WHERE id = ? AND user_email = ?", [scheduleId, req.user.email], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ success: true, message: 'Schedule deleted successfully' });
  });
});

// Public schedule view
app.get('/:pageName', async (req, res) => {
  const pageName = req.params.pageName;
  
  // Check for reserved page names to prevent routing conflicts
  const reservedNames = ['admin', 'auth', 'logout', 'privacy', 'api'];
  if (reservedNames.includes(pageName.toLowerCase())) {
    return res.status(404).render('error', { message: 'Page not found' });
  }
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  
  db.get("SELECT * FROM schedules WHERE page_name = ?", [pageName], async (err, schedule) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    
    if (!schedule) {
      return res.status(404).render('error', { message: 'Schedule not found' });
    }
    
    try {
      // Check if refresh token exists
      if (!schedule.refresh_token) {
        console.warn(`No refresh token available for schedule: ${pageName}`);
        return res.status(503).render('error', { 
          message: '캘린더 연결이 만료되었습니다. 관리자에게 재인증을 요청하세요.' 
        });
      }

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      
      oauth2Client.setCredentials({
        access_token: schedule.access_token,
        refresh_token: schedule.refresh_token
      });

      // Handle token refresh automatically
      oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          schedule.refresh_token = tokens.refresh_token;
        }
        if (tokens.access_token) {
          schedule.access_token = tokens.access_token;
          // Update the database with new tokens
          db.run(
            'UPDATE schedules SET access_token = ?, refresh_token = ? WHERE id = ?',
            [tokens.access_token, tokens.refresh_token, schedule.id],
            (err) => {
              if (err) {
                console.error('Error updating tokens:', err);
              }
            }
          );
        }
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      
      // Validate token before making API calls
      try {
        await oauth2Client.getAccessToken();
      } catch (tokenError) {
        console.error(`Token validation failed for schedule: ${pageName}`, tokenError);
        return res.status(503).render('error', { 
          message: '캘린더 접근 권한이 만료되었습니다. 관리자에게 재인증을 요청하세요.' 
        });
      }
      
      // Get events for the specified month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      
      const events = await calendar.events.list({
        calendarId: schedule.calendar_id,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        maxResults: 500,
        singleEvents: true,
        orderBy: 'startTime'
      });

      // Filter events based on showDetails setting
      let filteredEvents = events.data.items || [];
      if (schedule.show_details !== 1) {
        // Only send basic info without sensitive details
        filteredEvents = filteredEvents.map(event => ({
          id: event.id,
          start: event.start,
          end: event.end,
          summary: '일정 있음' // Generic title
          // Remove description, location, attendees, etc.
        }));
      }

      res.render('schedule', {
        displayName: schedule.display_name,
        calendarName: schedule.calendar_name,
        events: filteredEvents,
        pageName: pageName,
        currentYear: year,
        currentMonth: month,
        showDetails: schedule.show_details === 1
      });
    } catch (error) {
      console.error('Error fetching events:', error);
      res.status(500).render('error', { message: 'Error fetching calendar events' });
    }
  });
});

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar.readonly'] 
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/admin/login' }),
  (req, res) => {
    res.redirect('/admin');
  }
);

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error(err);
    }
    res.redirect('/admin/login');
  });
});

// Privacy policy route
app.get('/privacy', (req, res) => {
  res.render('privacy');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});