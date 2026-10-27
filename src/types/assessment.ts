export type AssessmentType = 'quiz' | 'exam'

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  quiz: 'مذاكرة',
  exam: 'امتحان',
}

export const DEFAULT_MAX_SCORE: Record<AssessmentType, number> = {
  quiz: 10,
  exam: 100,
}

/** اختبار واحد (مذاكرة أو امتحان) لكل الصف */
export interface Assessment {
  id: string
  type: AssessmentType
  title: string
  /** المادة (اختيارية) */
  subject: string
  date: string // YYYY-MM-DD
  maxScore: number
  note: string
  createdAt: string
  updatedAt: string
}

/** علامة طالب في اختبار معيّن */
export interface Grade {
  id: string
  assessmentId: string
  studentId: string
  /** null = لم تُدخل بعد */
  score: number | null
  /** غائب عن هذا الاختبار */
  absent: boolean
  note: string
  createdAt: string
  updatedAt: string
}
