import { describe, it, expect } from 'vitest'
import { computeRanking, type RankingInputData } from './rankingService'
import { buildRankingReportDocument } from './rankingPdfService'
import { computeStats, computeEvaluationStats } from './statisticsService'
import { summarizeEvaluation, type AttendanceEntry } from './studentProfileService'
import type { AttendanceDay, AttendanceRecord, HomeworkStatus } from '../types/attendance'
import type { Assessment, Grade } from '../types/assessment'
import type { Student } from '../types/student'

function generateMockDataset(studentCount: number, dayCount: number, assessmentCount: number): RankingInputData {
  const students: Student[] = Array.from({ length: studentCount }, (_, i) => ({
    id: `student-${i + 1}`,
    name: `طالب رقم ${i + 1}`,
    normalizedName: `طالب رقم ${i + 1}`,
    active: 1,
    notes: '',
    deactivationNote: '',
    deactivatedAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  }))

  const days: AttendanceDay[] = Array.from({ length: dayCount }, (_, d) => {
    const month = String(Math.floor(d / 30) + 9).padStart(2, '0')
    const dayOfMonth = String((d % 30) + 1).padStart(2, '0')
    return {
      id: `day-${d + 1}`,
      date: `2026-${month}-${dayOfMonth}`,
      status: 'confirmed',
      confirmedAt: '2026-09-01T12:00:00Z',
      hasHomework: d % 2 === 0,
      hasDictation: d % 3 === 0,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    }
  })

  const records: AttendanceRecord[] = []
  const statuses: AttendanceRecord['status'][] = ['present', 'present', 'present', 'present', 'late', 'absent']
  const hwStatuses: HomeworkStatus[] = ['done', 'done', 'partial', 'none']

  for (const day of days) {
    for (let sIdx = 0; sIdx < students.length; sIdx++) {
      const student = students[sIdx]
      const status = statuses[(sIdx + Number(day.id.split('-')[1])) % statuses.length]
      const isEligible = status === 'present' || status === 'late'
      records.push({
        id: `rec-${day.id}-${student.id}`,
        dayId: day.id,
        studentId: student.id,
        status,
        note: '',
        homework: day.hasHomework && isEligible ? hwStatuses[(sIdx + 1) % hwStatuses.length] : null,
        dictationScore: day.hasDictation && isEligible ? ((sIdx * 3 + 7) % 11) : null,
        behaviorScore: sIdx % 5 === 0 ? 9 : 10,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      })
    }
  }

  const assessments: Assessment[] = Array.from({ length: assessmentCount }, (_, a) => ({
    id: `asm-${a + 1}`,
    title: `اختبار رقم ${a + 1}`,
    subject: 'لغة عربية',
    type: a % 3 === 0 ? 'exam' : 'quiz',
    date: `2026-10-${String((a % 28) + 1).padStart(2, '0')}`,
    maxScore: a % 3 === 0 ? 100 : 20,
    note: '',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  }))

  const grades: Grade[] = []
  for (const asm of assessments) {
    for (let sIdx = 0; sIdx < students.length; sIdx++) {
      const isAbsent = (sIdx + Number(asm.id.split('-')[1])) % 10 === 0
      grades.push({
        id: `grd-${asm.id}-${students[sIdx].id}`,
        assessmentId: asm.id,
        studentId: students[sIdx].id,
        absent: isAbsent,
        score: isAbsent ? null : Math.round((asm.maxScore * ((sIdx * 7) % 100)) / 100),
        note: '',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      })
    }
  }

  return { students, days, records, assessments, grades }
}

