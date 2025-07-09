import { useState, useEffect } from 'react'
import axios from 'axios'
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function CalendarManager({ calendar, onUpdate }) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [scheduleDates, setScheduleDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const [dragMode, setDragMode] = useState(null) // 'add' or 'remove'

  useEffect(() => {
    loadScheduleDates()
  }, [calendar.id, currentMonth])

  const loadScheduleDates = async () => {
    try {
      const response = await axios.get(`/api/calendar/${calendar.id}/dates`, {
        params: {
          year: currentMonth.getFullYear(),
          month: currentMonth.getMonth() + 1
        }
      })
      setScheduleDates(response.data.dates || [])
    } catch (error) {
      console.error('Failed to load schedule dates:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleDate = async (date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    try {
      await axios.post(`/api/calendar/${calendar.id}/dates`, { date: dateStr })
      await loadScheduleDates()
      onUpdate()
    } catch (error) {
      console.error('Failed to toggle date:', error)
    }
  }

  const handleBulkUpdate = async (dates, mode) => {
    const dateStrings = dates.map(d => format(d, 'yyyy-MM-dd'))
    try {
      await axios.post(`/api/calendar/${calendar.id}/dates/bulk`, {
        dates: dateStrings,
        action: mode
      })
      await loadScheduleDates()
      onUpdate()
    } catch (error) {
      console.error('Failed to bulk update dates:', error)
    }
  }

  const handleMouseDown = (date, isScheduled) => {
    // 모바일에서는 기본 터치 동작 방지
    if (window.matchMedia('(hover: none)').matches) {
      return
    }
    setIsDragging(true)
    setDragStart(date)
    setDragEnd(date)
    setDragMode(isScheduled ? 'remove' : 'add')
  }
  
  const handleTouchStart = (date, isScheduled, e) => {
    // 터치 시작 시 즉시 드래그 모드 활성화
    e.preventDefault() // 기본 터치 동작 방지
    setIsDragging(true)
    setDragStart(date)
    setDragEnd(date)
    setDragMode(isScheduled ? 'remove' : 'add')
    
    // 현재 스크롤 위치와 너비 저장
    const scrollY = window.scrollY
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    
    // body의 스크롤 임시 비활성화
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.paddingRight = `${scrollbarWidth}px`
    document.body.classList.add('dragging')
  }
  
  const handleTouchMove = (e) => {
    if (!isDragging) return
    e.preventDefault()
    e.stopPropagation()
    
    // 터치 위치에서 엘리먼트 찾기
    const touch = e.touches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    if (element && element.dataset.date) {
      const date = new Date(element.dataset.date)
      setDragEnd(date)
    }
  }
  
  const handleTouchEnd = async (e) => {
    e.preventDefault()
    
    // 저장된 스크롤 위치 복원
    const scrollY = document.body.style.top
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.left = ''
    document.body.style.right = ''
    document.body.style.paddingRight = ''
    document.body.classList.remove('dragging')
    
    // 스크롤 위치 복원
    if (scrollY) {
      window.scrollTo(0, parseInt(scrollY || '0') * -1)
    }
    
    await handleMouseUp()
  }

  const handleMouseEnter = (date) => {
    if (isDragging) {
      setDragEnd(date)
    }
  }

  const handleMouseUp = async () => {
    if (isDragging && dragStart && dragEnd) {
      const start = dragStart < dragEnd ? dragStart : dragEnd
      const end = dragStart < dragEnd ? dragEnd : dragStart
      const dates = eachDayOfInterval({ start, end })
      
      if (dates.length > 0) {
        await handleBulkUpdate(dates, dragMode)
      }
    }
    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
    setDragMode(null)
  }

  const isDateScheduled = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return scheduleDates.includes(dateStr)
  }

  const isDateInDragRange = (date) => {
    if (!isDragging || !dragStart || !dragEnd) return false
    const start = dragStart < dragEnd ? dragStart : dragEnd
    const end = dragStart < dragEnd ? dragEnd : dragStart
    return date >= start && date <= end
  }

  const getDays = () => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start, end })
    
    // 달력을 일요일부터 시작하도록 앞쪽 패딩 추가
    const startDay = start.getDay()
    const paddingDays = Array(startDay).fill(null)
    
    return [...paddingDays, ...days]
  }

  const days = getDays()

  return (
    <div 
      className="calendar-manager-wrapper" 
      onMouseUp={handleMouseUp} 
      onMouseLeave={handleMouseUp}
      onTouchEnd={handleTouchEnd}
    >
      <div className="calendar-manager-header">
        <h2>{calendar.title}</h2>
        <p>클릭하거나 드래그하여 일정을 표시하세요</p>
        <div className="month-nav">
          <button
            type="button"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            onTouchEnd={(e) => {
              e.preventDefault()
              setCurrentMonth(subMonths(currentMonth, 1))
            }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3>
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </h3>
          <button
            type="button"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            onTouchEnd={(e) => {
              e.preventDefault()
              setCurrentMonth(addMonths(currentMonth, 1))
            }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="calendar-grid" onTouchMove={handleTouchMove}>
        <div className="calendar-weekdays">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
            <div 
              key={day} 
              className="calendar-weekday"
            >
              {day}
            </div>
          ))}
          
        </div>
        
        <div className="calendar-days">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} />
            }
            
            const isScheduled = isDateScheduled(date)
            const isInDragRange = isDateInDragRange(date)
            
            const dayOfWeek = date.getDay()
            const isSunday = dayOfWeek === 0
            const isSaturday = dayOfWeek === 6
            
            return (
              <div
                key={date.toISOString()}
                data-date={date.toISOString()}
                className={`
                  calendar-day
                  ${isScheduled && !isInDragRange ? 'scheduled' : ''}
                  ${isInDragRange ? 'in-drag-range' : ''}
                  ${!isSameMonth(date, currentMonth) ? 'opacity-30' : ''}
                  ${isSunday ? 'sunday' : ''}
                  ${isSaturday ? 'saturday' : ''}
                `}
                onMouseDown={() => handleMouseDown(date, isScheduled)}
                onMouseEnter={() => handleMouseEnter(date)}
                onTouchStart={(e) => handleTouchStart(date, isScheduled, e)}
                onClick={() => !isDragging && toggleDate(date)}
              >
                {format(date, 'd')}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default CalendarManager