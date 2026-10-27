import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Plus } from 'lucide-react'
import AssessmentForm from '../components/AssessmentForm'
import EmptyState from '../components/EmptyState'
import SearchInput from '../components/SearchInput'
import { db } from '../db/database'
import { gradeService, type AssessmentInput } from '../services/gradeService'
import { ASSESSMENT_TYPE_LABEL, type AssessmentType } from '../types/assessment'
import { formatDateAr } from '../utils/date'
import { formatScore } from '../utils/evaluation'

type Filter = 'all' | AssessmentType

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'quiz', label: 'المذاكرات' },
  { key: 'exam', label: 'الامتحانات' },
]

export default function GradesPage() {
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const assessments = await db.assessments.toArray()
    const grades = await db.grades.toArray()
    const stats = new Map<string, { entered: number; sum: number; total: number }>()
    for (const g of grades) {
      const s = stats.get(g.assessmentId) ?? { entered: 0, sum: 0, total: 0 }
      s.total++
      if (g.score !== null && !g.absent) {
        s.entered++
        s.sum += g.score
      }
      stats.set(g.assessmentId, s)
    }
    return { assessments, stats, studentCount: await db.students.where('active').equals(1).count() }
  }, [])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const items = useMemo(() => {
    const q = query.trim()
    return (data?.assessments ?? [])
      .filter((a) => (filter === 'all' || a.type === filter) && (!q || a.title.includes(q) || a.subject.includes(q) || a.date.includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [data, filter, query])

  const create = async (input: AssessmentInput) => {
    setBusy(true)
    setError('')
    try {
      const a = await gradeService.createAssessment(input)
      navigate(`/grades/${a.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء الاختبار')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <p className="text-gray-500">جارٍ التحميل…</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">العلامات</h2>
        {!creating && (
          <button className="btn-primary px-4" onClick={() => setCreating(true)} disabled={data.studentCount === 0}>
            <Plus size={18} aria-hidden /> اختبار جديد
          </button>
        )}
      </div>

      {data.studentCount === 0 && (
        <EmptyState
          title="لا يوجد طلاب بعد"
          text="أضف الطلاب أولاً ثم أنشئ المذاكرات والامتحانات."
          action={
            <Link to="/students" className="btn-primary">
              إضافة الطلاب
            </Link>
          }
        />
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      {creating && (
        <section className="card p-4">
          <h3 className="mb-2 font-bold">اختبار جديد</h3>
          <AssessmentForm submitLabel="إنشاء وإدخال العلامات" busy={busy} onSubmit={create} onCancel={() => setCreating(false)} />
        </section>
      )}

      <SearchInput value={query} onChange={setQuery} placeholder="بحث بالعنوان أو المادة أو التاريخ…" />
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="تصفية حسب النوع">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`inline-flex min-h-[44px] shrink-0 items-center rounded-xl border px-4 text-sm font-semibold ${
              filter === key ? 'border-teal-700 bg-teal-700 text-white' : 'border-gray-200 bg-white text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState title={data.assessments.length === 0 ? 'لا توجد مذاكرات أو امتحانات' : 'لا توجد نتائج'} text={data.assessments.length === 0 ? 'أنشئ أول اختبار لتبدأ بتسجيل العلامات.' : undefined} />
      ) : (
        <ul className="space-y-2">
          {items.map((a) => {
            const s = data.stats.get(a.id) ?? { entered: 0, sum: 0, total: 0 }
            const avg = s.entered ? s.sum / s.entered : null
            return (
              <li key={a.id}>
                <Link to={`/grades/${a.id}`} className="card flex items-center justify-between gap-2 p-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="font-bold break-words">
                      <span className={`me-2 rounded-full px-2 py-0.5 text-xs ${a.type === 'exam' ? 'bg-purple-100 text-purple-800' : 'bg-teal-100 text-teal-800'}`}>
                        {ASSESSMENT_TYPE_LABEL[a.type]}
                      </span>
                      {a.title}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatDateAr(a.date)}
                      {a.subject && ` · ${a.subject}`}
                    </p>
                    <p className="text-sm text-gray-700">
                      أُدخلت {s.entered.toLocaleString('ar-SY')} من {s.total.toLocaleString('ar-SY')}
                      {avg !== null && ` · المتوسط ${formatScore(avg)} من ${formatScore(a.maxScore)}`}
                    </p>
                  </div>
                  <ChevronLeft size={20} className="shrink-0 text-gray-400" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
