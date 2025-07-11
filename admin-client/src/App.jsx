import { useState, useEffect } from 'react'
import axios from 'axios'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { CalendarIcon, Plus, Trash2, ExternalLink, LogOut } from 'lucide-react'
import CalendarManager from './components/CalendarManager'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [calendars, setCalendars] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCalendar, setSelectedCalendar] = useState(null)
  const [showNewCalendarDialog, setShowNewCalendarDialog] = useState(false)
  const [newCalendar, setNewCalendar] = useState({ page_name: '', title: '' })
  const [creating, setCreating] = useState(false)
  
  // iOS zoom fix and state reset when dialog closes
  useEffect(() => {
    if (!showNewCalendarDialog) {
      // Reset creating state
      setCreating(false)
      
      // Reset zoom on iOS when dialog closes
      if (window.innerWidth <= 768 && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, interactive-widget=resizes-content');
        }
        // Force layout recalculation
        document.body.style.zoom = '1.0001';
        setTimeout(() => {
          document.body.style.zoom = '';
        }, 100);
      }
    }
  }, [showNewCalendarDialog])
  
  // Force dialog position on mobile when dialog opens
  useEffect(() => {
    if (showNewCalendarDialog && window.innerWidth <= 768) {
      const interval = setInterval(() => {
        const dialog = document.querySelector('[data-radix-portal] [role="dialog"].new-calendar-dialog')
        if (dialog) {
          dialog.style.position = 'fixed'
          dialog.style.top = '20px'
          dialog.style.left = '50%'
          dialog.style.transform = 'translateX(-50%)'
          dialog.style.margin = '0'
          dialog.style.maxHeight = '70vh'
          dialog.style.width = 'calc(100vw - 40px)'
          dialog.style.maxWidth = '400px'
          dialog.style.zIndex = '999999'
          clearInterval(interval)
        }
      }, 10)
      
      return () => clearInterval(interval)
    }
  }, [showNewCalendarDialog])
  

  useEffect(() => {
    checkAuth()
  }, [])

  // Handle mobile keyboard visibility for dialog positioning
  useEffect(() => {
    if (!showNewCalendarDialog) return

    // Set CSS custom property for actual viewport height
    const setViewportHeight = () => {
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
    }

    // Visual Viewport API support for keyboard detection
    const handleViewportChange = () => {
      if (window.visualViewport) {
        const keyboardHeight = window.innerHeight - window.visualViewport.height
        document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
      }
    }

    setViewportHeight()
    handleViewportChange()

    // Add event listeners
    window.addEventListener('resize', setViewportHeight)
    window.addEventListener('orientationchange', setViewportHeight)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('scroll', handleViewportChange)

    return () => {
      window.removeEventListener('resize', setViewportHeight)
      window.removeEventListener('orientationchange', setViewportHeight)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('scroll', handleViewportChange)
      // Reset custom properties
      document.documentElement.style.removeProperty('--vh')
      document.documentElement.style.removeProperty('--keyboard-height')
    }
  }, [showNewCalendarDialog])

  const checkAuth = async () => {
    try {
      const response = await axios.get('/admin/api/user')
      if (response.data.user) {
        setUser(response.data.user)
        loadCalendars()
      } else {
        window.location.href = '/admin/login'
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      // If we get a 401 or any error, redirect to login
      if (error.response?.status === 401 || error) {
        window.location.href = '/admin/login'
      }
    } finally {
      setLoading(false)
    }
  }

  const loadCalendars = async () => {
    try {
      const response = await axios.get('/admin/api/calendars')
      const calendarsData = response.data.calendars || []
      setCalendars(calendarsData)
      
      // 캘린더가 있고 아직 선택된 캘린더가 없으면 첫 번째 캘린더 자동 선택
      if (calendarsData.length > 0 && !selectedCalendar) {
        setSelectedCalendar(calendarsData[0])
      }
    } catch (error) {
      console.error('Failed to load calendars:', error)
    }
  }

  const createCalendar = async () => {
    if (creating) return // 이미 요청 중이면 중복 요청 방지
    
    try {
      setCreating(true)
      const response = await axios.post('/admin/calendar', newCalendar)
      
      setShowNewCalendarDialog(false)
      setNewCalendar({ page_name: '', title: '' })
      
      // 캘린더 목록 다시 로드
      const calendarsResponse = await axios.get('/admin/api/calendars')
      const updatedCalendars = calendarsResponse.data.calendars || []
      setCalendars(updatedCalendars)
      
      // 새로 생성된 캘린더 자동 선택
      const newCalendarData = updatedCalendars.find(cal => cal.id === response.data.calendarId)
      if (newCalendarData) {
        setSelectedCalendar(newCalendarData)
      }
    } catch (error) {
      alert(error.response?.data?.error || '캘린더 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (newCalendar.page_name.trim() && newCalendar.title.trim()) {
      createCalendar()
    }
  }

  const deleteCalendar = async (id) => {
    if (!confirm('정말로 이 캘린더를 삭제하시겠습니까?')) return
    
    try {
      await axios.delete(`/admin/calendar/${id}`)
      
      // 삭제 후 캘린더 목록 업데이트
      const updatedCalendars = calendars.filter(cal => cal.id !== id)
      setCalendars(updatedCalendars)
      
      // 삭제된 캘린더가 선택된 캘린더였다면
      if (selectedCalendar?.id === id) {
        // 남은 캘린더가 있으면 첫 번째 캘린더 선택
        if (updatedCalendars.length > 0) {
          setSelectedCalendar(updatedCalendars[0])
        } else {
          setSelectedCalendar(null)
        }
      }
    } catch (error) {
      alert('캘린더 삭제 실패')
      // 실패 시 다시 로드
      loadCalendars()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="container-wrapper">
          <div className="header-content">
            <div className="header-left"></div>
            <h1 className="header-title">스케줄 관리자</h1>
            <div className="header-actions">
              <span className="user-email">{user?.email}</span>
              <Button className="btn-logout" size="sm" onClick={() => {
                // 개발 환경에서는 백엔드 서버로 직접 연결
                const logoutUrl = import.meta.env.DEV ? 'http://localhost:3000/logout' : '/logout';
                window.location.href = logoutUrl;
              }}>
                <LogOut className="logout-icon" />
                <span className="logout-text">로그아웃</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container-wrapper content-wrapper">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar List */}
          <div className="lg:col-span-1">
            <div className="calendar-list-container">
              <div className="calendar-list-header">
                <h2>내 캘린더</h2>
              <Dialog 
                open={showNewCalendarDialog} 
                onOpenChange={setShowNewCalendarDialog}
                modal={true}
              >
                <DialogTrigger asChild>
                  <Button className="btn-new-calendar" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    새 캘린더
                  </Button>
                </DialogTrigger>
                <DialogContent className="new-calendar-dialog" role="dialog">
                  <div className="dialog-header">
                    <DialogTitle>새 캘린더 만들기</DialogTitle>
                    <DialogDescription>공개 페이지에서 사용할 캘린더를 생성합니다.</DialogDescription>
                  </div>
                  <form className="dialog-form" id="create-calendar-form" onSubmit={handleFormSubmit}>
                    <div className="dialog-form-group">
                      <label>페이지 이름 (URL)</label>
                      <input
                        type="text"
                        placeholder="my-schedule"
                        value={newCalendar.page_name}
                        onChange={(e) => setNewCalendar({ ...newCalendar, page_name: e.target.value })}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        tabIndex="1"
                        inputMode="text"
                        required
                      />
                      <span className="help-text url-preview">
                        공개 URL: {window.location.origin}/{newCalendar.page_name || 'page-name'}
                      </span>
                    </div>
                    <div className="dialog-form-group">
                      <label>캘린더 제목</label>
                      <input
                        type="text"
                        placeholder="나의 일정"
                        value={newCalendar.title}
                        onChange={(e) => setNewCalendar({ ...newCalendar, title: e.target.value })}
                        tabIndex="2"
                        inputMode="text"
                        required
                      />
                    </div>
                  </form>
                  <div className="dialog-footer">
                    <Button variant="outline" onClick={() => setShowNewCalendarDialog(false)} tabIndex="4" type="button">
                      취소
                    </Button>
                    <Button className="btn-primary" onClick={createCalendar} tabIndex="3" type="submit" form="create-calendar-form" disabled={creating}>
                      {creating ? '생성 중...' : '생성'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2">
              {calendars.map((calendar) => (
                <div 
                  key={calendar.id} 
                  className={`calendar-card ${
                    selectedCalendar?.id === calendar.id ? 'selected' : ''
                  }`}
                  onClick={() => setSelectedCalendar(calendar)}
                >
                  <div className="calendar-card-header">
                    <div className="flex-1">
                      <h3 className="calendar-card-title">{calendar.title}</h3>
                      <p className="calendar-card-url">{window.location.origin}/{calendar.page_name}</p>
                    </div>
                    <div className="calendar-card-actions">
                      <Button
                        className="icon-button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          // Development 환경에서는 백엔드 서버 주소 사용
                          const baseUrl = import.meta.env.DEV ? 'http://localhost:3000' : ''
                          window.open(`${baseUrl}/${calendar.page_name}`, '_blank')
                        }}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        className="icon-button delete"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteCalendar(calendar.id)
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {calendars.length === 0 && (
                <p className="empty-calendar-list-text">
                  아직 캘린더가 없습니다.
                </p>
              )}
              </div>
            </div>
          </div>

          {/* Calendar Manager */}
          <div className="lg:col-span-3">
            {selectedCalendar ? (
              <CalendarManager 
                calendar={selectedCalendar} 
                onUpdate={() => loadCalendars()}
              />
            ) : (
              <div className="calendar-manager-wrapper">
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <CalendarIcon className="w-10 h-10" />
                  </div>
                  <h3 className="empty-state-title">캘린더를 선택하거나 새로 만드세요.</h3>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App