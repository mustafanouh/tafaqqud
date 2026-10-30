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
  let dictationSum = 0
  let dictationCount = 0
  let behaviorSum = 0
  let eligibleCount = 0
  const homeworkCounts: Record<HomeworkStatus | 'unmarked', number> = { done: 0, partial: 0, none: 0, unmarked: 0 }

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record.status !== 'present' && record.status !== 'late') continue

    eligibleCount++
    if (day.hasDictation && record.dictationScore !== null) {
      dictationSum += record.dictationScore
      dictationCount++
    }

    behaviorSum += effectiveBehavior(record)

    if (day.hasHomework) {
      homeworkCounts[record.homework ?? 'unmarked']++
    }
  }

  return {
    averageDictation: day.hasDictation && dictationCount > 0 ? dictationSum / dictationCount : null,
    averageBehavior: eligibleCount > 0 ? behaviorSum / eligibleCount : null,
    homeworkDone: homeworkCounts.done,
    homeworkPartial: homeworkCounts.partial,
    homeworkNone: homeworkCounts.none,
    homeworkUnmarked: homeworkCounts.unmarked,
  }
}
