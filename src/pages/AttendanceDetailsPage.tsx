import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import DayAttendanceView from '../components/DayAttendanceView'

export default function AttendanceDetailsPage() {
  const { dayId } = useParams()
  return (
    <div className="space-y-3">
      <Link to="/history" className="no-print inline-flex min-h-[44px] items-center gap-1 font-semibold text-teal-700">
        <ArrowRight size={18} aria-hidden /> سجل الأيام
      </Link>
      {dayId ? <DayAttendanceView dayId={dayId} /> : null}
    </div>
  )
}
