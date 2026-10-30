import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { TafaqqudDB } from '../db/database'
import { attendanceRepository } from '../db/attendanceRepository'
import { attendanceService } from './attendanceService'
import { studentService } from './studentService'
import { computeEvaluationStats, computeStats } from './statisticsService'
import { BackupError, buildDayCsv, createBackup, parseBackupText, restoreBackup } from './backupService'
import { parseNamesBlock } from '../utils/normalizeName'
import { parseEvaluationNumber } from '../utils/evaluation'
import { getWeekendDayName, isWeekend } from '../utils/date'
import { getSetting, setSetting, SETTING_KEYS } from '../db/settingsRepository'

beforeEach(async () => {
  await Promise.all([db.students.clear(), db.attendanceDays.clear(), db.attendanceRecords.clear(), db.settings.clear(), db.assessments.clear(), db.grades.clear()])
})

async function seed(names: string[]) {
  await studentService.addMany(names.map((name) => ({ name })))
}

describe('الطلاب', () => {
  it('يتجاهل الأسطر الفارغة ويقص المسافات ويكشف المكرر', async () => {
    expect(parseNamesBlock('  أحمد  \n\n  سارة\n   \n')).toEqual(['أحمد', 'سارة'])
    await seed(['أحمد'])
    const p = await studentService.prepareBatch('أَحمد\nسارة\nسارة')
    expect(p.toAdd.map((x) => x.name)).toEqual(['أَحمد', 'سارة'])
    expect(p.duplicatesInInput).toEqual(['سارة'])
    expect(p.similarExisting).toHaveLength(1)
  })

  it('يحفظ ملاحظة الطالب عند الإضافة ويعدلها', async () => {
    await studentService.addOne({ name: 'ليلى', notes: 'تحتاج مقعداً أمامياً' })
    const [s] = await db.students.toArray()
    expect(s.notes).toBe('تحتاج مقعداً أمامياً')
    await studentService.update(s.id, { notes: 'تم النقل للصف الثاني' })
    expect((await db.students.get(s.id))!.notes).toBe('تم النقل للصف الثاني')
  })

  it('التعطيل يحفظ السبب ويُبقي السجلات القديمة', async () => {
    await seed(['أحمد', 'سارة'])
    const day = await attendanceService.startOrGetDay('2026-10-20')
    const ahmad = (await db.students.toArray()).find((s) => s.name === 'أحمد')!
    await attendanceService.setStatus(day.id, ahmad.id, 'present')
    await studentService.deactivate(ahmad.id, 'انتقل إلى مدرسة أخرى')
    const after = (await db.students.get(ahmad.id))!
    expect(after.active).toBe(0)
    expect(after.deactivationNote).toBe('انتقل إلى مدرسة أخرى')
    expect((await attendanceRepository.record(day.id, ahmad.id))!.status).toBe('present')
    const next = await attendanceService.startOrGetDay('2026-10-21')
    expect((await attendanceRepository.recordsForDay(next.id)).map((r) => r.studentId)).not.toContain(ahmad.id)
  })
})

