import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import type { Assessment, Grade } from '../types/assessment'
import type { AttendanceDay, AttendanceRecord } from '../types/attendance'
import type { Student } from '../types/student'
import {
  computeRanking,
  loadClassRanking,
  normalizeWeights,
  type RankingInputData,
} from './rankingService'
import { buildRankingReportDocument } from './rankingPdfService'

function makeStudent(id: string, name: string, active: 0 | 1 = 1): Student {
  return {
    id,
    name,
    normalizedName: name,
    active,
    notes: '',
    deactivationNote: '',
    deactivatedAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

function makeDay(id: string, date: string, options: Partial<AttendanceDay> = {}): AttendanceDay {
  return {
    id,
    date,
    status: 'confirmed',
    hasDictation: false,
    hasHomework: false,
    confirmedAt: '2026-10-01T12:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...options,
  }
}

function makeRecord(id: string, dayId: string, studentId: string, options: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id,
    dayId,
    studentId,
    status: 'present',
    note: '',
    dictationScore: null,
    homework: null,
    behaviorScore: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...options,
  }
}

function makeAssessment(id: string, date: string, maxScore = 10, type: 'quiz' | 'exam' = 'quiz'): Assessment {
  return {
    id,
    date,
    title: `اختبار ${id}`,
    subject: 'لغة عربية',
    type,
    maxScore,
    note: '',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

function makeGrade(id: string, assessmentId: string, studentId: string, score: number | null, absent = false): Grade {
  return {
    id,
    assessmentId,
    studentId,
    score,
    absent,
    note: '',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

describe('خدمة ترتيب الشعبة rankingService', () => {
  beforeEach(async () => {
    await Promise.all([
      db.students.clear(),
      db.attendanceDays.clear(),
      db.attendanceRecords.clear(),
      db.assessments.clear(),
      db.grades.clear(),
      db.settings.clear(),
    ])
  })

  describe('تطبيع الأوزان normalizeWeights', () => {
    it('يقبل الأوزان الافتراضية ومجموعها 100', () => {
      const w = normalizeWeights()
      expect(w.grades + w.attendance + w.homework + w.dictation + w.behavior).toBe(100)
    })

    it('يطبّع الأوزان تلقائياً إذا كان مجموعها لا يساوي 100', () => {
      // مجموع = 50 → يضرب بـ 2
      const w = normalizeWeights({ grades: 25, attendance: 10, homework: 5, dictation: 5, behavior: 5 })
      expect(w.grades).toBe(50)
      expect(w.attendance).toBe(20)
      expect(w.homework).toBe(10)
      expect(w.dictation).toBe(10)
      expect(w.behavior).toBe(10)
      expect(w.grades + w.attendance + w.homework + w.dictation + w.behavior).toBe(100)
    })

    it('يرفض أوزاناً سالبة أو مجموعاً يساوي أو أقل من صفر', () => {
      expect(() => normalizeWeights({ grades: -10 })).toThrow('أوزان المعايير')
      expect(() => normalizeWeights({ grades: 0, attendance: 0, homework: 0, dictation: 0, behavior: 0 })).toThrow('أكبر من صفر')
    })
  })

  describe('حساب الوظائف (homeworkRate)', () => {
    it('يحسب أيام «كتب» (done) فقط ولا يحتسب partial، ويستبعد أيام الغياب أو الأيام بلا وظيفة', () => {
      const s = makeStudent('s1', 'محمد')
      const days = [
        makeDay('d1', '2026-10-01', { hasHomework: true }),
        makeDay('d2', '2026-10-02', { hasHomework: true }),
        makeDay('d3', '2026-10-03', { hasHomework: true }),
        makeDay('d4', '2026-10-04', { hasHomework: false }), // بلا وظيفة
        makeDay('d5', '2026-10-05', { hasHomework: true }), // الطالب غائب
      ]
      const records = [
        makeRecord('r1', 'd1', 's1', { status: 'present', homework: 'done' }), // يحسب
        makeRecord('r2', 'd2', 's1', { status: 'late', homework: 'partial' }), // لا يحسب ككامل
        makeRecord('r3', 'd3', 's1', { status: 'present', homework: 'none' }), // صفر
        makeRecord('r4', 'd4', 's1', { status: 'present', homework: null }), // اليوم أصلاً بلا وظيفة
        makeRecord('r5', 'd5', 's1', { status: 'absent', homework: null }), // غائب
      ]
      const assessments = [makeAssessment('a1', '2026-10-01')]
      const grades = [makeGrade('g1', 'a1', 's1', 10)]

      const input: RankingInputData = {
        students: [s],
        days,
        records,
        assessments,
        grades,
      }

      const res = computeRanking(input, {}, { minDecidedDays: 1, minGradesCount: 1 })
      const row = res.rows[0]

      // الأيام المستحقة للوظيفة = d1, d2, d3 (3 أيام كان حاضراً/متأخراً واليوم فيه وظيفة)
      expect(row.homeworkCounts.totalEligible).toBe(3)
      expect(row.homeworkCounts.done).toBe(1)
      expect(row.homeworkCounts.partial).toBe(1)
      expect(row.homeworkCounts.none).toBe(1)
      // 1 ÷ 3 = 33.333%
      expect(row.homeworkRate).toBeCloseTo(33.333, 1)
    })
  })

  describe('إعادة توزيع الأوزان واستبعاد المعايير الفارغة', () => {
    it('يعيد توزيع وزن المعيار المفقود عند الطالب على باقي المعايير ولا يعامله كصفر', () => {
      const s = makeStudent('s1', 'أحمد')
      // طالب لديه حضور تام (100%) وعلامة تامة (100%) لكن لا يوجد إملاء ولا وظيفة
      const days = [
        makeDay('d1', '2026-10-01'),
        makeDay('d2', '2026-10-02'),
        makeDay('d3', '2026-10-03'),
        makeDay('d4', '2026-10-04'),
        makeDay('d5', '2026-10-05'),
      ]
      const records = days.map((d, i) =>
        makeRecord(`r${i}`, d.id, s.id, { status: 'present', behaviorScore: 10 }),
      )
      const assessments = [makeAssessment('a1', '2026-10-01', 10, 'quiz')]
      const grades = [makeGrade('g1', 'a1', s.id, 10)]

      const input: RankingInputData = {
        students: [s],
        days,
        records,
        assessments,
        grades,
      }

      const res = computeRanking(input)
      const row = res.rows[0]

      // بما أن الحضور 100 والسلوك 100 والعلامات 100، وغياب الإملاء والوظائف تم استبعاده وتوزيعه
      // الدرجة الكلية يجب أن تكون 100 تماماً (وليست 80 إذا عومل الإملاء والوظيفة كصفر!)
      expect(row.dictationAvg).toBeNull()
      expect(row.homeworkRate).toBeNull()
      expect(row.score).toBe(100)
    })

    it('يستبعد عمود المعيار من availableColumns إذا لم يتوفر لأي طالب في الشعبة', () => {
      const s1 = makeStudent('s1', 'طالب 1')
      const s2 = makeStudent('s2', 'طالب 2')
      const days = [
        makeDay('d1', '2026-10-01', { hasDictation: false, hasHomework: false }),
      ]
      const records = [
        makeRecord('r1', 'd1', s1.id),
        makeRecord('r2', 'd1', s2.id),
      ]
      const assessments = [makeAssessment('a1', '2026-10-01')]
      const grades = [makeGrade('g1', 'a1', s1.id, 9), makeGrade('g2', 'a1', s2.id, 8)]

      const res = computeRanking({ students: [s1, s2], days, records, assessments, grades }, {}, { minDecidedDays: 1, minGradesCount: 1 })
      expect(res.availableColumns.dictation).toBe(false)
      expect(res.availableColumns.homework).toBe(false)
      expect(res.availableColumns.attendance).toBe(true)
      expect(res.availableColumns.grades).toBe(true)
    })
  })

  describe('إلغاء قيد البيانات غير كافية وترتيب كل الطلاب ذوي البيانات', () => {
    it('يدخل الترتيب كل طالب لديه بيانات حضور أو علامات دون اشتراط حد أدنى', () => {
      const sFull = makeStudent('s1', 'كامل البيانات')
      const sPartial = makeStudent('s2', 'حضور يومين فقط')
      const sNoData = makeStudent('s3', 'بلا أي بيانات')

      const days = [
        makeDay('d1', '2026-10-01'),
        makeDay('d2', '2026-10-02'),
      ]

      const records: AttendanceRecord[] = [
        makeRecord('r1', 'd1', sFull.id, { status: 'present' }),
        makeRecord('r2', 'd2', sFull.id, { status: 'present' }),
        makeRecord('r3', 'd1', sPartial.id, { status: 'present' }),
        makeRecord('r4', 'd2', sPartial.id, { status: 'present' }),
      ]

      const assessments = [makeAssessment('a1', '2026-10-01')]
      const grades = [
        makeGrade('g1', 'a1', sFull.id, 10),
      ]

      const res = computeRanking(
        { students: [sFull, sPartial, sNoData], days, records, assessments, grades },
      )

      // sFull و sPartial كلاهما مصنفان ولهما رتب
      expect(res.rankedCount).toBe(2)
      expect(res.insufficientCount).toBe(1)

      const fullRow = res.rows.find((r) => r.student.id === sFull.id)!
      expect(fullRow.rank).toBe(1)

      const partialRow = res.rows.find((r) => r.student.id === sPartial.id)!
      expect(partialRow.rank).toBe(2)
      expect(partialRow.score).toBe(100) // حضوره 100% وأعيد توزيع وزنه

      const noDataRow = res.rows.find((r) => r.student.id === sNoData.id)!
      expect(noDataRow.rank).toBeNull()
      expect(noDataRow.score).toBeNull()
    })
  })

  describe('كسر التعادل ورتب التنافس (1، 2، 2، 4)', () => {
    it('يكسر التعادل بالأعلى علامات ثم الأعلى حضوراً، ثم بالاسم أبجدياً مع الرتبة نفسها', () => {
      // 4 طلاب
      const s1 = makeStudent('s1', 'أنس')
      const s2 = makeStudent('s2', 'بسام')
      const s3 = makeStudent('s3', 'جمال')
      const s4 = makeStudent('s4', 'طارق')

      const days = [
        makeDay('d1', '2026-10-01'),
        makeDay('d2', '2026-10-02'),
      ]
      const records = [
        makeRecord('r1', 'd1', s1.id, { status: 'present', behaviorScore: 10 }),
        makeRecord('r2', 'd2', s1.id, { status: 'present', behaviorScore: 10 }),

        makeRecord('r3', 'd1', s2.id, { status: 'present', behaviorScore: 10 }),
        makeRecord('r4', 'd2', s2.id, { status: 'present', behaviorScore: 10 }),

        makeRecord('r5', 'd1', s3.id, { status: 'present', behaviorScore: 10 }),
        makeRecord('r6', 'd2', s3.id, { status: 'present', behaviorScore: 10 }),

        makeRecord('r7', 'd1', s4.id, { status: 'present', behaviorScore: 10 }),
        makeRecord('r8', 'd2', s4.id, { status: 'absent', behaviorScore: 10 }), // طارق حضوره أقل
      ]

      const assessments = [makeAssessment('a1', '2026-10-01', 10, 'quiz')]
      const grades = [
        makeGrade('g1', 'a1', s1.id, 9),
        makeGrade('g2', 'a1', s2.id, 9), // أنس وبسام متطابقان تماماً
        makeGrade('g3', 'a1', s3.id, 10), // جمال علامته 10 أعلى منهما
        makeGrade('g4', 'a1', s4.id, 8),
      ]

      const res = computeRanking(
        { students: [s1, s2, s3, s4], days, records, assessments, grades },
        {},
        { minDecidedDays: 2, minGradesCount: 1 },
      )

      // جمال هو الأول
      expect(res.rows[0].student.id).toBe(s3.id)
      expect(res.rows[0].rank).toBe(1)

      // أنس وبسام متعادلان بالدرجة والعلامات والحضور، يأخذان رتبة 2
      expect(res.rows[1].rank).toBe(2)
      expect(res.rows[2].rank).toBe(2)
      // ومرتبان أبجدياً: أنس قبل بسام
      expect(res.rows[1].student.name).toBe('أنس')
      expect(res.rows[2].student.name).toBe('بسام')

      // طارق هو الرابع ويأخذ رتبة 4 وليس 3 (نمط المنافسة القياسي 1, 2, 2, 4)
      expect(res.rows[3].student.id).toBe(s4.id)
      expect(res.rows[3].rank).toBe(4)
    })
  })

  describe('تصفية الفترة الزمنية (DateRange)', () => {
    it('تصفّي الأيام والاختبارات الواقعة ضمن الفترة فقط', () => {
      const s = makeStudent('s1', 'خالد')
      const days = [
        makeDay('d1', '2026-10-01'), // داخل
        makeDay('d2', '2026-10-15'), // داخل
        makeDay('d3', '2026-11-05'), // خارج الفترة
      ]
      const records = [
        makeRecord('r1', 'd1', s.id, { status: 'present' }),
        makeRecord('r2', 'd2', s.id, { status: 'absent' }),
        makeRecord('r3', 'd3', s.id, { status: 'present' }),
      ]
      const assessments = [
        makeAssessment('a1', '2026-10-10', 10, 'quiz'), // داخل
        makeAssessment('a2', '2026-11-01', 10, 'exam'), // خارج
      ]
      const grades = [
        makeGrade('g1', 'a1', s.id, 8),
        makeGrade('g2', 'a2', s.id, 4),
      ]

      const res = computeRanking(
        { students: [s], days, records, assessments, grades },
        { from: '2026-10-01', to: '2026-10-31' },
        { minDecidedDays: 2, minGradesCount: 1 },
      )

      const row = res.rows[0]
      // الأيام المحسومة 2 (حاضر + غائب) ونسبة الحضور 50%
      expect(row.decidedDaysCount).toBe(2)
      expect(row.attendanceRate).toBe(50)
      // العلامات داخل الفترة: a1 فقط (80%)
      expect(row.validGradesCount).toBe(1)
      expect(row.quizAvg).toBe(80)
      expect(row.examAvg).toBeNull()
    })
  })

  describe('بناء مستند PDF لشعبة من 45 طالباً', () => {
    it('ينشئ مستند تقرير ترتيب الشعبة بدون أخطاء لشعبة تحوي 45 طالباً', () => {
      const students: Student[] = []
      const records: AttendanceRecord[] = []
      const grades: Grade[] = []
      const days = [
        makeDay('d1', '2026-10-01', { hasDictation: true, hasHomework: true }),
        makeDay('d2', '2026-10-02', { hasDictation: true, hasHomework: true }),
        makeDay('d3', '2026-10-03', { hasDictation: true, hasHomework: true }),
        makeDay('d4', '2026-10-04', { hasDictation: true, hasHomework: true }),
        makeDay('d5', '2026-10-05', { hasDictation: true, hasHomework: true }),
      ]
      const assessments = [
        makeAssessment('a1', '2026-10-02', 10, 'quiz'),
        makeAssessment('a2', '2026-10-04', 100, 'exam'),
      ]

      for (let i = 1; i <= 45; i++) {
        const id = `student_${i}`
        const name = `طالب رقم ${i}`
        students.push(makeStudent(id, name))

        days.forEach((d) => {
          records.push(
            makeRecord(`r_${id}_${d.id}`, d.id, id, {
              status: i % 10 === 0 ? 'absent' : 'present',
              homework: i % 3 === 0 ? 'partial' : 'done',
              dictationScore: 8 + (i % 3),
              behaviorScore: 9,
            }),
          )
        })

        grades.push(makeGrade(`g_${id}_a1`, 'a1', id, 7 + (i % 4)))
        grades.push(makeGrade(`g_${id}_a2`, 'a2', id, 70 + (i % 25)))
      }

      const ranking = computeRanking({ students, days, records, assessments, grades })
      expect(ranking.totalStudents).toBe(45)
      expect(ranking.rankedCount).toBeGreaterThan(0)

      const doc = buildRankingReportDocument(
        ranking,
        { schoolName: 'مدرسة التفوق', sectionName: 'الصف الخامس / أ', teacherName: 'الأستاذ خالد' },
        { today: '2026-10-30' },
      )

      expect(doc).toBeDefined()
      expect(doc.pageSize).toBe('A4')
      expect(doc.pageOrientation).toBe('landscape')
      expect(doc.content).toBeInstanceOf(Array)
      expect(doc.content.length).toBeGreaterThan(0)

      // التحقق من أن أعمدة الجدول تظهر بالترتيب العربي (الرتبة # على أقصى اليمين، والحالة/ملاحظة على أقصى اليسار)
      const tableContent = doc.content[2] as { table: { widths: unknown[]; body: { text: string }[][] } }
      expect(tableContent.table).toBeDefined()
      const headerRow = tableContent.table.body[0]
      // في pdfmake، الفهرس 0 يظهر على أقصى اليسار والفهرس الأخير على أقصى اليمين
      expect(headerRow[0].text).toBe('الحالة / ملاحظة')
      expect(headerRow[headerRow.length - 1].text).toBe('#')
      expect(headerRow[headerRow.length - 2].text).toBe('اسم الطالب')
    })
  })

  describe('التكامل مع قاعدة البيانات loadClassRanking', () => {
    it('يقرأ البيانات من جداول Dexie بعدد ثابت من الاستعلامات', async () => {
      const s1 = makeStudent('s1', 'يوسف')
      const s2 = makeStudent('s2', 'كريم', 0) // معطل لا يدخل
      await db.students.bulkAdd([s1, s2])

      const d1 = makeDay('d1', '2026-10-01')
      await db.attendanceDays.add(d1)
      await db.attendanceRecords.add(makeRecord('r1', 'd1', s1.id))

      const a1 = makeAssessment('a1', '2026-10-01')
      await db.assessments.add(a1)
      await db.grades.add(makeGrade('g1', 'a1', s1.id, 9))

      const result = await loadClassRanking({}, { minDecidedDays: 1, minGradesCount: 1 })
      expect(result.totalStudents).toBe(1)
      expect(result.rows[0].student.id).toBe(s1.id)
      expect(result.rows[0].rank).toBe(1)
    })
  })
})
