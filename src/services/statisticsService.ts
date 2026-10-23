import { effectiveBehavior, type AttendanceDay, type AttendanceRecord, type DayStats, type HomeworkStatus } from '../types/attendance'

export function computeStats(records: Pick<AttendanceRecord, 'status'>[]): DayStats {
  const s: DayStats = { total: records.length, present: 0, absent: 0, late: 0, unmarked: 0 }
  for (const r of records) s[r.status]++
  return s
}

export interface EvaluationStats {
  averageDictation: number | null
  averageBehavior: number | null
  homeworkDone: number
  homeworkPartial: number
  homeworkNone: number
  homeworkUnmarked: number
}

export function computeEvaluationStats(day: Pick<AttendanceDay, 'hasDictation' | 'hasHomework'>, records: AttendanceRecord[]): EvaluationStats {
  const eligible = records.filter((record) => record.status === 'present' || record.status === 'late')
  const dictation = eligible.map((record) => record.dictationScore).filter((score): score is number => score !== null)
  const behavior = eligible.map(effectiveBehavior)
  const homeworkCounts: Record<HomeworkStatus | 'unmarked', number> = { done: 0, partial: 0, none: 0, unmarked: 0 }
  if (day.hasHomework) {
    for (const record of eligible) homeworkCounts[record.homework ?? 'unmarked']++
  }
  return {
    averageDictation: day.hasDictation && dictation.length ? dictation.reduce((sum, value) => sum + value, 0) / dictation.length : null,
    averageBehavior: behavior.length ? behavior.reduce((sum, value) => sum + value, 0) / behavior.length : null,
    homeworkDone: homeworkCounts.done,
    homeworkPartial: homeworkCounts.partial,
    homeworkNone: homeworkCounts.none,
    homeworkUnmarked: homeworkCounts.unmarked,
  }
}