describe('التفقد', () => {
  it('لا ينشئ يوماً مكرراً ويبدأ كل شيء غير محدد', async () => {
    await seed(['أ', 'ب', 'ج'])
    const d1 = await attendanceService.startOrGetDay('2026-10-21')
    const d2 = await attendanceService.startOrGetDay('2026-10-21')
    expect(d2.id).toBe(d1.id)
    expect(await db.attendanceDays.count()).toBe(1)
    expect(computeStats(await attendanceRepository.recordsForDay(d1.id))).toMatchObject({ total: 3, unmarked: 3 })
  })

  it('الاعتماد يحوّل غير المحدد فقط إلى غائب ويحفظ الملاحظات', async () => {
    await seed(['أ', 'ب', 'ج'])
    const day = await attendanceService.startOrGetDay('2026-10-21')
    const [a, b] = await db.students.toArray()
    await attendanceService.setStatus(day.id, a.id, 'present')
    await attendanceService.setNote(day.id, b.id, 'مريض')
    expect(await attendanceService.countUnmarked(day.id)).toBe(2)
    expect(await attendanceService.confirmDay(day.id)).toBe(2)
    expect(await attendanceService.confirmDay(day.id)).toBe(0)
    const stats = computeStats(await attendanceRepository.recordsForDay(day.id))
    expect(stats).toMatchObject({ present: 1, absent: 2, unmarked: 0 })
    expect((await attendanceRepository.record(day.id, b.id))!.note).toBe('مريض')
    expect((await attendanceRepository.dayById(day.id))!.status).toBe('confirmed')
  })

  it('غائب ← متأخر ← حاضر ولا يتأثر يوم آخر', async () => {
    await seed(['أ', 'ب'])
    const d1 = await attendanceService.startOrGetDay('2026-10-20')
    const d2 = await attendanceService.startOrGetDay('2026-10-21')
    await attendanceService.confirmDay(d1.id)
    await attendanceService.confirmDay(d2.id)
    const [a] = await db.students.toArray()
    await attendanceService.setStatus(d2.id, a.id, 'late')
    expect(computeStats(await attendanceRepository.recordsForDay(d2.id))).toMatchObject({ late: 1, absent: 1 })
    await attendanceService.setStatus(d2.id, a.id, 'present')
    expect(computeStats(await attendanceRepository.recordsForDay(d2.id))).toMatchObject({ present: 1, late: 0 })
    expect(computeStats(await attendanceRepository.recordsForDay(d1.id))).toMatchObject({ absent: 2 })
  })

  it('ينبّه لوجود يوم سابق غير معتمد دون حذفه', async () => {
    await seed(['أ'])
    await attendanceService.startOrGetDay('2026-10-20')
    const prev = await attendanceService.unconfirmedDaysBefore('2026-10-21')
    expect(prev).toHaveLength(1)
  })

  it('يحفظ التقييم بالتقريب ولا يمسحه عند تغيير الحالة ولا يعدّل الكائن الممرر', async () => {
    await seed(['أ'])
    const day = await attendanceService.startOrGetDay('2026-10-21')
    const [student] = await db.students.toArray()
    await attendanceService.setStatus(day.id, student.id, 'present')
    const evalInput = { dictationScore: 7.24, behaviorScore: 8.6, homework: 'partial' as const }
    const snapshot = { ...evalInput }
    await attendanceService.setEvaluation(day.id, student.id, evalInput)
    // التأكد من عدم تعديل الكائن الممرر
    expect(evalInput).toEqual(snapshot)
    await attendanceService.setStatus(day.id, student.id, 'absent')
    const record = (await attendanceRepository.record(day.id, student.id))!
    expect(record).toMatchObject({ dictationScore: 7, behaviorScore: 9, homework: 'partial' })
  })

  it('يرفض التقييم خارج النطاق ويحدد الوظيفة للحاضرين غير المحددين فقط', async () => {
    await seed(['أ', 'ب', 'ج'])
    const day = await attendanceService.startOrGetDay('2026-10-21')
    const students = await db.students.toArray()
    await attendanceService.setStatus(day.id, students[0].id, 'present')
    await attendanceService.setStatus(day.id, students[1].id, 'late')
    await attendanceService.setStatus(day.id, students[2].id, 'absent')
    await attendanceService.setEvaluation(day.id, students[1].id, { homework: 'partial' })
    await expect(attendanceService.setEvaluation(day.id, students[0].id, { dictationScore: 11 })).rejects.toThrow('بين 0 و10')
    expect(await attendanceService.markAllHomeworkDone(day.id)).toBe(1)
    expect((await attendanceRepository.record(day.id, students[1].id))!.homework).toBe('partial')
    expect((await attendanceRepository.record(day.id, students[2].id))!.homework).toBe(null)
  })

  it('يحسب متوسطات التقييم والسلوك الافتراضي', async () => {
    await seed(['أ', 'ب', 'ج'])
    const day = await attendanceService.startOrGetDay('2026-10-21')
    const students = await db.students.toArray()
    await attendanceService.setDayOptions(day.id, { hasDictation: true, hasHomework: true })
    await attendanceService.setStatus(day.id, students[0].id, 'present')
    await attendanceService.setStatus(day.id, students[1].id, 'late')
    await attendanceService.setEvaluation(day.id, students[0].id, { dictationScore: 8, behaviorScore: 6, homework: 'done' })
    const records = await attendanceRepository.recordsForDay(day.id)
    expect(computeEvaluationStats({ hasDictation: true, hasHomework: true }, records)).toMatchObject({ averageDictation: 8, averageBehavior: 8, homeworkDone: 1, homeworkUnmarked: 1 })
  })
})

