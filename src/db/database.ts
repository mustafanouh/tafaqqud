import Dexie, { type Table } from 'dexie'
import type { AttendanceDay, AttendanceRecord } from '../types/attendance'
import type { Assessment, Grade } from '../types/assessment'
import type { Student } from '../types/student'

export interface SettingRow {
  key: string
  value: string
}

export class TafaqqudDB extends Dexie {
  students!: Table<Student, string>
  attendanceDays!: Table<AttendanceDay, string>
  attendanceRecords!: Table<AttendanceRecord, string>
  settings!: Table<SettingRow, string>
  assessments!: Table<Assessment, string>
  grades!: Table<Grade, string>

  constructor(name = 'tafaqqud') {
    super(name)
    this.version(1).stores({
      students: 'id, active, normalizedName',
      attendanceDays: 'id, &date, status',
      attendanceRecords: 'id, dayId, studentId, &[dayId+studentId]',
      settings: 'key',
    })
    this.version(2)
      .stores({
        students: 'id, active, normalizedName',
        attendanceDays: 'id, &date, status',
        attendanceRecords: 'id, dayId, studentId, &[dayId+studentId]',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        await tx.table<AttendanceDay>('attendanceDays').toCollection().modify((day) => {
          day.hasDictation ??= false
          day.hasHomework ??= false
        })
        await tx.table<AttendanceRecord>('attendanceRecords').toCollection().modify((record) => {
          record.dictationScore ??= null
          record.homework ??= null
          record.behaviorScore ??= null
        })
      })
    this.version(3).stores({
      students: 'id, active, normalizedName',
      attendanceDays: 'id, &date, status',
      attendanceRecords: 'id, dayId, studentId, &[dayId+studentId]',
      settings: 'key',
      assessments: 'id, type, date',
      grades: 'id, assessmentId, studentId, &[assessmentId+studentId]',
    })
  }
}

export const db = new TafaqqudDB()

export function newId(): string {
  return crypto.randomUUID()
}
