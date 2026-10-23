import { CalendarDays } from 'lucide-react'
import { formatDateAr, todayLocal } from '../utils/date'

export default function AppHeader() {
  return (
    <header className="no-print sticky top-0 z-20 bg-teal-700 text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <h1 className="text-xl font-bold">تفقد</h1>
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays size={18} aria-hidden />
          <span>{formatDateAr(todayLocal())}</span>
        </div>
      </div>
    </header>
  )
}
