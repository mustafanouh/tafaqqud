import { useState } from 'react'
import { ASSESSMENT_TYPE_LABEL, DEFAULT_MAX_SCORE, type Assessment, type AssessmentType } from '../types/assessment'
import type { AssessmentInput } from '../services/gradeService'
import { todayLocal } from '../utils/date'
import { parseScoreInput } from '../utils/evaluation'

interface Props {
  initial?: Assessment
  submitLabel: string
  busy?: boolean
  onSubmit: (input: AssessmentInput) => void
  onCancel?: () => void
}

/** نموذج إنشاء/تعديل اختبار (مذاكرة أو امتحان) */
export default function AssessmentForm({ initial, submitLabel, busy, onSubmit, onCancel }: Props) {
  const [type, setType] = useState<AssessmentType>(initial?.type ?? 'quiz')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [date, setDate] = useState(initial?.date ?? todayLocal())
  const [maxScore, setMaxScore] = useState(String(initial?.maxScore ?? DEFAULT_MAX_SCORE.quiz))
  // نغيّر العلامة العظمى الافتراضية مع النوع ما لم يعدّلها المستخدم يدوياً
  const [maxTouched, setMaxTouched] = useState(!!initial)
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState('')

  const pickType = (next: AssessmentType) => {
    setType(next)
    if (!maxTouched) setMaxScore(String(DEFAULT_MAX_SCORE[next]))
  }

  const submit = () => {
    const max = parseScoreInput(maxScore)
    if (max === null || max <= 0) return setError('العلامة العظمى يجب أن تكون رقماً أكبر من صفر')
    setError('')
    onSubmit({ type, title, subject, date, maxScore: max, note })
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="نوع الاختبار">
        {(['quiz', 'exam'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={type === t} className={type === t ? 'btn-primary' : 'btn-secondary'} onClick={() => pickType(t)}>
            {ASSESSMENT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <input className="input" placeholder="العنوان (مثال: مذاكرة الدرس الثالث)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="عنوان الاختبار" />
      <input className="input" placeholder="المادة (اختياري)" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="المادة" />
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm font-semibold">
          التاريخ
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          العلامة العظمى
          <input
            className="input"
            inputMode="decimal"
            value={maxScore}
            onChange={(e) => {
              setMaxScore(e.target.value)
              setMaxTouched(true)
            }}
          />
        </label>
      </div>
      <textarea className="textarea" rows={2} placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="ملاحظة الاختبار" />
      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy} onClick={submit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button className="btn-secondary flex-1" disabled={busy} onClick={onCancel}>
            إلغاء
          </button>
        )}
      </div>
    </div>
  )
}
