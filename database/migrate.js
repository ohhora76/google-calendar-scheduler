const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 데이터베이스 경로
const dbPath = path.join(__dirname, 'scheduler.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// 마이그레이션 실행
async function migrate() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔄 마이그레이션 시작...');
    
    // 스키마 파일 읽기
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    db.serialize(() => {
      // 트랜잭션 시작
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('❌ 트랜잭션 시작 실패:', err);
          reject(err);
          return;
        }
        
        // 기존 데이터 백업 (메모리에)
        db.all('SELECT * FROM schedules', (err, oldSchedules) => {
          if (err) {
            console.error('❌ 기존 데이터 읽기 실패:', err);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          console.log(`📊 기존 스케줄 ${oldSchedules.length}개 발견`);
          
          // 새 스키마 실행
          db.exec(schema, (err) => {
            if (err) {
              console.error('❌ 스키마 생성 실패:', err);
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            console.log('✅ 새 스키마 생성 완료');
            
            // 기존 데이터 마이그레이션
            let migratedCount = 0;
            const userMap = new Map(); // email -> user_id 매핑
            
            // 각 스케줄을 순차적으로 처리
            const processSchedule = (index) => {
              if (index >= oldSchedules.length) {
                // 모든 마이그레이션 완료
                db.run('COMMIT', (err) => {
                  if (err) {
                    console.error('❌ 커밋 실패:', err);
                    reject(err);
                  } else {
                    console.log(`✅ 마이그레이션 완료! ${migratedCount}개의 캘린더가 생성되었습니다.`);
                    db.close();
                    resolve();
                  }
                });
                return;
              }
              
              const schedule = oldSchedules[index];
              
              // 사용자 생성 또는 조회
              if (!userMap.has(schedule.user_email)) {
                // 기존 데이터에는 google_id가 없으므로 email을 기반으로 생성
                const googleId = `google_${schedule.user_email.replace('@', '_at_')}`;
                db.run(
                  'INSERT INTO users (google_id, email, name) VALUES (?, ?, ?)',
                  [googleId, schedule.user_email, schedule.user_email.split('@')[0]],
                  function(err) {
                    if (err && !err.message.includes('UNIQUE')) {
                      console.error('❌ 사용자 생성 실패:', err);
                      db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                    
                    userMap.set(schedule.user_email, this.lastID);
                    createCalendar();
                  }
                );
              } else {
                createCalendar();
              }
              
              function createCalendar() {
                const userId = userMap.get(schedule.user_email);
                
                // 캘린더 생성
                db.run(
                  'INSERT INTO calendars (user_id, page_name, title, description) VALUES (?, ?, ?, ?)',
                  [userId, schedule.page_name, schedule.calendar_name || schedule.page_name, '기존 Google Calendar에서 마이그레이션'],
                  function(err) {
                    if (err) {
                      console.error('❌ 캘린더 생성 실패:', err);
                      db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                    
                    migratedCount++;
                    console.log(`  ✓ 캘린더 마이그레이션: ${schedule.page_name}`);
                    
                    // 다음 스케줄 처리
                    processSchedule(index + 1);
                  }
                );
              }
            };
            
            // 첫 번째 스케줄부터 처리 시작
            if (oldSchedules.length > 0) {
              processSchedule(0);
            } else {
              // 마이그레이션할 데이터가 없는 경우
              db.run('COMMIT', (err) => {
                if (err) {
                  console.error('❌ 커밋 실패:', err);
                  reject(err);
                } else {
                  console.log('✅ 스키마 생성 완료 (마이그레이션할 데이터 없음)');
                  db.close();
                  resolve();
                }
              });
            }
          });
        });
      });
    });
  });
}

// 마이그레이션 실행
migrate()
  .then(() => {
    console.log('🎉 마이그레이션이 성공적으로 완료되었습니다!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 마이그레이션 중 오류 발생:', err);
    process.exit(1);
  });