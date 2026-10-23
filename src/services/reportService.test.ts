import { describe, expect, it } from 'vitest'
import type { AttendanceDay, AttendanceRecord } from '../types/attendance'
import type { Student } from '../types/student'
import { buildAttendanceReportData } from './reportService'

const day: AttendanceDay = {
    id: 'day-1',
    date: '2026-10-23',
    status: 'confirmed',
    createdAt: '2026-10-23T08:00:00.000Z',
    confirmedAt: '2026-10-23T09:00:00.000Z',
    updatedAt: '2026-10-23T09:00:00.000Z',
    hasDictation: false,
    hasHomework: false,
}

function student(id: string, name: string): Student {
    return {
        id,
        name,
        normalizedName: name,
        active: 1,
        notes: '',
        deactivationNote: '',
        deactivatedAt: null,
        createdAt: day.createdAt,
        updatedAt: day.updatedAt,
    }
}

function record(id: string, studentId: string, status: AttendanceRecord['status'], note = ''): AttendanceRecord {
    return { id, dayId: day.id, studentId, status, note, createdAt: day.createdAt, updatedAt: day.updatedAt, dictationScore: null, homework: null, behaviorScore: null }
}

describe('buildAttendanceReportData', () => {
    it('sorts Arabic names, summarizes statuses, and removes blank header lines', () => {
        const students = [student('2', 'سارة'), student('1', 'أحمد'), student('3', 'محمد'), student('4', 'ليلى'), student('5', 'هند')]
        const records = [
            record('r1', '1', 'present'),
            record('r2', '2', 'absent'),
            record('r3', '3', 'late', 'وصل متأخراً'),
            record('r4', '4', 'unmarked'),
            record('r5', '5', 'present'),
        ]

        const report = buildAttendanceReportData(day, records, students, {
            schoolName: '  مدرسة النور  ',
            sectionName: ' ',
            teacherName: '',
        })

        expect(report.headerLines).toEqual(['مدرسة النور'])
        expect(report.rows.map((row) => row.studentName)).toEqual(['أحمد', 'سارة', 'ليلى', 'محمد', 'هند'])
        expect(report.rows[3]).toMatchObject({ number: 4, status: 'متأخر', note: 'وصل متأخراً' })
        expect(report.stats).toEqual({ total: 5, present: 2, absent: 1, late: 1, unmarked: 1 })
    })
})
