# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**IMPORTANT UPDATE (2025-07-09)**: This project has been completely refactored from a Google Calendar integration app to a **Self-Managed Schedule System**. Google OAuth is now used only for authentication, not for calendar data access.

### Original Project
- Was: Google Calendar Public Schedule Viewer that synced with Google Calendar API
- Used: Google Calendar API for event data, OAuth tokens for calendar access

### Current Project
- Is: Self-managed schedule system with custom calendar implementation
- Uses: Google OAuth only for login, all schedule data stored locally
- Features: Click/drag date selection, modern React admin interface

## Major Refactoring Changes

### 1. Database Schema Changes

**Old Schema (removed)**:
```sql
-- Single schedules table tied to Google Calendar
CREATE TABLE schedules (
  user_id, user_email, calendar_id, calendar_name, 
  access_token, refresh_token, show_details
);
```

**New Schema (current)**:
```sql
-- Users table (Google OAuth info)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);

-- Calendars table (custom calendars)
CREATE TABLE calendars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  page_name TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Schedule dates table (simple date marking)
CREATE TABLE schedule_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL,
  schedule_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
  UNIQUE(calendar_id, schedule_date)
);
```

### 2. Migration Process
- Database backed up to `scheduler.db.backup_*`
- Migration script at `database/migrate.js` converts old data
- New schema at `database/schema.sql`

### 3. Backend Changes

**Google OAuth Scope**:
- Before: `['profile', 'email', 'https://www.googleapis.com/auth/calendar.readonly']`
- After: `['profile', 'email']` (calendar scope removed)

**Removed Dependencies**:
- `const { google } = require('googleapis');` - commented out
- All Google Calendar API calls removed

**New API Endpoints**:
```javascript
// Calendar management
POST   /admin/calendar              // Create calendar
PUT    /admin/calendar/:id          // Update calendar
DELETE /admin/calendar/:id          // Delete calendar

// Schedule date management
GET    /api/calendar/:id/dates      // Get schedule dates
POST   /api/calendar/:id/dates      // Toggle single date
POST   /api/calendar/:id/dates/bulk // Update multiple dates

// Admin API
GET    /admin/api/user              // Get current user
GET    /admin/api/calendars         // Get user's calendars

// Public API
GET    /api/public/:pageName/dates  // Get public calendar dates
```

### 4. Frontend Implementation

**New React Admin Interface** (`/admin-client/`):
```bash
admin-client/
├── src/
│   ├── components/
│   │   ├── CalendarManager.jsx    # Main calendar UI with drag selection
│   │   └── ui/                    # shadcn/ui components
│   ├── App.jsx                    # Main admin dashboard
│   └── lib/utils.js              # Utility functions
├── package.json                   # React dependencies
├── vite.config.js                # Vite config with proxy
├── tailwind.config.js            # Tailwind CSS config
└── components.json               # shadcn/ui config
```

**Key Features**:
- Click to toggle individual dates
- Drag to select/deselect multiple dates
- Real-time updates
- Responsive design with Tailwind CSS
- Modern UI with shadcn/ui components

## Development Setup

### Starting Development Servers (IMPORTANT)

**⚠️ ALWAYS use background execution to avoid blocking the terminal:**

```bash
# Start both servers with background execution
cd /Users/jungjepark/Desktop/Dev/tour_schedule_2

# 1. Start backend server
nohup npm run dev > server.log 2>&1 &
BACKEND_PID=$!
echo "Backend starting (PID: $BACKEND_PID)..."
sleep 3
curl -s http://localhost:3000 > /dev/null && echo "✓ Backend running on :3000" || echo "✗ Backend failed"

# 2. Start frontend server
cd admin-client
nohup npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend starting (PID: $FRONTEND_PID)..."
sleep 3
curl -s http://localhost:5173 > /dev/null && echo "✓ Frontend running on :5173" || echo "✗ Frontend failed"

# Save PIDs for cleanup
cd ..
echo "$BACKEND_PID $FRONTEND_PID" > .dev-pids
```

### Stopping Development Servers

```bash
# Option 1: Using saved PIDs
if [ -f .dev-pids ]; then
    kill $(cat .dev-pids) 2>/dev/null
    rm .dev-pids
    echo "Servers stopped"
fi

# Option 2: Kill by port
lsof -ti :3000 | xargs kill 2>/dev/null  # Backend
lsof -ti :5173 | xargs kill 2>/dev/null  # Frontend
```

