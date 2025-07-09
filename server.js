const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
// const { google } = require('googleapis'); // Google Calendar API 제거
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
  
  // Create users table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `, (err) => {
    if (err) console.error('Error creating users table:', err);
    else console.log('Users table ready');
  });
  
  // Create calendars table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS calendars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      page_name TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      is_public BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) console.error('Error creating calendars table:', err);
    else console.log('Calendars table ready');
  });
  
  // Create schedule_dates table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS schedule_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calendar_id INTEGER NOT NULL,
      schedule_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
      UNIQUE(calendar_id, schedule_date)
    )
  `, (err) => {
    if (err) console.error('Error creating schedule_dates table:', err);
    else console.log('Schedule_dates table ready');
  });
});

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files will be served after authenticated routes are defined

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'scheduler_session', // Custom session cookie name
  cookie: { 
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
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
  prompt: 'consent',
  scope: ['profile', 'email']
}, (accessToken, refreshToken, profile, done) => {
  const googleId = profile.id;
  const email = profile.emails[0].value;
  const name = profile.displayName;
  
  // 사용자가 데이터베이스에 있는지 확인하고 없으면 생성
  db.get("SELECT * FROM users WHERE google_id = ? OR email = ?", [googleId, email], (err, existingUser) => {
    if (err) {
      return done(err);
    }
    
    if (existingUser) {
      // 기존 사용자 - Google ID 업데이트 (필요시) 및 마지막 로그인 시간 업데이트
      if (existingUser.google_id !== googleId) {
        // 이메일은 같지만 Google ID가 다른 경우 (재인증 등)
        db.run(
          "UPDATE users SET google_id = ?, name = ?, last_login = CURRENT_TIMESTAMP WHERE email = ?",
          [googleId, name, email],
          (err) => {
            if (err) console.error('Error updating user:', err);
          }
        );
      } else {
        // 단순 로그인 시간 업데이트
        db.run(
          "UPDATE users SET last_login = CURRENT_TIMESTAMP, name = ? WHERE google_id = ?",
          [name, googleId],
          (err) => {
            if (err) console.error('Error updating last login:', err);
          }
        );
      }
      return done(null, {
        id: googleId,
        email: existingUser.email,
        name: name || existingUser.name,
        dbId: existingUser.id
      });
    } else {
      // 새 사용자 생성
      db.run(
        "INSERT INTO users (google_id, email, name, last_login) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [googleId, email, name],
        function(err) {
          if (err) {
            console.error('Error creating user:', err);
            // 이메일 중복 등의 에러 처리
            if (err.message.includes('UNIQUE')) {
              return done(null, {
                id: googleId,
                email: email,
                name: name,
                dbId: null
              });
            }
            return done(err);
          }
          return done(null, {
            id: googleId,
            email: email,
            name: name,
            dbId: this.lastID
          });
        }
      );
    }
  });
}));

// Authentication middleware
const ensureAuthenticated = (req, res, next) => {
  // 개발 환경에서 임시 인증 우회
  if (!isProduction && !req.isAuthenticated()) {
    // 개발 환경에서는 더미 사용자로 설정
    req.user = {
      id: 'google_ohhora76_at_gmail.com',  // 기존 더미 Google ID
      email: 'ohhora76@gmail.com',
      name: 'Development User',
      dbId: 1
    };
  }
  
  if (req.isAuthenticated() || !isProduction) {
    return next();
  }
  
  // For AJAX requests, send 401 status
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For regular requests, redirect to login
  res.redirect('/admin/login');
};

// Serve React static assets BEFORE any routes (no auth needed for assets)
if (isProduction) {
  app.use('/admin/assets', express.static(path.join(__dirname, 'admin-client', 'dist', 'assets'), {
    setHeaders: (res, path) => {
      if (path.endsWith('.js')) {
        res.set('Content-Type', 'application/javascript');
      } else if (path.endsWith('.css')) {
        res.set('Content-Type', 'text/css');
      }
    }
  }));
  app.use('/admin/vite.svg', express.static(path.join(__dirname, 'admin-client', 'dist')));
}

// Routes
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Login route - must be BEFORE authenticated routes
app.get('/admin/login', (req, res) => {
  // If already authenticated, redirect to admin
  if (req.isAuthenticated()) {
    return res.redirect('/admin');
  }
  res.render('login');
});

// API endpoints for admin frontend
app.get('/admin/api/user', ensureAuthenticated, (req, res) => {
  res.json({ user: req.user });
});

app.get('/admin/api/calendars', ensureAuthenticated, (req, res) => {
  const googleId = req.user.id;
  
  db.all(
    `SELECT c.*, COUNT(sd.id) as event_count 
     FROM calendars c 
     LEFT JOIN schedule_dates sd ON c.id = sd.calendar_id
     WHERE c.user_id = (SELECT id FROM users WHERE google_id = ?)
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [googleId],
    (err, calendars) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ calendars: calendars || [] });
    }
  );
});

