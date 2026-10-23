import { STATUS_LABEL, type AttendanceDay, type AttendanceRecord, type DayStats } from '../types/attendance'
import type { Student } from '../types/student'
import { formatDateAr } from '../utils/date'
import { computeEvaluationStats, computeStats, type EvaluationStats } from './statisticsService'

export interface ReportSettings {
    schoolName?: string
    sectionName?: string
    teacherName?: string
}

export interface ReportRow {
    number: number
    studentName: string
    status: string
    note: string
    dictationScore: number | null
    homework: string | null
    behaviorScore: number | null
}

export interface AttendanceReportData {
    title: string
    date: string
    headerLines: string[]
    stats: DayStats
    evaluationStats: EvaluationStats
    hasDictation: boolean
    hasHomework: boolean
    rows: ReportRow[]
}

export function buildAttendanceReportData(
    day: AttendanceDay,
    records: AttendanceRecord[],
    students: Student[],
    settings: ReportSettings,
): AttendanceReportData {
    const studentMap = new Map(students.map((student) => [student.id, student]))
    const joined = records
        .map((record) => ({ record, student: studentMap.get(record.studentId) }))
        .filter((entry): entry is { record: AttendanceRecord; student: Student } => !!entry.student)
        .sort((a, b) => a.student.name.localeCompare(b.student.name, 'ar'))

    const stats: DayStats = computeStats(records)
    const evaluationStats = computeEvaluationStats(day, records)

    return {
        title: 'تقرير التفقد',
        date: formatDateAr(day.date),
        headerLines: [settings.schoolName, settings.sectionName, settings.teacherName].map((value) => value?.trim() ?? '').filter(Boolean),
        stats,
        evaluationStats,
        hasDictation: day.hasDictation,
        hasHomework: day.hasHomework,
        rows: joined.map(({ record, student }, index) => ({
            number: index + 1,
            studentName: student.name,
            status: STATUS_LABEL[record.status],
            note: record.note,
            dictationScore: record.status === 'present' || record.status === 'late' ? record.dictationScore : null,
            homework: record.status === 'present' || record.status === 'late' ? record.homework : null,
            behaviorScore: record.status === 'present' || record.status === 'late' ? record.behaviorScore : null,
        })),
    }
}
