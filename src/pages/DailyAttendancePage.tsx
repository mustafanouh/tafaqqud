import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CalendarX2 } from 'lucide-react'
import DayAttendanceView from '../components/DayAttendanceView'
import EmptyState from '../components/EmptyState'
import { db } from '../db/database'
import { attendanceService } from '../services/attendanceService'
import { formatDateAr, getWeekendDayName, isWeekend } from '../utils/date'
import { useToday } from '../hooks/useToday'

export default function DailyAttendancePage() {
  const today = useToday()
  const isTodayWeekend = isWeekend(today)
  const weekendName = getWeekendDayName(today)

  const state = useLiveQuery(async () => {
    const day = await db.attendanceDays.where('date').equals(today).first()
    const activeStudents = await db.students.where('active').equals(1).count()
    const previousDrafts = await attendanceService.unconfirmedDaysBefore(today)
    return { day, activeStudents, previousDrafts }
  }, [today])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!state) return <p className="text-gray-500">جارٍ التحميل…</p>

  const start = async () => {
    if (busy) return
    if (isTodayWeekend) {
      setError(`اليوم عطلة أسبوعية (${weekendName})، لا يمكن بدء تفقد جديد في أيام الجمعة والسبت.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      await attendanceService.startOrGetDay(today)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر بدء التفقد')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {isTodayWeekend && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900 shadow-sm">
          <CalendarX2 size={22} className="mt-0.5 shrink-0 text-amber-700" aria-hidden />
          <div>
            <p className="font-bold">اليوم عطلة ({weekendName})</p>
            <p className="mt-0.5 text-sm text-amber-800">
              اليوم عطلة أسبوعية رسمية (الجمعة والسبت). لا يتم تسجيل تفقد للطلاب في أيام العطلة.
            </p>
          </div>
        </div>
      )}

      {state.previousDrafts.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-orange-900">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            يوجد تفقد سابق غير معتمد ({formatDateAr(state.previousDrafts[0].date)}).{' '}
            <Link to={`/history/${state.previousDrafts[0].id}`} className="font-bold underline">
              فتحه
            </Link>
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      {state.day ? (
        <DayAttendanceView dayId={state.day.id} />
      ) : state.activeStudents === 0 ? (
        <EmptyState
          title="لا يوجد طلاب بعد"
          text="أضف أسماء الطلاب أولاً ثم ابدأ التفقد."
          action={
            <Link to="/students" className="btn-primary">
              إضافة الطلاب
            </Link>
          }
        />
      ) : isTodayWeekend ? (
        <EmptyState
          title="اليوم عطلة"
          text={`${formatDateAr(today)} — عطلة أسبوعية (${weekendName}). تم إيقاف زر بدء التفقد.`}
          action={
            <button
              className="btn-primary cursor-not-allowed opacity-50 bg-gray-400 hover:bg-gray-400 border-gray-400 text-white shadow-none pointer-events-none"
              disabled
              title={`اليوم عطلة (${weekendName})`}
            >
              بدء تفقد اليوم (عطلة)
            </button>
          }
        />
      ) : (
        <EmptyState
          title="لم يبدأ تفقد اليوم"
          text={`${formatDateAr(today)} — ${state.activeStudents.toLocaleString('ar-SY')} طالب نشط`}
          action={
            <button className="btn-primary" onClick={start} disabled={busy}>
              بدء تفقد اليوم
            </button>
          }
        />
      )}
    </div>
  )
}

