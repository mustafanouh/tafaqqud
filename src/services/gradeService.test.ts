import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { attendanceService } from './attendanceService'
import { createBackup, parseBackupText, restoreBackup } from './backupService'
import { gradeService, summarizePercents, toPercent } from './gradeService'
import { loadStudentProfile } from './studentProfileService'
import { studentService } from './studentService'
import { buildStudentReportDocument } from './studentPdfService'

beforeEach(async () => {
  await Promise.all([db.students.clear(), db.attendanceDays.clear(), db.attendanceRecords.clear(), db.settings.clear(), db.assessments.clear(), db.grades.clear()])
})

async function seed(names: string[]) {
  await studentService.addMany(names.map((name) => ({ name })))
  return db.students.toArray()
}

const quiz = { type: 'quiz' as const, title: 'مذاكرة الدرس الأول', subject: 'رياضيات', date: '2026-10-20', maxScore: 10 }

describe('الاختبارات والعلامات', () => {
  it('ينشئ سجل علامة فارغاً لكل طالب نشط فقط', async () => {
    const [a, b] = await seed(['أحمد', 'سارة'])
    await studentService.deactivate(b.id, '')
    const assessment = await gradeService.createAssessment(quiz)
    const grades = await db.grades.where('assessmentId').equals(assessment.id).toArray()
    expect(grades.map((g) => g.studentId)).toEqual([a.id])
    expect(grades[0].score).toBeNull()
  })

  it('يرفض مدخلات غير صالحة', async () => {
    await expect(gradeService.createAssessment({ ...quiz, title: '  ' })).rejects.toThrow('عنوان')
    await expect(gradeService.createAssessment({ ...quiz, maxScore: 0 })).rejects.toThrow('العظمى')
    await expect(gradeService.createAssessment({ ...quiz, date: '2026-13-40' })).rejects.toThrow('تاريخ')
  })

  it('يتحقق من العلامة ضمن 0 والعظمى ويحفظ الغياب', async () => {
    const [a] = await seed(['أحمد'])
    const t = await gradeService.createAssessment(quiz)
    await expect(gradeService.setGrade(t.id, a.id, { score: 11 })).rejects.toThrow('العظمى')
    await expect(gradeService.setGrade(t.id, a.id, { score: -1 })).rejects.toThrow()
    await gradeService.setGrade(t.id, a.id, { score: 8.456 })
    expect((await gradeService.forStudent(a.id))[0].grade!.score).toBe(8.46)
    await gradeService.setGrade(t.id, a.id, { absent: true })
    const row = (await gradeService.forStudent(a.id))[0]
    expect(row.grade!.absent).toBe(true)
    expect(row.grade!.score).toBeNull()
    expect(row.percent).toBeNull()
  })

  it('ينشئ سجلاً لطالب أُضيف بعد إنشاء الاختبار', async () => {
    await seed(['أحمد'])
    const t = await gradeService.createAssessment(quiz)
    await studentService.addOne({ name: 'متأخر الانضمام' })
    const late = (await db.students.toArray()).find((s) => s.name === 'متأخر الانضمام')!
    await gradeService.setGrade(t.id, late.id, { score: 7 })
    expect((await gradeService.forStudent(late.id))[0].percent).toBe(70)
  })

  it('لا يسمح بتخفيض العلامة العظمى تحت علامة موجودة، والحذف يزيل العلامات', async () => {
    const [a] = await seed(['أحمد'])
    const t = await gradeService.createAssessment({ ...quiz, maxScore: 20 })
    await gradeService.setGrade(t.id, a.id, { score: 15 })
    await expect(gradeService.updateAssessment(t.id, { ...quiz, maxScore: 10 })).rejects.toThrow('تخفيض')
    await gradeService.deleteAssessment(t.id)
    expect(await db.grades.count()).toBe(0)
    expect(await db.assessments.count()).toBe(0)
  })

  it('الحساب بالنسبة المئوية يوحّد المذاكرة والامتحان', () => {
    expect(toPercent(8, 10)).toBe(80)
    expect(summarizePercents([80, null, 60])).toMatchObject({ count: 2, averagePercent: 70, bestPercent: 80, worstPercent: 60 })
    expect(summarizePercents([null])).toMatchObject({ count: 0, averagePercent: null })
  })
})

