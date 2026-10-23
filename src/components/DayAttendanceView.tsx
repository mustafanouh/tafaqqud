import { useMemo, useState } from 'react'
import { CheckCheck, Download, Printer } from 'lucide-react'
import { useDayView } from '../hooks/useDailyAttendance'
import { attendanceService } from '../services/attendanceService'
import { buildDayCsv } from '../services/backupService'
import { STATUS_LABEL, type RecordStatus } from '../types/attendance'
import { downloadText } from '../utils/csv'
import { formatDateAr } from '../utils/date'
import { normalizeName } from '../utils/normalizeName'
import AttendanceSummary from './AttendanceSummary'
import ConfirmDialog from './ConfirmDialog'
import EmptyState from './EmptyState'
import SearchInput from './SearchInput'
import StudentCard from './StudentCard'

type Filter = 'all' | 'unmarked'

export default function DayAttendanceView({ dayId }: { dayId: string }) {
  const view = useDayView(dayId)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unmarkedCount, setUnmarkedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const rows = useMemo(() => {
    if (!view) return []
    const q = normalizeName(query)
    return view.rows.filter(
      (r) => (filter === 'all' || r.record.status === 'unmarked') && (!q || r.student.normalizedName.includes(q)),
    )
  }, [view, query, filter])

  if (!view) return <p className="text-gray-500">جارٍ التحميل…</p>
  if (!view.day) return <EmptyState title="يوم التفقد غير موجود" />

  const { day, stats } = view
  const confirmed = day.status === 'confirmed'

  const guard = async (fn: () => Promise<void>) => {
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? `تعذر الحفظ: ${e.message}` : 'تعذر الحفظ')
    }
  }

  const openConfirm = () =>
    guard(async () => {
      setUnmarkedCount(await attendanceService.countUnmarked(day.id))
      setConfirmOpen(true)
    })

  const doConfirm = async () => {
    if (busy) return
    setBusy(true)
    await guard(async () => {
      await attendanceService.confirmDay(day.id)
      setConfirmOpen(false)
    })
    setBusy(false)
  }

  const exportCsv = () =>
    guard(async () => {
      const { filename, content } = await buildDayCsv(day.id)
      downloadText(filename, content, 'text/csv')
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{formatDateAr(day.date)}</h2>
          <span className={`text-sm font-semibold ${confirmed ? 'text-teal-700' : 'text-orange-700'}`}>
            {confirmed ? 'معتمد (يمكن التعديل)' : 'مسودة — لم يُعتمد بعد'}
          </span>
        </div>
        <div className="no-print flex gap-2">
          <button className="btn-secondary px-3" onClick={() => window.print()} aria-label="طباعة">
            <Printer size={18} aria-hidden />
          </button>
          <button className="btn-secondary px-3" onClick={exportCsv} aria-label="تصدير CSV">
            <Download size={18} aria-hidden />
          </button>
        </div>
      </div>

      <AttendanceSummary stats={stats} />

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      <div className="no-print space-y-2">
        <SearchInput value={query} onChange={setQuery} />
        <div className="grid grid-cols-2 gap-2">
          <button className={filter === 'all' ? 'btn-primary' : 'btn-secondary'} onClick={() => setFilter('all')}>
            الكل ({stats.total.toLocaleString('ar-SY')})
          </button>
          <button className={filter === 'unmarked' ? 'btn-primary' : 'btn-secondary'} onClick={() => setFilter('unmarked')}>
            غير المحددين ({stats.unmarked.toLocaleString('ar-SY')})
          </button>
        </div>
        {!confirmed && (
          <button className="btn-primary w-full" onClick={openConfirm} disabled={busy}>
            <CheckCheck size={18} aria-hidden /> اعتماد التفقد
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={view.rows.length === 0 ? 'لا يوجد طلاب في هذا اليوم' : 'لا توجد نتائج'} />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ record, student }) => (
            <StudentCard
              key={`${record.id}-${record.updatedAt}`}
              student={student}
              record={record}
              onStatus={(s: RecordStatus) => guard(() => attendanceService.setStatus(day.id, student.id, s))}
              onNote={(n) => guard(() => attendanceService.setNote(day.id, student.id, n))}
            />
          ))}
        </ul>
      )}

      {/* جدول مخصص للطباعة فقط */}
      <table className="hidden w-full border-collapse text-sm print:table">
        <thead>
          <tr>
            <th className="border p-1 text-start">الاسم</th>
            <th className="border p-1 text-start">الحالة</th>
            <th className="border p-1 text-start">ملاحظة</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map(({ record, student }) => (
            <tr key={record.id}>
              <td className="border p-1">{student.name}</td>
              <td className="border p-1">{STATUS_LABEL[record.status]}</td>
              <td className="border p-1">{record.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmDialog open={confirmOpen} title="اعتماد التفقد" confirmLabel="اعتماد" busy={busy} onConfirm={doConfirm} onCancel={() => setConfirmOpen(false)}>
        <p>
          {unmarkedCount > 0
            ? `سيتم تسجيل ${unmarkedCount.toLocaleString('ar-SY')} طالب غير محدد كغائبين. يبقى المحددون مسبقاً كما هم.`
            : 'جميع الطلاب محددون. سيصبح التفقد معتمداً ويمكنك التعديل لاحقاً.'}
        </p>
      </ConfirmDialog>
    </div>
  )
}
