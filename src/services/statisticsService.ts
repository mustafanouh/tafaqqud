import type { AttendanceRecord, DayStats } from '../types/attendance'

export function computeStats(records: Pick<AttendanceRecord, 'status'>[]): DayStats {
  const s: DayStats = { total: records.length, present: 0, absent: 0, late: 0, unmarked: 0 }
  for (const r of records) s[r.status]++
  return s
}