### Checking Server Status

```bash
# Check running processes
ps aux | grep -E "node.*tour_schedule|nodemon|vite" | grep -v grep

# Check ports
lsof -i :3000  # Backend
lsof -i :5173  # Frontend
```

### Backend (Express Server)
```bash
# Install dependencies
npm install

# Server runs on http://localhost:3000
```

### Frontend (React Admin)
```bash
# Navigate to admin client
cd admin-client

# Install dependencies
npm install

# Admin interface runs on http://localhost:5173
# Proxies API calls to :3000
```

### Environment Variables
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
SESSION_SECRET=your_session_secret
PORT=3000
```

## Current File Structure

```
tour_schedule_2/
├── server.js                     # Express server (modified)
├── server.js.backup             # Original server backup
├── database/
│   ├── scheduler.db             # SQLite database
│   ├── scheduler.db.backup_*    # Database backups
│   ├── schema.sql              # New schema definition
│   └── migrate.js              # Migration script
├── admin-client/               # React admin interface
│   ├── src/                    # React source files
│   │   ├── components/
│   │   │   ├── CalendarManager.jsx
│   │   │   └── ui/            # shadcn components
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── lib/utils.js
│   ├── dist/                   # Production build output
│   ├── package.json           # React dependencies
│   ├── vite.config.js         # Vite configuration
│   ├── tailwind.config.js     # Tailwind configuration
│   ├── postcss.config.js      # PostCSS configuration
│   └── components.json        # shadcn/ui configuration
├── views/                      # EJS templates
│   ├── admin.ejs              # Old admin (not used with React)
│   ├── schedule.ejs           # Public schedule view (UPDATED)
│   └── login.ejs              # Login page
├── public/                     # Static assets
│   ├── css/style.css          # Styles (with new .today class)
│   └── js/                    # (schedule.js removed)
├── package.json               # Main project dependencies
├── Dockerfile                 # Updated for React build
└── .dockerignore             # Docker ignore file
```

## Completed Refactoring Tasks (2025-07-09)

### ✅ 1. Public Page Update (`views/schedule.ejs`)
- Removed all Google Calendar event handling code
- Replaced with simple date marking system
- Added loading state
- Integrated with new public API endpoint
- Shows red background for scheduled dates
- Blue border for today's date
- Automatic 5-minute refresh

### ✅ 2. CSS Updates (`public/css/style.css`)
- Added `.calendar-day.today` class for today's date highlight
- Added `.calendar-day.today.has-schedule` for scheduled today
- Kept existing responsive design

### ✅ 3. Production Build Configuration
- Added build scripts to main `package.json`:
  ```json
  "build:client": "cd admin-client && npm run build",
  "build": "npm run build:client",
  "postinstall": "cd admin-client && npm install"
  ```
- Updated `server.js` to serve React build in production:
  ```javascript
  if (isProduction) {
    app.use('/admin', express.static(path.join(__dirname, 'admin-client', 'dist')));
  }
  ```
- Admin route now serves React app or redirects to dev server

### ✅ 4. Docker Configuration
- Updated `Dockerfile` to include React build:
  - Copies both server and client package.json
  - Installs dependencies for both
  - Builds React app during image creation
- Created `.dockerignore` to exclude unnecessary files

### ✅ 5. Frontend Build Dependencies
- Added missing packages:
  - `@tailwindcss/postcss` - Required for Tailwind v4
  - `class-variance-authority` - Used by shadcn/ui
- Updated `postcss.config.js` for new Tailwind PostCSS plugin

## Key Implementation Details

### 1. Authentication Flow
- Google OAuth still used but only for authentication
- No calendar permissions requested
- User info stored in `users` table with google_id
- Session-based authentication maintained

### 2. Calendar Management
- Users can create multiple calendars
- Each calendar has unique page_name for public URL
- No connection to Google Calendar
- Calendar metadata stored locally

### 3. Schedule Date Storage
- Simple date-only storage (no time/details)
- Dates stored as YYYY-MM-DD format
- Toggle mechanism for add/remove
- Bulk update for drag selection

### 4. Public Page Display
- Route: `/:pageName`
- Shows calendar with red background for scheduled dates
- No event details, just date marking
- Server-side rendering with client-side API fallback
- Responsive design maintained

### 5. Admin Interface
- Modern React SPA with Vite
- Uses shadcn/ui components:
  - Button, Card, Dialog, Calendar (date-picker base)
- Real-time calendar editing with visual feedback
- Drag selection for multiple dates
- Responsive grid layout

## Production Deployment

### Build Process
```bash
# Install all dependencies
npm install