describe('الملف الشخصي', () => {
  it('يجمع الحضور والتقييم والعلامات ويطبّق الفترة الزمنية', async () => {
    const [a] = await seed(['أحمد'])
    for (const [date, status] of [['2026-10-18', 'present'], ['2026-10-19', 'absent'], ['2026-10-20', 'late']] as const) {
      const day = await attendanceService.startOrGetDay(date)
      await attendanceService.setStatus(day.id, a.id, status)
      await attendanceService.setDayOptions(day.id, { hasDictation: true })
      if (status !== 'absent') await attendanceService.setEvaluation(day.id, a.id, { dictationScore: status === 'present' ? 10 : 6, behaviorScore: 8 })
      await attendanceService.confirmDay(day.id)
    }
    const q = await gradeService.createAssessment(quiz)
    const e = await gradeService.createAssessment({ type: 'exam', title: 'امتحان نصفي', subject: '', date: '2026-10-25', maxScore: 100 })
    await gradeService.setGrade(q.id, a.id, { score: 9 })
    await gradeService.setGrade(e.id, a.id, { score: 70 })

    const p = (await loadStudentProfile(a.id))!
    expect(p.attendanceStats).toMatchObject({ total: 3, present: 1, absent: 1, late: 1 })
    expect(p.attendanceRate).toBeCloseTo(66.67, 1)
    expect(p.evaluation.averageDictation).toBe(8)
    expect(p.evaluation.averageBehavior).toBe(8)
    expect(p.quizSummary.averagePercent).toBe(90)
    expect(p.examSummary.averagePercent).toBe(70)
    expect(p.overallSummary.averagePercent).toBe(80)
    expect(p.grades.map((g) => g.assessment.type)).toEqual(['exam', 'quiz'])

    const ranged = (await loadStudentProfile(a.id, { from: '2026-10-19', to: '2026-10-20' }))!
    expect(ranged.attendanceStats.total).toBe(2)
    expect(ranged.grades).toHaveLength(1)
    expect(await loadStudentProfile('missing')).toBeNull()
  })
})

describe('تقرير الطالب', () => {
  it('يبني مستنداً RTL بالخط العربي ويحوي العلامات دون عكس الأرقام', async () => {
    const [a] = await seed(['أحمد'])
    const t = await gradeService.createAssessment({ ...quiz, subject: '' })
    await gradeService.setGrade(t.id, a.id, { score: 10 })
    const profile = (await loadStudentProfile(a.id))!
    const doc = buildStudentReportDocument(profile, { schoolName: 'مدرسة النور' }, {}, '2026-10-27')
    const json = JSON.stringify(doc)
    expect(doc.rtl).toBe(true)
    expect(doc.defaultStyle.font).toBe('Cairo')
    expect(json).toContain('10 / 10')
    expect(json).toContain('100%')
    expect(json).not.toContain('001%')
    expect(json).toContain('مدرسة النور')
  })

  it('يُظهر جدول علامات الإملاء مع التاريخ في تقرير الطالب', async () => {
    const [a] = await seed(['سامي'])
    const day = await attendanceService.startOrGetDay('2026-10-25')
    await attendanceService.setDayOptions(day.id, { hasDictation: true })
    await attendanceService.setStatus(day.id, a.id, 'present')
    await attendanceService.setEvaluation(day.id, a.id, { dictationScore: 8.5 })
    const profile = (await loadStudentProfile(a.id))!
    const doc = buildStudentReportDocument(profile, {}, {}, '2026-10-27')
    const json = JSON.stringify(doc)
    expect(json).toContain('سجل علامات الإملاء')
    expect(json).toContain('2026-10-25')
    expect(json).toContain('8.5 / 10')
  })
})

describe('النسخ الاحتياطي للعلامات', () => {
  it('يحفظ ويستعيد الاختبارات والعلامات ويرفض الإشارات المكسورة', async () => {
    const [a] = await seed(['أحمد'])
    const t = await gradeService.createAssessment(quiz)
    await gradeService.setGrade(t.id, a.id, { score: 9 })
    const backup = await createBackup()
    expect(backup.version).toBe(3)
    await Promise.all([db.students.clear(), db.assessments.clear(), db.grades.clear()])
    await restoreBackup(parseBackupText(JSON.stringify(backup)))
    expect((await gradeService.forStudent(a.id))[0].grade!.score).toBe(9)

    const broken = { ...backup, grades: [{ ...backup.grades[0], assessmentId: 'nope' }] }
    expect(() => parseBackupText(JSON.stringify(broken))).toThrow('اختبار غير موجود')
    const tooHigh = { ...backup, grades: [{ ...backup.grades[0], score: 99 }] }
    expect(() => parseBackupText(JSON.stringify(tooHigh))).toThrow('غير صالحة')
  })
})