// Admin routes - must be before static file serving
app.get('/admin', ensureAuthenticated, async (req, res) => {
  try {
    // 프로덕션 환경에서는 React 빌드 파일 서빙
    if (isProduction) {
      res.sendFile(path.join(__dirname, 'admin-client', 'dist', 'index.html'));
    } else {
      // 개발 환경에서는 React 개발 서버로 리다이렉트
      res.redirect('http://localhost:5173');
    }
  } catch (error) {
    console.error('Error in admin route:', error);
    res.status(500).send('Server error');
  }
});

// Catch all admin routes for React Router
app.get('/admin/*', ensureAuthenticated, (req, res) => {
  if (isProduction) {
    res.sendFile(path.join(__dirname, 'admin-client', 'dist', 'index.html'));
  } else {
    res.redirect('http://localhost:5173');
  }
});

// Serve index.html for authenticated /admin route
if (isProduction) {
  app.use('/admin', ensureAuthenticated, express.static(path.join(__dirname, 'admin-client', 'dist')));
}



// 새 캘린더 생성
app.post('/admin/calendar', ensureAuthenticated, (req, res) => {
  const { page_name, title, description } = req.body;
  const googleId = req.user.id;
  
  // 예약된 페이지 이름 확인
  const reservedNames = ['admin', 'auth', 'logout', 'privacy', 'api', 'login', 'css', 'js', 'images'];
  if (reservedNames.includes(page_name.toLowerCase())) {
    return res.status(400).json({ error: `페이지명 '${page_name}'은 사용할 수 없습니다. 다른 이름을 선택해주세요.` });
  }
  
  // 사용자 ID 가져오기
  db.get("SELECT id FROM users WHERE google_id = ?", [googleId], (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: 'User not found' });
    }
    
    db.run(
      `INSERT INTO calendars (user_id, page_name, title, description) VALUES (?, ?, ?, ?)`,
      [user.id, page_name, title, description || ''],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: '이미 사용 중인 페이지 이름입니다.' });
          }
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        res.json({ success: true, message: '캘린더가 생성되었습니다.', calendarId: this.lastID });
      }
    );
  });
});

// 캘린더 수정
app.put('/admin/calendar/:id', ensureAuthenticated, (req, res) => {
  const calendarId = req.params.id;
  const { title, description, is_public } = req.body;
  const googleId = req.user.id;
  
  db.run(
    `UPDATE calendars 
     SET title = ?, description = ?, is_public = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = (SELECT id FROM users WHERE google_id = ?)`, 
    [title, description || '', is_public ? 1 : 0, calendarId, googleId], 
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: '캘린더를 찾을 수 없습니다.' });
      }
      res.json({ success: true, message: '캘린더가 업데이트되었습니다.' });
    }
  );
});

// 캘린더 삭제
app.delete('/admin/calendar/:id', ensureAuthenticated, (req, res) => {
  const calendarId = req.params.id;
  const googleId = req.user.id;
  
  db.run(
    "DELETE FROM calendars WHERE id = ? AND user_id = (SELECT id FROM users WHERE google_id = ?)", 
    [calendarId, googleId], 
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: '캘린더를 찾을 수 없습니다.' });
      }
      res.json({ success: true, message: '캘린더가 삭제되었습니다.' });
    }
  );
});

// 스케줄 날짜 관리 API
// 특정 캘린더의 스케줄 날짜 목록 가져오기
app.get('/api/calendar/:id/dates', ensureAuthenticated, (req, res) => {
  const calendarId = req.params.id;
  const googleId = req.user.id;
  const { year, month } = req.query;
  
  let query = `
    SELECT sd.schedule_date 
    FROM schedule_dates sd
    JOIN calendars c ON sd.calendar_id = c.id
    WHERE c.id = ? AND c.user_id = (SELECT id FROM users WHERE google_id = ?)
  `;
  const params = [calendarId, googleId];
  
  // 년/월 필터링
  if (year && month) {
    query += ` AND strftime('%Y-%m', sd.schedule_date) = ?`;
    params.push(`${year}-${month.padStart(2, '0')}`);
  }
  
  db.all(query + ' ORDER BY sd.schedule_date', params, (err, dates) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ dates: dates.map(d => d.schedule_date) });
  });
});

// 스케줄 날짜 토글 (추가/제거)
app.post('/api/calendar/:id/dates', ensureAuthenticated, (req, res) => {
  const calendarId = req.params.id;
  const googleId = req.user.id;
  const { date } = req.body;
  
  if (!date) {
    return res.status(400).json({ error: '날짜가 필요합니다.' });
  }
  
  // 권한 확인
  db.get(
    `SELECT id FROM calendars WHERE id = ? AND user_id = (SELECT id FROM users WHERE google_id = ?)`,
    [calendarId, googleId],
    (err, calendar) => {
      if (err || !calendar) {
        return res.status(404).json({ error: '캘린더를 찾을 수 없습니다.' });
      }
      
      // 날짜 존재 확인
      db.get(
        `SELECT id FROM schedule_dates WHERE calendar_id = ? AND schedule_date = ?`,
        [calendarId, date],
        (err, existing) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }
          
          if (existing) {
            // 이미 있으면 삭제
            db.run(
              `DELETE FROM schedule_dates WHERE id = ?`,
              [existing.id],
              (err) => {
                if (err) {
                  return res.status(500).json({ error: 'Database error' });
                }
                res.json({ success: true, action: 'removed', date });
              }
            );
          } else {
            // 없으면 추가
            db.run(
              `INSERT INTO schedule_dates (calendar_id, schedule_date) VALUES (?, ?)`,
              [calendarId, date],
              (err) => {
                if (err) {
                  return res.status(500).json({ error: 'Database error' });
                }
                res.json({ success: true, action: 'added', date });
              }
            );
          }
        }
      );
    }
  );
});

