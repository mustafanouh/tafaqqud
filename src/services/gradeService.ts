import { db, newId } from '../db/database'
import type { Assessment, AssessmentType, Grade } from '../types/assessment'
import { isValidDateString, nowIso } from '../utils/date'

export interface AssessmentInput {
  type: AssessmentType
  title: string
  subject?: string
  date: string
  maxScore: number
  note?: string
}

export interface GradeInput {
  score?: number | null
  absent?: boolean
  note?: string
}

export interface GradeSummary {
  /** عدد الاختبارات التي لها علامة فعلية */
  count: number
  /** متوسط النسب المئوية (0-100) أو null */
  averagePercent: number | null
  bestPercent: number | null
  worstPercent: number | null
}

export interface StudentGradeRow {
  assessment: Assessment
  grade: Grade | null
  /** النسبة المئوية أو null إن لم تُدخل علامة / كان غائباً */
  percent: number | null
}

export function toPercent(score: number, maxScore: number): number {
  return maxScore > 0 ? (score / maxScore) * 100 : 0
}

export function summarizePercents(percents: (number | null)[]): GradeSummary {
  const valid = percents.filter((p): p is number => p !== null)
  if (valid.length === 0) return { count: 0, averagePercent: null, bestPercent: null, worstPercent: null }
  return {
    count: valid.length,
    averagePercent: valid.reduce((a, b) => a + b, 0) / valid.length,
    bestPercent: Math.max(...valid),
    worstPercent: Math.min(...valid),
  }
}

function validateInput(input: AssessmentInput): AssessmentInput {
  const title = input.title.trim()
  if (!title) throw new Error('اكتب عنوان الاختبار')
  if (input.type !== 'quiz' && input.type !== 'exam') throw new Error('نوع الاختبار غير صالح')
  if (!isValidDateString(input.date)) throw new Error('تاريخ الاختبار غير صالح')
  if (!Number.isFinite(input.maxScore) || input.maxScore <= 0 || input.maxScore > 1000) {
    throw new Error('العلامة العظمى يجب أن تكون رقماً أكبر من صفر')
  }
  return {
    type: input.type,
    title,
    subject: (input.subject ?? '').trim(),
    date: input.date,
    maxScore: input.maxScore,
    note: (input.note ?? '').trim(),
  }
}

function validateScore(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || score < 0) throw new Error('العلامة يجب أن تكون رقماً غير سالب')
  if (score > maxScore) throw new Error(`العلامة لا يمكن أن تتجاوز العلامة العظمى (${maxScore})`)
  return Math.round(score * 100) / 100
}

export const gradeService = {
  /** ينشئ الاختبار ومعه سجل علامة فارغ لكل طالب نشط، داخل معاملة واحدة */
  async createAssessment(input: AssessmentInput): Promise<Assessment> {
    const data = validateInput(input)
    return db.transaction('rw', db.students, db.assessments, db.grades, async () => {
      const now = nowIso()
      const assessment: Assessment = { id: newId(), ...data, subject: data.subject ?? '', note: data.note ?? '', createdAt: now, updatedAt: now }
      await db.assessments.add(assessment)
      const students = await db.students.where('active').equals(1).toArray()
      await db.grades.bulkAdd(
        students.map((s) => ({
          id: newId(),
          assessmentId: assessment.id,
          studentId: s.id,
          score: null,
          absent: false,
          note: '',
          createdAt: now,
          updatedAt: now,
        })),
      )
      return assessment
    })
  },

  async updateAssessment(id: string, input: AssessmentInput): Promise<void> {
    const data = validateInput(input)
    await db.transaction('rw', db.assessments, db.grades, async () => {
      const existing = await db.assessments.get(id)
      if (!existing) throw new Error('الاختبار غير موجود')
      const over = await db.grades.where('assessmentId').equals(id).filter((g) => g.score !== null && g.score > data.maxScore).count()
      if (over > 0) throw new Error(`لا يمكن تخفيض العلامة العظمى: ${over} علامة أكبر منها`)
      await db.assessments.update(id, { ...data, updatedAt: nowIso() })
    })
  },

  async deleteAssessment(id: string): Promise<void> {
    await db.transaction('rw', db.assessments, db.grades, async () => {
      await db.grades.where('assessmentId').equals(id).delete()
      await db.assessments.delete(id)
    })
  },

  /** حفظ علامة طالب (ينشئ السجل إن كان الطالب أُضيف بعد إنشاء الاختبار) */
  async setGrade(assessmentId: string, studentId: string, input: GradeInput): Promise<void> {
    await db.transaction('rw', db.assessments, db.grades, async () => {
      const assessment = await db.assessments.get(assessmentId)
      if (!assessment) throw new Error('الاختبار غير موجود')
      const existing = await db.grades.where('[assessmentId+studentId]').equals([assessmentId, studentId]).first()
      const now = nowIso()
      const changes: Partial<Grade> = { updatedAt: now }
      if (input.absent !== undefined) changes.absent = input.absent
      if (input.note !== undefined) changes.note = input.note.trim()
      if (input.score !== undefined) {
        changes.score = input.score === null ? null : validateScore(input.score, assessment.maxScore)
      }
      // الغائب لا تُحتسب له علامة
      if (changes.absent === true) changes.score = null
      if (changes.score !== undefined && changes.score !== null && input.absent === undefined) changes.absent = false
      if (existing) {
        await db.grades.update(existing.id, changes)
      } else {
        await db.grades.add({
          id: newId(),
          assessmentId,
          studentId,
          score: null,
          absent: false,
          note: '',
          createdAt: now,
          ...changes,
        } as Grade)
      }
      await db.assessments.update(assessmentId, { updatedAt: now })
    })
  },

  /** علامات الطالب مرتبة من الأحدث إلى الأقدم */
  async forStudent(studentId: string): Promise<StudentGradeRow[]> {
    const grades = await db.grades.where('studentId').equals(studentId).toArray()
    const byAssessment = new Map(grades.map((g) => [g.assessmentId, g]))
    const assessments = await db.assessments.bulkGet(grades.map((g) => g.assessmentId))
    return assessments
      .filter((a): a is Assessment => !!a)
      .map((assessment) => {
        const grade = byAssessment.get(assessment.id) ?? null
        const percent = grade && grade.score !== null && !grade.absent ? toPercent(grade.score, assessment.maxScore) : null
        return { assessment, grade, percent }
      })
      .sort((a, b) => b.assessment.date.localeCompare(a.assessment.date) || b.assessment.createdAt.localeCompare(a.assessment.createdAt))
  },
}
