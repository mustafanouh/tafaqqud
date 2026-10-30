import { studentRepository } from '../db/studentRepository'
import { attendanceRepository } from '../db/attendanceRepository'
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
  let dictationSum = 0
  let dictationCount = 0
  let behaviorSum = 0
  let eligibleCount = 0
  let hwDone = 0
  let hwPartial = 0
  let hwNone = 0

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.record.status !== 'present' && e.record.status !== 'late') continue

    eligibleCount++
    if (e.day.hasDictation && e.record.dictationScore !== null) {
      dictationSum += e.record.dictationScore
      dictationCount++
    }

    behaviorSum += effectiveBehavior(e.record)

    if (e.day.hasHomework) {
      if (e.record.homework === 'done') hwDone++
      else if (e.record.homework === 'partial') hwPartial++
      else if (e.record.homework === 'none') hwNone++
    }
  }

  return {
    dictationCount,
    averageDictation: dictationCount > 0 ? dictationSum / dictationCount : null,
    averageBehavior: eligibleCount > 0 ? behaviorSum / eligibleCount : null,
    homeworkDone: hwDone,
    homeworkPartial: hwPartial,
    homeworkNone: hwNone,
  }
}

export async function loadStudentProfile(studentId: string, range: DateRange = {}): Promise<StudentProfile | null> {
  const student = await studentRepository.get(studentId)
  if (!student) return null

  const records = await attendanceRepository.recordsForStudent(studentId)
  const days = await attendanceRepository.bulkGetDays(records.map((r) => r.dayId))
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