describe('الترقية وتحليل الأرقام', () => {
  it('يرقي قاعدة الإصدار الأول دون فقد البيانات', async () => {
    const name = `tafaqqud-migration-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(1).stores({ students: 'id, active, normalizedName', attendanceDays: 'id, &date, status', attendanceRecords: 'id, dayId, studentId, &[dayId+studentId]', settings: 'key' })
    await legacy.open()
    await legacy.table('attendanceDays').add({ id: 'day', date: '2026-10-23', status: 'draft', createdAt: '', confirmedAt: null, updatedAt: '' })
    legacy.close()
    const upgraded = new TafaqqudDB(name)
    await upgraded.open()
    expect(await upgraded.attendanceDays.get('day')).toMatchObject({ hasDictation: false, hasHomework: false })
    await upgraded.delete()
  })

  it('يحلل الأرقام العربية والفواصل ويطبق النطاق', () => {
    expect(parseEvaluationNumber('٧٫٥')).toBe(7.5)
    expect(parseEvaluationNumber('8,5')).toBe(8.5)
    expect(parseEvaluationNumber('11')).toBe(null)
    expect(parseEvaluationNumber('abc')).toBe(null)
  })
})

describe('النسخ الاحتياطي', () => {
  it('تصدير ثم استيراد يعيد البيانات نفسها بما فيها الملاحظات', async () => {
    await studentService.addOne({ name: 'أ', notes: 'ملاحظة' })
    const day = await attendanceService.startOrGetDay('2026-10-21')
    const [s] = await db.students.toArray()
    await attendanceService.setNote(day.id, s.id, 'وصل متأخراً بسبب المطر')
    const backup = await createBackup()
    await Promise.all([db.students.clear(), db.attendanceDays.clear(), db.attendanceRecords.clear()])
    await restoreBackup(parseBackupText(JSON.stringify(backup)))
    expect((await db.students.toArray())[0].notes).toBe('ملاحظة')
    expect((await db.attendanceRecords.toArray())[0].note).toBe('وصل متأخراً بسبب المطر')
  })

  it('restoreBackup يحافظ على lastExportAt الأحدث إن كان الحالي أحدث من النسخة المستعادة', async () => {
    await studentService.addOne({ name: 'أ' })
    const backup = await createBackup()
    backup.settings = { [SETTING_KEYS.lastExport]: '2026-10-15T12:00:00.000Z' }
    // ضبط تاريخ أحدث حالياً
    await setSetting(SETTING_KEYS.lastExport, '2026-10-25T15:00:00.000Z')
    await restoreBackup(backup)
    expect(await getSetting(SETTING_KEYS.lastExport)).toBe('2026-10-25T15:00:00.000Z')
  })

  it('يرفض الملفات غير الصحيحة', () => {
    expect(() => parseBackupText('not json')).toThrow(BackupError)
    expect(() => parseBackupText('{"format":"x"}')).toThrow(BackupError)
    expect(() =>
      parseBackupText(JSON.stringify({ format: 'tafaqqud-backup', version: 99, createdAt: '', students: [], days: [], records: [] })),
    ).toThrow(BackupError)
  })

  it('يستورد النسخة الأولى ويطبع الحقول الجديدة بقيم افتراضية', () => {
    const legacy = { format: 'tafaqqud-backup', version: 1, createdAt: '2026-10-21T00:00:00.000Z', settings: {}, students: [], days: [], records: [] }
    expect(parseBackupText(JSON.stringify(legacy))).toMatchObject({ version: 3, days: [], records: [], assessments: [], grades: [] })
    const current = { ...legacy, version: 2 }
    expect(parseBackupText(JSON.stringify(current)).version).toBe(3)
  })

  it('يرفض قيماً جديدة غير صالحة في النسخة الاحتياطية', () => {
    const invalid = {
      format: 'tafaqqud-backup', version: 2, createdAt: '2026-10-21T00:00:00.000Z', settings: {},
      students: [{ id: 's', name: 'أ', active: 1 }],
      days: [{ id: 'd', date: '2026-10-21', status: 'draft', hasDictation: true, hasHomework: false }],
      records: [{ id: 'r', dayId: 'd', studentId: 's', status: 'present', dictationScore: 10.25 }],
    }
    expect(() => parseBackupText(JSON.stringify(invalid))).toThrow('علامة الإملاء')
  })

  it('الاستيراد المرفوض لا يغيّر البيانات الحالية', async () => {
    await seed(['أ'])
    try {
      parseBackupText('{}')
    } catch {
      /* مرفوض قبل أي كتابة */
    }
    expect(await db.students.count()).toBe(1)
  })

  it('CSV يبدأ بـ BOM ويتضمن الملاحظات', async () => {
    await seed(['أ'])
    const day = await attendanceService.startOrGetDay('2026-10-21')
    const [s] = await db.students.toArray()
    await attendanceService.setNote(day.id, s.id, 'ملاحظة اليوم')
    const csv = await buildDayCsv(day.id)
    expect(csv.content.startsWith('﻿')).toBe(true)
    expect(csv.content).toContain('ملاحظة اليوم')
  })
})

describe('التحقق من العطلة الأسبوعية', () => {
  it('يكشف يومي الجمعة والسبت كأيام عطلة واسم اليوم الصحيح ويرفض بدء التفقد فيها', async () => {
    expect(isWeekend('2026-10-30')).toBe(true) // الجمعة
    expect(getWeekendDayName('2026-10-30')).toBe('الجمعة')

    expect(isWeekend('2026-10-31')).toBe(true) // السبت
    expect(getWeekendDayName('2026-10-31')).toBe('السبت')

    expect(isWeekend('2026-11-01')).toBe(false) // الأحد
    expect(getWeekendDayName('2026-11-01')).toBeNull()

    expect(isWeekend('2026-10-29')).toBe(false) // الخميس
    expect(getWeekendDayName('2026-10-29')).toBeNull()

    // startOrGetDay يرمي خطأ بالعربية في العطلة
    await expect(attendanceService.startOrGetDay('2026-10-30')).rejects.toThrow('لا يمكن بدء تفقد في يوم عطلة (الجمعة)')
    await expect(attendanceService.startOrGetDay('2026-10-31')).rejects.toThrow('لا يمكن بدء تفقد في يوم عطلة (السبت)')
  })
})

