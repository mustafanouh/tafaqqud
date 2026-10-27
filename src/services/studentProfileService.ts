import { db } from '../db/database'
import { effectiveBehavior, type AttendanceDay, type AttendanceRecord, type DayStats } from '../types/attendance'
import type { Student } from '../types/student'
import { computeStats } from './statisticsService'
import { gradeService, summarizePercents, type GradeSummary, type StudentGradeRow } from './gradeService'

export interface DateRange {
  from?: string // YYYY-MM-DD شامل
  to?: string // YYYY-MM-DD شامل
}

export interface AttendanceEntry {
  day: AttendanceDay
  record: AttendanceRecord
}

export interface StudentEvaluationSummary {
  dictationCount: number
  averageDictation: number | null
  averageBehavior: number | null
  homeworkDone: number
  homeworkPartial: number
  homeworkNone: number
}

export interface StudentProfile {
  student: Student
  attendanceStats: DayStats
  /** نسبة الحضور (حاضر + متأخر) من الأيام المعتمدة المحددة، أو null */
  attendanceRate: number | null
  /** من الأحدث إلى الأقدم */
  attendance: AttendanceEntry[]
  evaluation: StudentEvaluationSummary
  grades: StudentGradeRow[]
  quizSummary: GradeSummary
  examSummary: GradeSummary
  overallSummary: GradeSummary
}

const inRange = (date: string, range: DateRange) => (!range.from || date >= range.from) && (!range.to || date <= range.to)

export function summarizeEvaluation(entries: AttendanceEntry[]): StudentEvaluationSummary {
  const eligible = entries.filter((e) => e.record.status === 'present' || e.record.status === 'late')
  const dictation = eligible.filter((e) => e.day.hasDictation && e.record.dictationScore !== null).map((e) => e.record.dictationScore as number)
  const behavior = eligible.map((e) => effectiveBehavior(e.record))
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const homework = eligible.filter((e) => e.day.hasHomework)
  return {
    dictationCount: dictation.length,
    averageDictation: avg(dictation),
    averageBehavior: avg(behavior),
    homeworkDone: homework.filter((e) => e.record.homework === 'done').length,
    homeworkPartial: homework.filter((e) => e.record.homework === 'partial').length,
    homeworkNone: homework.filter((e) => e.record.homework === 'none').length,
  }
}

export async function loadStudentProfile(studentId: string, range: DateRange = {}): Promise<StudentProfile | null> {
  const student = await db.students.get(studentId)
  if (!student) return null

  const records = await db.attendanceRecords.where('studentId').equals(studentId).toArray()
  const days = await db.attendanceDays.bulkGet(records.map((r) => r.dayId))
  const dayMap = new Map(days.filter((d): d is AttendanceDay => !!d).map((d) => [d.id, d]))

  const attendance: AttendanceEntry[] = records
    .map((record) => ({ record, day: dayMap.get(record.dayId) }))
    .filter((e): e is AttendanceEntry => !!e.day && inRange(e.day.date, range))
    .sort((a, b) => b.day.date.localeCompare(a.day.date))

  // المسودات قد تحوي «غير محدد» لم يُحسم بعد، لذا تُستبعد من نسبة الحضور
  const counted = attendance.filter((e) => e.day.status === 'confirmed' || e.record.status !== 'unmarked')
  const attendanceStats = computeStats(counted.map((e) => e.record))
  const decided = attendanceStats.total - attendanceStats.unmarked
  const attendanceRate = decided > 0 ? ((attendanceStats.present + attendanceStats.late) / decided) * 100 : null

  const allGrades = await gradeService.forStudent(studentId)
  const grades = allGrades.filter((g) => inRange(g.assessment.date, range))

  return {
    student,
    attendanceStats,
    attendanceRate,
    attendance,
    evaluation: summarizeEvaluation(counted),
    grades,
    quizSummary: summarizePercents(grades.filter((g) => g.assessment.type === 'quiz').map((g) => g.percent)),
    examSummary: summarizePercents(grades.filter((g) => g.assessment.type === 'exam').map((g) => g.percent)),
    overallSummary: summarizePercents(grades.map((g) => g.percent)),
  }
}
