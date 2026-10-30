import { useLiveQuery } from 'dexie-react-hooks'
import { attendanceRepository } from '../db/attendanceRepository'
import type { AttendanceDay, AttendanceRecord, DayStats } from '../types/attendance'
import { computeStats } from '../services/statisticsService'

export interface HistoryItem {
  day: AttendanceDay
  stats: DayStats
}

export function useAttendanceHistory(): HistoryItem[] | undefined {
  return useLiveQuery(async () => {
    const days = (await attendanceRepository.allDays()).sort((a, b) => b.date.localeCompare(a.date))
    if (days.length === 0) return []

    const dayIds = days.map((d) => d.id)
    const records = await attendanceRepository.recordsForDays(dayIds)
    const byDay = new Map<string, AttendanceRecord[]>()
    for (const r of records) {
      const list = byDay.get(r.dayId)
      if (list) list.push(r)
      else byDay.set(r.dayId, [r])
    }
    return days.map((day) => ({ day, stats: computeStats(byDay.get(day.id) ?? []) }))
  }, [])
}
