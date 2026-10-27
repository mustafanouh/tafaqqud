import { memo, useState } from 'react'
import type { Assessment, Grade } from '../types/assessment'
import type { Student } from '../types/student'
import { formatScore, parseScoreInput } from '../utils/evaluation'

interface Props {
  student: Student
  assessment: Assessment
  grade: Grade | undefined
  onSave: (studentId: string, input: { score?: number | null; absent?: boolean }) => Promise<void>
}

/** سطر إدخال علامة طالب: الحفظ عند مغادرة الحقل أو الضغط على Enter */
function GradeRowComponent({ student, assessment, grade, onSave }: Props) {
  const saved = grade?.score !== null && grade?.score !== undefined ? formatScore(grade.score) : ''
  const [draft, setDraft] = useState(saved)
  const [syncedFrom, setSyncedFrom] = useState(saved)
  const [error, setError] = useState('')
  const absent = grade?.absent === true

  // مزامنة عند تغيير القيمة المحفوظة من الخارج (مثل وضع الغياب)
  if (saved !== syncedFrom) {
    setSyncedFrom(saved)
    setDraft(saved)
  }

  const commit = async () => {
    if (draft.trim() === saved) return setError('')
    try {
      if (draft.trim() === '') {
        await onSave(student.id, { score: null })
      } else {
        const n = parseScoreInput(draft)
        if (n === null) return setError('أدخل رقماً صحيحاً')
        if (n > assessment.maxScore) return setError(`الحد الأعلى ${formatScore(assessment.maxScore)}`)
        await onSave(student.id, { score: n })
      }
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر الحفظ')
    }
  }

  return (
    <li className={`card p-3 ${absent ? 'bg-gray-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-lg font-bold break-words">{student.name}</p>
        <div className="flex items-center gap-1" dir="ltr">
          <input
            className="input w-24 text-center font-bold"
            inputMode="decimal"
            placeholder="—"
            value={absent ? '' : draft}
            disabled={absent}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
            aria-label={`علامة ${student.name}`}
          />
          <span className="text-sm text-gray-500">/ {formatScore(assessment.maxScore)}</span>
        </div>
      </div>
      <label className="mt-1 flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={absent}
          onChange={(e) => void onSave(student.id, { absent: e.target.checked })}
        />
        غائب عن هذا الاختبار
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </li>
  )
}

const GradeRow = memo(GradeRowComponent)
export default GradeRow
