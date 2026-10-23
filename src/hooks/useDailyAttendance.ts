import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { AttendanceDay, AttendanceRecord, DayStats } from '../types/attendance'
import type { Student } from '../types/student'
import { computeStats } from '../services/statisticsService'

export interface AttendanceRow {
  record: AttendanceRecord
  student: Student
}

export interface DayView {
  day: AttendanceDay | undefined
  rows: AttendanceRow[]
  stats: DayStats
}

/** بيانات يوم واحد (حية). undefined أثناء التحميل. */
export function useDayView(dayId: string | undefined): DayView | undefined {
  return useLiveQuery(
    async () => {
      if (!dayId) return { day: undefined, rows: [], stats: computeStats([]) }
      const day = await db.attendanceDays.get(dayId)
      const records = await db.attendanceRecords.where('dayId').equals(dayId).toArray()
      const studentIds = records.map((r) => r.studentId)
      const studentsList = await db.students.bulkGet(studentIds)
      const students = new Map<string, Student>()
      for (const s of studentsList) {
        if (s) students.set(s.id, s)
      }
      const rows = records
        .map((record) => ({ record, student: students.get(record.studentId) }))
        .filter((r): r is AttendanceRow => !!r.student)
        .sort((a, b) => a.student.name.localeCompare(b.student.name, 'ar'))
      return { day, rows, stats: computeStats(records) }
    },
    [dayId],
  )
}
