export type DayStatus = 'draft' | 'confirmed'
export type RecordStatus = 'unmarked' | 'present' | 'absent' | 'late'

export interface AttendanceDay {
  id: string
  date: string // YYYY-MM-DD (تاريخ محلي)
  status: DayStatus
  createdAt: string
  confirmedAt: string | null
  updatedAt: string
  hasDictation: boolean
  hasHomework: boolean
}

export interface AttendanceRecord {
  id: string
  dayId: string
  studentId: string
  status: RecordStatus
  /** ملاحظة على حضور الطالب في هذا اليوم */
  note: string
  createdAt: string
  updatedAt: string
  dictationScore: number | null
  homework: HomeworkStatus | null
  behaviorScore: number | null
}

export type HomeworkStatus = 'done' | 'partial' | 'none'

export function effectiveBehavior(record: Pick<AttendanceRecord, 'behaviorScore'>): number {
  return record.behaviorScore ?? 10
}

export interface DayStats {
  total: number
  present: number
  absent: number
  late: number
  unmarked: number
}

export const STATUS_LABEL: Record<RecordStatus, string> = {
  unmarked: 'غير محدد',
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
}
