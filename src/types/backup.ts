import type { AttendanceDay, AttendanceRecord } from './attendance'
import type { Student } from './student'

export const BACKUP_FORMAT = 'tafaqqud-backup'
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: string
  settings: Record<string, string>
  students: Student[]
  days: AttendanceDay[]
  records: AttendanceRecord[]
}
