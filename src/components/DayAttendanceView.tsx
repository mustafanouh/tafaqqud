import { useMemo, useState } from 'react'
import { CheckCheck, Download, Printer } from 'lucide-react'
import { useDayView } from '../hooks/useDailyAttendance'
import { attendanceService } from '../services/attendanceService'
import { downloadAttendancePdf } from '../services/pdfReportService'
import { STATUS_LABEL, type RecordStatus } from '../types/attendance'
import { formatDateAr } from '../utils/date'
import { normalizeName } from '../utils/normalizeName'
import AttendanceSummary from './AttendanceSummary'
import ConfirmDialog from './ConfirmDialog'
import EmptyState from './EmptyState'
import SearchInput from './SearchInput'
import StudentCard from './StudentCard'
import StudentEvaluationCard from './StudentEvaluationCard'

type Filter = 'all' | RecordStatus
type ViewMode = 'attendance' | 'evaluation'

export default function DayAttendanceView({ dayId }: { dayId: string }) {
  const view = useDayView(dayId)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [unmarkedCount, setUnmarkedCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<ViewMode>('attendance')
  const [evaluationInfo, setEvaluationInfo] = useState('')

  const [pendingStatusChange, setPendingStatusChange] = useState<{
    studentId: string
    studentName: string
    currentStatus: RecordStatus
    newStatus: RecordStatus
  } | null>(null)

  const rows = useMemo(() => {
    if (!view) return []
    const q = normalizeName(query)
    return view.rows.filter(
      (r) => (filter === 'all' || r.record.status === filter) && (!q || r.student.normalizedName.includes(q)),
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

  const handleRequestStatusChange = (
    studentId: string,
    studentName: string,
    currentStatus: RecordStatus,
    newStatus: RecordStatus,
  ) => {
    if (newStatus === currentStatus) return

    if (confirmed) {
      setPendingStatusChange({
        studentId,
        studentName,
        currentStatus,
        newStatus,
      })
    } else {
      guard(() => attendanceService.setStatus(day.id, studentId, newStatus))
    }
  }

  const confirmStatusChange = async () => {
    if (!pendingStatusChange || busy) return
    const { studentId, newStatus } = pendingStatusChange
    setBusy(true)
    await guard(async () => {
      await attendanceService.setStatus(day.id, studentId, newStatus)
      setPendingStatusChange(null)
    })
    setBusy(false)
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

  const exportPdf = async () => {
    if (busy) return
    setBusy(true)
    await guard(() => downloadAttendancePdf(day.id))
    setBusy(false)
  }

  const saveDayOption = (option: 'hasDictation' | 'hasHomework', value: boolean) =>
    guard(() => attendanceService.setDayOptions(day.id, { [option]: value }))

  const markHomeworkDone = () =>
    guard(async () => {
      const count = await attendanceService.markAllHomeworkDone(day.id)
      setEvaluationInfo(`تم تحديد الوظيفة «كتب» لـ ${count.toLocaleString('ar-SY')} طالب`)
    })

  const evaluationRows = view.rows.filter((row) => row.record.status === 'present' || row.record.status === 'late')
  const notEvaluatedCount = view.rows.length - evaluationRows.length

  const filterOptions: {
    key: Filter
    label: string
    count: number
    activeCls: string
  }[] = [
    { key: 'all', label: 'الكل', count: stats.total, activeCls: 'bg-teal-700 border-teal-700 text-white' },
    { key: 'present', label: 'الحاضرون', count: stats.present, activeCls: 'bg-green-700 border-green-700 text-white' },
    { key: 'late', label: 'المتأخرون', count: stats.late, activeCls: 'bg-orange-600 border-orange-600 text-white' },
    { key: 'absent', label: 'الغائبون', count: stats.absent, activeCls: 'bg-red-700 border-red-700 text-white' },
  ]

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
            <span className="hidden sm:inline">طباعة</span>
          </button>
          <button className="btn-primary px-4" onClick={exportPdf} disabled={busy} aria-label="تنزيل PDF">
            <Download size={18} aria-hidden />
            <span>{busy ? 'جارٍ التجهيز…' : 'تنزيل PDF'}</span>
          </button>
        </div>
      </div>

      <AttendanceSummary stats={stats} />

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      <div className="no-print grid grid-cols-2 gap-2">
        <button className={mode === 'attendance' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('attendance')}>حضور</button>
        <button className={mode === 'evaluation' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('evaluation')}>تقييم</button>
      </div>

      {mode === 'attendance' ? <div className="no-print space-y-2">
        <SearchInput value={query} onChange={setQuery} />
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 sm:flex-wrap" role="tablist" aria-label="تصفية الطلاب حسب الحالة">
          {filterOptions.map(({ key, label, count, activeCls }) => {
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(key)}
                className={`inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold border transition-all ${
                  active
                    ? `${activeCls} shadow-sm`
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                <span>{label}</span>
                <span
                  className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                    active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {count.toLocaleString('ar-SY')}
                </span>
              </button>
            )
          })}
        </div>
        {!confirmed && (
          <button className="btn-primary w-full" onClick={openConfirm} disabled={busy}>
            <CheckCheck size={18} aria-hidden /> اعتماد التفقد
          </button>
        )}
      </div> : (
        <div className="no-print space-y-3">
          <div className="card space-y-2 p-3">
            <label className="flex min-h-[44px] items-center justify-between gap-2 font-semibold">
              يوجد إملاء اليوم
              <input type="checkbox" className="h-5 w-5" checked={day.hasDictation} onChange={(event) => saveDayOption('hasDictation', event.target.checked)} />
            </label>
            <label className="flex min-h-[44px] items-center justify-between gap-2 font-semibold">
              يوجد وظيفة اليوم
              <input type="checkbox" className="h-5 w-5" checked={day.hasHomework} onChange={(event) => saveDayOption('hasHomework', event.target.checked)} />
            </label>
          </div>
          <SearchInput value={query} onChange={setQuery} />
          {day.hasHomework && <button className="btn-secondary w-full" onClick={markHomeworkDone}>الكل كتب الوظيفة</button>}
          {evaluationInfo && <p className="rounded-xl bg-green-50 p-2 text-sm text-green-800">{evaluationInfo}</p>}
          <p className="text-sm text-gray-600">لا يُقيَّم {notEvaluatedCount.toLocaleString('ar-SY')} طالب لأنهم غير حاضرين</p>
          {evaluationRows.length === 0 ? <EmptyState title="لا يوجد طلاب حاضرون للتقييم" /> : (
            <ul className="space-y-2">
              {evaluationRows.filter(({ student }) => !normalizeName(query) || student.normalizedName.includes(normalizeName(query))).map(({ record, student }) => (
                <StudentEvaluationCard key={record.id} student={student} record={record} hasDictation={day.hasDictation} hasHomework={day.hasHomework} onChange={(evaluation) => guard(() => attendanceService.setEvaluation(day.id, student.id, evaluation))} />
              ))}
            </ul>
          )}
        </div>
      )}

      {mode === 'attendance' && (rows.length === 0 ? (
        <EmptyState title={view.rows.length === 0 ? 'لا يوجد طلاب في هذا اليوم' : 'لا توجد نتائج'} />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ record, student }) => (
            <StudentCard
              key={`${record.id}-${record.updatedAt}`}
              student={student}
              record={record}
              onStatus={(s: RecordStatus) =>
                handleRequestStatusChange(student.id, student.name, record.status, s)
              }
              onNote={(n) => guard(() => attendanceService.setNote(day.id, student.id, n))}
            />
          ))}
        </ul>
      ))}

      {/* جدول مخصص للطباعة فقط */}
      <table className="hidden w-full border-collapse text-sm print:table">
        <thead>
          <tr>
            <th className="border p-1 text-start">الرقم</th>
            <th className="border p-1 text-start">الاسم</th>
            <th className="border p-1 text-start">الحالة</th>
            <th className="border p-1 text-start">ملاحظة</th>
            {day.hasDictation && <th className="border p-1 text-start">الإملاء</th>}
            {day.hasHomework && <th className="border p-1 text-start">الوظيفة</th>}
            <th className="border p-1 text-start">السلوك</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map(({ record, student }, index) => (
            <tr key={record.id}>
              <td className="border p-1">{index + 1}</td>
              <td className="border p-1">{student.name}</td>
              <td className="border p-1">{STATUS_LABEL[record.status]}</td>
              <td className="border p-1">{record.note}</td>
              {day.hasDictation && <td className="border p-1">{record.status === 'present' || record.status === 'late' ? record.dictationScore ?? '—' : '—'}</td>}
              {day.hasHomework && <td className="border p-1">{record.status === 'present' || record.status === 'late' ? record.homework ?? '—' : '—'}</td>}
              <td className="border p-1">{record.status === 'present' || record.status === 'late' ? record.behaviorScore ?? 10 : '—'}</td>
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

      <ConfirmDialog
        open={Boolean(pendingStatusChange)}
        title="تأكيد تغيير حالة الطالب"
        confirmLabel="تأكيد التغيير"
        cancelLabel="إلغاء"
        busy={busy}
        onConfirm={confirmStatusChange}
        onCancel={() => setPendingStatusChange(null)}
      >
        {pendingStatusChange && (
          <div className="space-y-3">
            <p className="text-gray-700">
              هذا التفقد معتمد مسبقاً. هل تريد بالتأكيد تغيير حالة الطالب{' '}
              <strong className="text-gray-900">{pendingStatusChange.studentName}</strong>؟
            </p>
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
              <div>
                <span className="block text-xs text-gray-500">الحالة السابقة</span>
                <span className="font-bold text-gray-800">
                  {STATUS_LABEL[pendingStatusChange.currentStatus]}
                </span>
              </div>
              <span className="font-bold text-lg text-gray-400">←</span>
              <div>
                <span className="block text-xs text-gray-500">الحالة الجديدة</span>
                <span className="font-bold text-teal-700">
                  {STATUS_LABEL[pendingStatusChange.newStatus]}
                </span>
              </div>
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
