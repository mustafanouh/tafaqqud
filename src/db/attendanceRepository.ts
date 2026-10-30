import { db } from './database'

export const attendanceRepository = {
  dayByDate: (date: string) => db.attendanceDays.where('date').equals(date).first(),
  dayById: (id: string) => db.attendanceDays.get(id),
  allDays: () => db.attendanceDays.toArray(),
  bulkGetDays: (ids: string[]) => db.attendanceDays.bulkGet(ids),
  countDays: () => db.attendanceDays.count(),
  draftDaysBefore: (date: string) =>
    db.attendanceDays.where('status').equals('draft').and((d) => d.date < date).toArray(),
  recordsForDay: (dayId: string) => db.attendanceRecords.where('dayId').equals(dayId).toArray(),
  recordsForDays: (dayIds: string[]) =>
    dayIds.length > 0 ? db.attendanceRecords.where('dayId').anyOf(dayIds).toArray() : Promise.resolve([]),
  recordsForStudent: (studentId: string) => db.attendanceRecords.where('studentId').equals(studentId).toArray(),
  record: (dayId: string, studentId: string) =>
    db.attendanceRecords.where('[dayId+studentId]').equals([dayId, studentId]).first(),
}
