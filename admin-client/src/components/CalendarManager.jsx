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


  const isDateScheduled = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return scheduleDates.includes(dateStr)
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
    <div className="calendar-manager-wrapper">
      <div className="calendar-manager-header">
        <h2>{calendar.title}</h2>
        <p>날짜를 클릭하여 일정을 표시하세요</p>
        <div className="month-nav">
          <button
            type="button"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3>
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </h3>
          <button
            type="button"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="calendar-grid">
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
            
            const dayOfWeek = date.getDay()
            const isSunday = dayOfWeek === 0
            const isSaturday = dayOfWeek === 6
            
            return (
              <div
                key={date.toISOString()}
                className={`
                  calendar-day
                  ${isScheduled ? 'scheduled' : ''}
                  ${!isSameMonth(date, currentMonth) ? 'opacity-30' : ''}
                  ${isSunday ? 'sunday' : ''}
                  ${isSaturday ? 'saturday' : ''}
                `}
                onClick={() => toggleDate(date)}
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