# Build React app
npm run build

# Start production server
npm start
```

### Docker Deployment
```bash
# Build image
docker build -t tour-schedule .

# Run container
docker run -p 3000:3000 \
  -e GOOGLE_CLIENT_ID=xxx \
  -e GOOGLE_CLIENT_SECRET=xxx \
  -e SESSION_SECRET=xxx \
  -v $(pwd)/database:/app/database \
  tour-schedule
```

### Railway Deployment
- Push to repository
- Railway will automatically:
  1. Install dependencies
  2. Build React app
  3. Start Express server
- Ensure environment variables are set in Railway dashboard

## Common Development Tasks

### Adding New Features
1. **Database changes**: 
   - Update `database/schema.sql`
   - Create migration script if needed
   
2. **API changes**:
   - Add routes to `server.js`
   - Follow existing pattern for auth checks

3. **UI changes**:
   - React components in `admin-client/src/`
   - Use shadcn/ui components when possible

### Testing Different Scenarios
```bash
# Test with existing data
sqlite3 database/scheduler.db "SELECT * FROM calendars;"

# Test API endpoints
curl http://localhost:3000/api/calendar/1/dates
curl -X POST http://localhost:3000/api/calendar/1/dates \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-07-15"}'

# Test public page
open http://localhost:3000/pjj
```

### Database Operations
```bash
# Check current schema
sqlite3 database/scheduler.db ".schema"

# View data
sqlite3 database/scheduler.db "SELECT * FROM users;"
sqlite3 database/scheduler.db "SELECT * FROM calendars;"
sqlite3 database/scheduler.db "SELECT * FROM schedule_dates ORDER BY schedule_date;"

# Run migrations
node database/migrate.js

# Backup database
cp database/scheduler.db database/scheduler.db.backup
```

## Important Security Notes

1. **Google OAuth Changes**:
   - Calendar scope removed - update Google Cloud Console
   - Only profile and email scopes needed
   - Refresh tokens no longer needed for calendar access

2. **API Security**:
   - All `/admin/*` routes require authentication
   - Calendar ownership verified in all mutations
   - Public routes read-only

3. **Reserved Page Names**:
   Still enforced: `admin`, `auth`, `logout`, `privacy`, `api`, `login`, `css`, `js`, `images`

## Troubleshooting

### "Cannot find module 'googleapis'"
- This is expected - Google APIs were removed
- The import is commented out in server.js

### Admin page shows old interface
- Make sure React dev server is running (`cd admin-client && npm run dev`)
- Access admin at http://localhost:5173, not :3000/admin
- In production, ensure React app is built

### Schedule dates not saving
- Check browser console for API errors
- Verify calendar ownership in database
- Ensure date format is YYYY-MM-DD

### Build errors
- Ensure all dependencies installed: `npm install && cd admin-client && npm install`
- Check Node.js version (requires 18+)
- Delete node_modules and reinstall if needed

### Migration issues
- Original data had no google_id, migration creates placeholder
- Check `database/scheduler.db.backup_*` for original data
- Re-run migration if needed: `node database/migrate.js`

## Architecture Summary

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Google OAuth   │────▶│  Express.js     │────▶│    SQLite DB    │
│  (Login Only)   │     │    Server       │     │                 │
│                 │     │                 │     │  - users        │
└─────────────────┘     │  Port 3000     │     │  - calendars    │
                        │                 │     │  - schedule_    │
┌─────────────────┐     │                 │     │    dates        │
│                 │     │                 │     │                 │
│   React Admin   │────▶│  /admin/*       │     └─────────────────┘
│   (Vite Dev)    │     │  /api/*         │
│                 │     │                 │
│  Port 5173      │     │                 │
└─────────────────┘     │                 │
                        │                 │
┌─────────────────┐     │                 │
│                 │     │                 │
│  Public Pages   │────▶│  /:pageName     │
│  (EJS Views)    │     │                 │
│                 │     │                 │
└─────────────────┘     └─────────────────┘
```

This architecture provides:
- Clean separation of concerns
- Modern admin interface with React
- Simple public pages with server-side rendering
- No external API dependencies (except OAuth)
- Easy to deploy and maintain