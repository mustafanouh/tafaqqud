import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, FileText, Pencil, Trash2 } from 'lucide-react'
import AssessmentForm from '../components/AssessmentForm'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import GradeRow from '../components/GradeRow'
import SearchInput from '../components/SearchInput'
import { db } from '../db/database'
import { downloadAssessmentReportPdf } from '../services/assessmentPdfService'
import { gradeService, toPercent, type AssessmentInput } from '../services/gradeService'
import { ASSESSMENT_TYPE_LABEL } from '../types/assessment'
import { formatDateAr } from '../utils/date'
import { formatScore } from '../utils/evaluation'
import { normalizeName } from '../utils/normalizeName'

export default function AssessmentPage() {
  const { assessmentId = '' } = useParams()
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const assessment = await db.assessments.get(assessmentId)
    if (!assessment) return { assessment: undefined, rows: [] }
    const grades = await db.grades.where('assessmentId').equals(assessmentId).toArray()
    const byStudent = new Map(grades.map((g) => [g.studentId, g]))
    const students = await db.students.toArray()
    // النشطون + أي طالب معطّل له علامة في هذا الاختبار
    const rows = students
      .filter((s) => s.active === 1 || byStudent.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      .map((student) => ({ student, grade: byStudent.get(student.id) }))
    return { assessment, rows }
  }, [assessmentId])

  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const exportPdf = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await downloadAssessmentReportPdf(assessmentId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء التقرير')
    } finally {
      setBusy(false)
    }
  }

  const save = useCallback(
    async (studentId: string, input: { score?: number | null; absent?: boolean }) => {
      setError('')
      try {
        await gradeService.setGrade(assessmentId, studentId, input)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذر الحفظ')
        throw e
      }
    },
    [assessmentId],
  )

  const visible = useMemo(() => {
    const q = normalizeName(query)
    return (data?.rows ?? []).filter((r) => !q || r.student.normalizedName.includes(q))
  }, [data, query])

  const summary = useMemo(() => {
    const a = data?.assessment
    if (!a) return null
    const scores = (data?.rows ?? []).flatMap((r) => (r.grade && r.grade.score !== null && !r.grade.absent ? [r.grade.score] : []))
    const absent = (data?.rows ?? []).filter((r) => r.grade?.absent).length
    const avg = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null
    return {
      entered: scores.length,
      absent,
      remaining: (data?.rows.length ?? 0) - scores.length - absent,
      avg,
      avgPercent: avg === null ? null : toPercent(avg, a.maxScore),
      max: scores.length ? Math.max(...scores) : null,
      min: scores.length ? Math.min(...scores) : null,
    }
  }, [data])

  const update = async (input: AssessmentInput) => {
    setBusy(true)
    setError('')
    try {
      await gradeService.updateAssessment(assessmentId, input)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await gradeService.deleteAssessment(assessmentId)
      navigate('/grades', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحذف')
      setDeleting(false)
      setBusy(false)
    }
  }

  if (!data) return <p className="text-gray-500">جارٍ التحميل…</p>
  const { assessment } = data
  if (!assessment || !summary) return <EmptyState title="الاختبار غير موجود" action={<Link to="/grades" className="btn-primary">العودة للعلامات</Link>} />

  return (
    <div className="space-y-3">
      <Link to="/grades" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-teal-700">
        <ArrowRight size={16} aria-hidden /> كل الاختبارات
      </Link>

      {editing ? (
        <section className="card p-4">
          <h3 className="mb-2 font-bold">تعديل الاختبار</h3>
          <AssessmentForm initial={assessment} submitLabel="حفظ التعديل" busy={busy} onSubmit={update} onCancel={() => setEditing(false)} />
        </section>
      ) : (
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold break-words">{assessment.title}</h2>
          <p className="text-sm text-gray-600">
            {ASSESSMENT_TYPE_LABEL[assessment.type]} · {formatDateAr(assessment.date)}
            {assessment.subject && ` · ${assessment.subject}`} · من {formatScore(assessment.maxScore)}
          </p>
          {assessment.note && <p className="text-sm text-gray-600 break-words">{assessment.note}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button className="btn-secondary px-3" aria-label="تعديل الاختبار" onClick={() => setEditing(true)}>
            <Pencil size={18} aria-hidden />
          </button>
          <button className="btn-secondary px-3 text-red-700" aria-label="حذف الاختبار" onClick={() => setDeleting(true)}>
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
      </div>
      )}

      <div className="card grid grid-cols-2 gap-2 p-3 text-center sm:grid-cols-4">
        <Stat label="المتوسط" value={summary.avg === null ? '—' : `${formatScore(summary.avg)}${summary.avgPercent !== null ? ` (${Math.round(summary.avgPercent)}٪)` : ''}`} />
        <Stat label="الأعلى" value={summary.max === null ? '—' : formatScore(summary.max)} />
        <Stat label="الأدنى" value={summary.min === null ? '—' : formatScore(summary.min)} />
        <Stat label="لم تُدخل / غائب" value={`${summary.remaining.toLocaleString('ar-SY')} / ${summary.absent.toLocaleString('ar-SY')}`} />
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      <button className="btn-primary w-full" onClick={exportPdf} disabled={busy}>
        <FileText size={18} aria-hidden /> {busy ? 'جارٍ التجهيز…' : 'تنزيل كشف العلامات PDF (كل الطلاب)'}
      </button>

      <SearchInput value={query} onChange={setQuery} />
      {visible.length === 0 ? (
        <EmptyState title="لا توجد نتائج" />
      ) : (
        <ul className="space-y-2">
          {visible.map(({ student, grade }) => (
            <GradeRow key={student.id} student={student} assessment={assessment} grade={grade} onSave={save} />
          ))}
        </ul>
      )}

      <ConfirmDialog open={deleting} title="حذف الاختبار؟" confirmLabel="حذف نهائي" danger busy={busy} onConfirm={remove} onCancel={() => setDeleting(false)}>
        <p>سيتم حذف الاختبار «{assessment.title}» وجميع علامات الطلاب فيه. لا يمكن التراجع.</p>
      </ConfirmDialog>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  )
}
