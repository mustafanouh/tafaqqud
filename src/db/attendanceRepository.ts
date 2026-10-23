import { db } from './database'

export const attendanceRepository = {
  dayByDate: (date: string) => db.attendanceDays.where('date').equals(date).first(),
  dayById: (id: string) => db.attendanceDays.get(id),
  allDays: () => db.attendanceDays.toArray(),
  recordsForDay: (dayId: string) => db.attendanceRecords.where('dayId').equals(dayId).toArray(),
  record: (dayId: string, studentId: string) =>
    db.attendanceRecords.where('[dayId+studentId]').equals([dayId, studentId]).first(),
}
