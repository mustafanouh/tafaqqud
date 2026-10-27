import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, FileText } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import GradeTrend from '../components/GradeTrend'
import StatusBadge from '../components/StatusBadge'
import { loadStudentProfile } from '../services/studentProfileService'
import { downloadStudentReportPdf } from '../services/studentPdfService'
import { ASSESSMENT_TYPE_LABEL } from '../types/assessment'
import { formatDateAr } from '../utils/date'
import { formatScore } from '../utils/evaluation'

const ATTENDANCE_PREVIEW = 15

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString('ar-SY')}٪`)
const num = (v: number | null) => (v === null ? '—' : formatScore(Math.round(v * 10) / 10))

function percentColor(p: number | null) {
  if (p === null) return 'text-gray-500'
  if (p >= 85) return 'text-green-700'
  if (p >= 50) return 'text-teal-700'
  return 'text-red-700'
}

export default function StudentProfilePage() {
  const { studentId = '' } = useParams()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showAllAttendance, setShowAllAttendance] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const profile = useLiveQuery(() => loadStudentProfile(studentId, { from: from || undefined, to: to || undefined }), [studentId, from, to])

  useEffect(() => {
    setShowAllAttendance(false)
  }, [studentId])

  const exportPdf = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await downloadStudentReportPdf(studentId, { from: from || undefined, to: to || undefined })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء التقرير')
    } finally {
      setBusy(false)
    }
  }

  if (profile === undefined) return <p className="text-gray-500">جارٍ التحميل…</p>
  if (profile === null) return <EmptyState title="الطالب غير موجود" action={<Link to="/students" className="btn-primary">العودة للطلاب</Link>} />

  const { student, attendanceStats: st, evaluation: ev } = profile
  const attendance = showAllAttendance ? profile.attendance : profile.attendance.slice(0, ATTENDANCE_PREVIEW)
  const notes = profile.attendance.filter((e) => e.record.note)

  return (
    <div className="space-y-4">
      <Link to="/students" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-teal-700">
        <ArrowRight size={16} aria-hidden /> الطلاب
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold break-words">
            {student.name}
            {student.active === 0 && <span className="ms-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs">معطّل</span>}
          </h2>
          {student.notes && <p className="text-sm text-gray-600 break-words">{student.notes}</p>}
          {student.active === 0 && student.deactivationNote && <p className="text-sm text-gray-600 break-words">سبب التعطيل: {student.deactivationNote}</p>}
        </div>
        <button className="btn-primary px-4" onClick={exportPdf} disabled={busy}>
          <FileText size={18} aria-hidden /> {busy ? 'جارٍ التجهيز…' : 'تقرير الطالب PDF'}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      <section className="card space-y-2 p-3">
        <p className="text-sm font-semibold text-gray-700">الفترة (تُطبَّق على الصفحة والتقرير)</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs font-semibold text-gray-600">
            من
            <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-semibold text-gray-600">
            إلى
            <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {(from || to) && (
          <button className="text-sm font-bold text-teal-700 underline" onClick={() => { setFrom(''); setTo('') }}>
            عرض كل الفترات
          </button>
        )}
      </section>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile label="نسبة الحضور" value={pct(profile.attendanceRate)} cls={percentColor(profile.attendanceRate)} />
        <Tile label="متوسط العلامات" value={pct(profile.overallSummary.averagePercent)} cls={percentColor(profile.overallSummary.averagePercent)} />
        <Tile label="متوسط السلوك" value={num(ev.averageBehavior)} cls="text-teal-700" />
      </div>

      <section className="card space-y-2 p-4">
        <h3 className="font-bold">الحضور</h3>
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <Tile label="الأيام" value={st.total.toLocaleString('ar-SY')} />
          <Tile label="حاضر" value={st.present.toLocaleString('ar-SY')} cls="text-green-700" />
          <Tile label="متأخر" value={st.late.toLocaleString('ar-SY')} cls="text-orange-700" />
          <Tile label="غائب" value={st.absent.toLocaleString('ar-SY')} cls="text-red-700" />
        </div>
        {profile.attendance.length === 0 ? (
          <p className="text-sm text-gray-600">لا توجد سجلات حضور في هذه الفترة.</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {attendance.map(({ day, record }) => (
                <li key={record.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link to={`/history/${day.id}`} className="font-semibold hover:underline">
                    {formatDateAr(day.date)}
                  </Link>
                  <StatusBadge status={record.status} />
                </li>
              ))}
            </ul>
            {profile.attendance.length > ATTENDANCE_PREVIEW && (
              <button className="btn-secondary w-full" onClick={() => setShowAllAttendance((v) => !v)}>
                {showAllAttendance ? 'عرض أقل' : `عرض الكل (${profile.attendance.length.toLocaleString('ar-SY')})`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="card space-y-2 p-4">
        <h3 className="font-bold">التقييم اليومي</h3>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          <Tile label="متوسط الإملاء" value={num(ev.averageDictation)} />
          <Tile label="متوسط السلوك" value={num(ev.averageBehavior)} />
          <Tile label="وظيفة: كتب" value={ev.homeworkDone.toLocaleString('ar-SY')} cls="text-green-700" />
          <Tile label="جزئياً" value={ev.homeworkPartial.toLocaleString('ar-SY')} cls="text-orange-700" />
          <Tile label="لم يكتب" value={ev.homeworkNone.toLocaleString('ar-SY')} cls="text-red-700" />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">العلامات</h3>
        {profile.grades.length === 0 ? (
          <EmptyState title="لا توجد علامات" text="ستظهر هنا المذاكرات والامتحانات عند تسجيلها." />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Tile label={`مذاكرات (${profile.quizSummary.count.toLocaleString('ar-SY')})`} value={pct(profile.quizSummary.averagePercent)} cls={percentColor(profile.quizSummary.averagePercent)} />
              <Tile label={`امتحانات (${profile.examSummary.count.toLocaleString('ar-SY')})`} value={pct(profile.examSummary.averagePercent)} cls={percentColor(profile.examSummary.averagePercent)} />
              <Tile label="الأفضل / الأدنى" value={`${pct(profile.overallSummary.bestPercent)} / ${pct(profile.overallSummary.worstPercent)}`} />
            </div>
            <GradeTrend rows={profile.grades} />
            <ul className="space-y-2">
              {profile.grades.map(({ assessment, grade, percent }) => (
                <li key={assessment.id}>
                  <Link to={`/grades/${assessment.id}`} className="card flex items-center justify-between gap-2 p-3 hover:bg-gray-50">
                    <div className="min-w-0">
                      <p className="font-bold break-words">
                        <span className={`me-2 rounded-full px-2 py-0.5 text-xs ${assessment.type === 'exam' ? 'bg-purple-100 text-purple-800' : 'bg-teal-100 text-teal-800'}`}>
                          {ASSESSMENT_TYPE_LABEL[assessment.type]}
                        </span>
                        {assessment.title}
                      </p>
                      <p className="text-sm text-gray-600">
                        {formatDateAr(assessment.date)}
                        {assessment.subject && ` · ${assessment.subject}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-center">
                      {grade?.absent ? (
                        <span className="text-sm font-semibold text-gray-500">غائب</span>
                      ) : grade && grade.score !== null ? (
                        <>
                          <p className={`font-bold ${percentColor(percent)}`}>
                            {formatScore(grade.score)} / {formatScore(assessment.maxScore)}
                          </p>
                          <p className="text-xs text-gray-500">{pct(percent)}</p>
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">لم تُدخل</span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {notes.length > 0 && (
        <section className="card space-y-2 p-4">
          <h3 className="font-bold">ملاحظات الحضور</h3>
          <ul className="space-y-2">
            {notes.map(({ day, record }) => (
              <li key={record.id} className="rounded-xl bg-gray-50 p-2 text-sm">
                <p className="text-xs font-semibold text-gray-500">{formatDateAr(day.date)}</p>
                <p className="break-words">{record.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tile({ label, value, cls = '' }: { label: string; value: string; cls?: string }) {
  return (
    <div className="card p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
    </div>
  )
}
