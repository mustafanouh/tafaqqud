import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle } from 'lucide-react'
import DayAttendanceView from '../components/DayAttendanceView'
import EmptyState from '../components/EmptyState'
import { db } from '../db/database'
import { attendanceService } from '../services/attendanceService'
import { formatDateAr, todayLocal } from '../utils/date'

export default function DailyAttendancePage() {
  const today = todayLocal()
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
