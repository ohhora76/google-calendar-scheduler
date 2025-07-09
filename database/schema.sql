-- 새로운 스케줄 관리 시스템 스키마
-- Google Calendar 연동을 제거하고 자체 스케줄 관리로 전환

-- 기존 테이블 삭제 (필요시)
DROP TABLE IF EXISTS schedule_dates;
DROP TABLE IF EXISTS calendars;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS schedules;

-- 사용자 테이블 (Google OAuth 로그인 정보)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,      -- Google OAuth ID
  email TEXT UNIQUE NOT NULL,          -- 사용자 이메일
  name TEXT,                           -- 사용자 이름
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);

-- 캘린더 테이블 (각 사용자가 여러 캘린더 생성 가능)
CREATE TABLE calendars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,            -- 소유자
  page_name TEXT UNIQUE NOT NULL,      -- 공개 URL (예: my-schedule)
  title TEXT NOT NULL,                 -- 캘린더 제목
  description TEXT,                    -- 설명
  is_public BOOLEAN DEFAULT 1,         -- 공개 여부
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 스케줄 날짜 테이블 (날짜별 스케줄 유무만 저장)
CREATE TABLE schedule_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL,
  schedule_date DATE NOT NULL,         -- 스케줄이 있는 날짜
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
  UNIQUE(calendar_id, schedule_date)   -- 중복 방지
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX idx_schedule_dates_calendar_date ON schedule_dates(calendar_id, schedule_date);
CREATE INDEX idx_calendars_page_name ON calendars(page_name);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email ON users(email);

-- 예약된 페이지 이름 체크를 위한 뷰 (선택사항)
-- 애플리케이션 레벨에서 처리할 수도 있음
CREATE VIEW reserved_page_names AS
SELECT 'admin' AS name
UNION SELECT 'auth'
UNION SELECT 'login'
UNION SELECT 'logout'
UNION SELECT 'api'
UNION SELECT 'public'
UNION SELECT 'css'
UNION SELECT 'js'
UNION SELECT 'images'
UNION SELECT 'privacy'
UNION SELECT 'error';