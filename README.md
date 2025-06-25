# 구글 캘린더 공개 스케줄러

구글 계정으로 로그인하여 캘린더를 선택하고, 누구나 접근 가능한 공개 스케줄 페이지를 생성할 수 있는 웹 애플리케이션입니다.

## 주요 기능

- **백오피스 관리 페이지**: 구글 로그인으로 캘린더 선택 및 관리
- **공개 스케줄 페이지**: 인증 없이 접근 가능한 일정 조회 페이지
- **실시간 동기화**: 구글 캘린더와 실시간 연동
- **반응형 디자인**: 모바일 및 데스크톱 최적화

## 시스템 요구사항

- Node.js 16.0.0 이상
- npm 또는 yarn
- 구글 클라우드 콘솔 프로젝트

## 설치 및 설정

### 1. 프로젝트 설치

```bash
# 의존성 설치
npm install

# 또는
yarn install
```

### 2. 구글 클라우드 콘솔 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. **API 및 서비스 > 라이브러리**에서 다음 API 활성화:
   - Google Calendar API
   - Google+ API (또는 Google People API)

4. **API 및 서비스 > 사용자 인증 정보**에서 OAuth 2.0 클라이언트 ID 생성:
   - 애플리케이션 유형: 웹 애플리케이션
   - 승인된 JavaScript 원본: `http://localhost:3000`
   - 승인된 리디렉션 URI: `http://localhost:3000/auth/google/callback`

### 3. 환경 변수 설정

`.env.example` 파일을 `.env`로 복사하고 구글 클라우드 콘솔에서 얻은 정보를 입력:

```bash
cp .env.example .env
```

`.env` 파일 내용:
```
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
SESSION_SECRET=your_random_session_secret_here
PORT=3000
```

### 4. 애플리케이션 실행

```bash
# 개발 모드
npm run dev

# 또는 프로덕션 모드
npm start
```

애플리케이션이 `http://localhost:3000`에서 실행됩니다.

## 사용 방법

### 관리자 페이지

1. `http://localhost:3000/admin`에 접속
2. "Google로 로그인" 버튼 클릭
3. 구글 계정 로그인 및 권한 승인
4. 공개할 캘린더 선택
5. 서브페이지 이름 입력 (예: `company-events`)
6. "스케줄 페이지 생성" 버튼 클릭

### 공개 스케줄 페이지

생성된 공개 URL (`http://localhost:3000/schedule/페이지이름`)로 접속하면 누구나 해당 캘린더의 일정을 볼 수 있습니다.

## 파일 구조

```
project/
├── server.js              # 메인 서버 파일
├── package.json           # 프로젝트 설정
├── .env                   # 환경 변수 (생성 필요)
├── .env.example          # 환경 변수 예시
├── database/
│   └── scheduler.db      # SQLite 데이터베이스 (자동 생성)
├── views/                # EJS 템플릿
│   ├── admin.ejs         # 관리자 페이지
│   ├── login.ejs         # 로그인 페이지
│   ├── schedule.ejs      # 공개 스케줄 페이지
│   └── error.ejs         # 에러 페이지
└── public/               # 정적 파일
    └── css/
        └── style.css     # 스타일시트
```

## 데이터베이스 스키마

SQLite 데이터베이스의 `schedules` 테이블:

| 필드 | 타입 | 설명 |
|------|------|------|
| id | INTEGER | 기본키 (자동 증가) |
| page_name | TEXT | 공개 페이지 이름 (고유값) |
| calendar_id | TEXT | 구글 캘린더 ID |
| calendar_name | TEXT | 캘린더 표시 이름 |
| user_email | TEXT | 관리자 이메일 |
| access_token | TEXT | 구글 API 액세스 토큰 |
| refresh_token | TEXT | 구글 API 리프레시 토큰 |
| created_at | DATETIME | 생성 시간 |

## API 엔드포인트

### 관리자 API
- `GET /admin` - 관리자 페이지
- `GET /admin/login` - 로그인 페이지
- `POST /admin/schedule` - 새 스케줄 생성
- `DELETE /admin/schedule/:id` - 스케줄 삭제

### 인증 API
- `GET /auth/google` - 구글 OAuth 시작
- `GET /auth/google/callback` - OAuth 콜백
- `GET /logout` - 로그아웃

### 공개 API
- `GET /schedule/:pageName` - 공개 스케줄 조회

## 보안 고려사항

- 구글 OAuth 2.0을 통한 안전한 인증
- 사용자별 토큰 분리 저장
- SQL 인젝션 방지를 위한 파라미터화된 쿼리 사용
- 환경 변수를 통한 민감 정보 관리

## 프로덕션 배포

### 환경 변수 수정
프로덕션 환경에서는 다음 설정을 변경해야 합니다:

1. 구글 클라우드 콘솔에서 승인된 도메인 추가
2. `.env` 파일의 URL들을 프로덕션 도메인으로 변경
3. `SESSION_SECRET`을 강력한 임의 문자열로 설정

### 권장 프로덕션 설정
```env
GOOGLE_CLIENT_ID=your_production_client_id
GOOGLE_CLIENT_SECRET=your_production_client_secret
SESSION_SECRET=very_long_random_string_for_production
PORT=3000
```

## 문제 해결

### 일반적인 문제

1. **구글 로그인 실패**
   - 구글 클라우드 콘솔에서 OAuth 2.0 설정 확인
   - 승인된 리디렉션 URI 정확성 확인

2. **캘린더 목록이 보이지 않음**
   - Google Calendar API 활성화 확인
   - 사용자 계정의 캘린더 권한 확인

3. **데이터베이스 오류**
   - `database/` 폴더 생성 확인
   - 파일 시스템 권한 확인

## 라이선스

ISC

## 기여

이슈 제보나 기능 제안은 GitHub Issues를 통해 해주세요.