describe('Performance & Scaling Benchmarks', () => {
  it('handles 100 students with 90 school days (9,000 attendance records + 1,500 grades) in < 150ms', () => {
    const data = generateMockDataset(100, 90, 15)
    expect(data.students.length).toBe(100)
    expect(data.records.length).toBe(9000)
    expect(data.grades.length).toBe(1500)

    const t0 = performance.now()
    const result = computeRanking(data)
    const elapsed = performance.now() - t0

    expect(result.rows.length).toBe(100)
    expect(result.rankedCount).toBe(100)
    expect(result.classSummary.averageScore).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(150)
  })

  it('handles extreme load: 250 students with 120 school days (30,000 records + 5,000 grades) smoothly', () => {
    const data = generateMockDataset(250, 120, 20)
    expect(data.records.length).toBe(30000)
    expect(data.grades.length).toBe(5000)

    const t0 = performance.now()
    const result = computeRanking(data)
    const elapsed = performance.now() - t0

    expect(result.rows.length).toBe(250)
    expect(result.rankedCount).toBe(250)
    // Top 3 ranks should be valid and ordered
    expect(result.rows[0].rank).toBe(1)
    expect(result.rows[0].score).toBeGreaterThanOrEqual(result.rows[1].score!)
    expect(elapsed).toBeLessThan(350)
  })

  it('generates PDF Document Definition for 100 ranked students in < 100ms', () => {
    const data = generateMockDataset(100, 60, 10)
    const ranking = computeRanking(data)

    const t0 = performance.now()
    const docDef = buildRankingReportDocument(ranking, {
      schoolName: 'مدرسة التفوق الحديثة',
      sectionName: 'الصف الرابع - الشعبة الأولى',
      teacherName: 'أ. مصطفى نوح',
    })
    const elapsed = performance.now() - t0

    expect(docDef.pageSize).toBe('A4')
    expect(docDef.pageOrientation).toBe('landscape')
    expect(docDef.rtl).toBe(true)
    expect(elapsed).toBeLessThan(100)
  })

  it('processes statistics computation for 5,000 records in < 100ms', () => {
    const mockRecords: AttendanceRecord[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `rec-${i}`,
      dayId: 'day-1',
      studentId: `student-${i}`,
      status: i % 4 === 0 ? 'absent' : i % 5 === 0 ? 'late' : 'present',
      note: '',
      dictationScore: (i % 11),
      homework: i % 2 === 0 ? 'done' : 'partial',
      behaviorScore: 10,
      createdAt: '',
      updatedAt: '',
    }))

    const t0 = performance.now()
    const stats = computeStats(mockRecords)
    const evalStats = computeEvaluationStats({ hasDictation: true, hasHomework: true }, mockRecords)
    const elapsed = performance.now() - t0

    expect(stats.total).toBe(5000)
    expect(evalStats.averageDictation).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(100)
  })

  it('efficiently summarizes student profile evaluation history for 200 entries', () => {
    const entries: AttendanceEntry[] = Array.from({ length: 200 }, (_, i) => ({
      day: {
        id: `d-${i}`,
        date: `2026-09-${String((i % 25) + 1).padStart(2, '0')}`,
        status: 'confirmed',
        confirmedAt: '2026-09-01T12:00:00Z',
        hasHomework: true,
        hasDictation: true,
        createdAt: '',
        updatedAt: '',
      },
      record: {
        id: `r-${i}`,
        dayId: `d-${i}`,
        studentId: 'st-1',
        status: i % 10 === 0 ? 'absent' : 'present',
        note: '',
        homework: i % 3 === 0 ? 'done' : 'partial',
        dictationScore: 9,
        behaviorScore: 10,
        createdAt: '',
        updatedAt: '',
      },
    }))

    const t0 = performance.now()
    const summary = summarizeEvaluation(entries)
    const elapsed = performance.now() - t0

    expect(summary.averageDictation).toBe(9)
    expect(summary.averageBehavior).toBe(10)
    expect(elapsed).toBeLessThan(25)
  })

  it('supports rapid slider weight adjustments (50 sequential recalculations) in < 500ms', () => {
    const data = generateMockDataset(50, 40, 8)
    const t0 = performance.now()

    for (let step = 0; step < 50; step++) {
      const wGrades = 30 + (step % 40)
      const wAtt = 10 + ((step * 2) % 30)
      computeRanking(data, {}, {
        weights: {
          grades: wGrades,
          attendance: wAtt,
          homework: 15,
          dictation: 10,
          behavior: 10,
        },
      })
    }

    const elapsed = performance.now() - t0
    // 50 full class re-computations should complete within 500ms (< 10ms per calculation)
    expect(elapsed).toBeLessThan(500)
  })
})