// 여러 날짜 한번에 업데이트 (드래그 선택용)
app.post('/api/calendar/:id/dates/bulk', ensureAuthenticated, (req, res) => {
  const calendarId = req.params.id;
  const googleId = req.user.id;
  const { dates, action } = req.body;
  
  if (!dates || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: '날짜 배열이 필요합니다.' });
  }
  
  if (!['add', 'remove'].includes(action)) {
    return res.status(400).json({ error: '올바른 action이 필요합니다 (add/remove).' });
  }
  
  // 권한 확인
  db.get(
    `SELECT id FROM calendars WHERE id = ? AND user_id = (SELECT id FROM users WHERE google_id = ?)`,
    [calendarId, googleId],
    (err, calendar) => {
      if (err || !calendar) {
        return res.status(404).json({ error: '캘린더를 찾을 수 없습니다.' });
      }
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        let processed = 0;
        let errors = 0;
        
        const complete = () => {
          if (errors > 0) {
            db.run('ROLLBACK');
            res.status(500).json({ error: 'Some dates failed to process' });
          } else {
            db.run('COMMIT');
            res.json({ success: true, processed, action });
          }
        };
        
        dates.forEach((date, index) => {
          if (action === 'add') {
            db.run(
              `INSERT OR IGNORE INTO schedule_dates (calendar_id, schedule_date) VALUES (?, ?)`,
              [calendarId, date],
              (err) => {
                if (err) errors++;
                else processed++;
                if (index === dates.length - 1) complete();
              }
            );
          } else {
            db.run(
              `DELETE FROM schedule_dates WHERE calendar_id = ? AND schedule_date = ?`,
              [calendarId, date],
              (err) => {
                if (err) errors++;
                else processed++;
                if (index === dates.length - 1) complete();
              }
            );
          }
        });
      });
    }
  );
});

// Delete user account and all associated data
app.delete('/admin/delete-account', ensureAuthenticated, (req, res) => {
  const googleId = req.user.id;
  
  // 새 스키마에 맞게 사용자 삭제 (CASCADE로 관련 데이터 자동 삭제)
  db.run("DELETE FROM users WHERE google_id = ?", [googleId], function(err) {
    if (err) {
      console.error('Error deleting user:', err);
      return res.status(500).json({ error: 'Database error while deleting user' });
    }
    
    console.log(`Account deleted: ${userEmail} (${this.changes} schedules removed)`);
    
    // Log out the user and destroy session
    req.logout((logoutErr) => {
      if (logoutErr) {
        console.error('Error during logout:', logoutErr);
      }
      
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error('Error destroying session:', sessionErr);
        }
        res.json({ success: true, message: 'Account and all associated data deleted successfully' });
      });
    });
  });
});

// Logout route (must be before catch-all route)
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    // Destroy session to ensure complete logout
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      // Clear cookie with the custom name
      res.clearCookie('scheduler_session');
      res.redirect('/admin/login');
    });
  });
});

// Privacy policy route (must be before catch-all route)
app.get('/privacy', (req, res) => {
  res.render('privacy');
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
  
  // 새 스키마에서 캘린더 조회
  db.get("SELECT * FROM calendars WHERE page_name = ? AND is_public = 1", [pageName], async (err, calendar) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Database error');
    }
    
    if (!calendar) {
      return res.status(404).render('error', { message: 'Schedule not found' });
    }
    
    try {
      // 해당 캘린더의 스케줄 날짜들을 조회
      db.all(
        "SELECT schedule_date FROM schedule_dates WHERE calendar_id = ? ORDER BY schedule_date",
        [calendar.id],
        (err, scheduleDates) => {
          if (err) {
            console.error(err);
            return res.status(500).send('Database error');
          }
          
          // 날짜 배열로 변환
          const events = scheduleDates.map(row => ({
            date: row.schedule_date
          }));
          
          res.render('schedule', {
            title: calendar.title,
            description: calendar.description,
            page_name: calendar.page_name,
            events: events,
            year: year,
            month: month
          });
        }
      );
    } catch (error) {
      console.error('오류:', error);
      res.status(500).render('error', { message: 'Schedule loading error' });
    }
  });
});

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    accessType: 'offline',
    prompt: 'consent'
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/admin/login' }),
  (req, res) => {
    res.redirect('/admin');
  }
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});