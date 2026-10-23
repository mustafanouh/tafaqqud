import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { AttendanceDay, DayStats } from '../types/attendance'
import { computeStats } from '../services/statisticsService'

export interface HistoryItem {
  day: AttendanceDay
  stats: DayStats
}

export function useAttendanceHistory(): HistoryItem[] | undefined {
  return useLiveQuery(async () => {
    const days = (await db.attendanceDays.toArray()).sort((a, b) => b.date.localeCompare(a.date))
    const records = await db.attendanceRecords.toArray()
    const byDay = new Map<string, typeof records>()
    for (const r of records) {
      const list = byDay.get(r.dayId)
      if (list) list.push(r)
      else byDay.set(r.dayId, [r])
    }
    return days.map((day) => ({ day, stats: computeStats(byDay.get(day.id) ?? []) }))
  }, [])
}
