import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { attendanceRepository } from '../db/attendanceRepository'
import { attendanceService } from './attendanceService'
import { studentService } from './studentService'
import { computeStats } from './statisticsService'
import { BackupError, buildDayCsv, createBackup, parseBackupText, restoreBackup } from './backupService'
import { parseNamesBlock } from '../utils/normalizeName'

beforeEach(async () => {
  await Promise.all([db.students.clear(), db.attendanceDays.clear(), db.attendanceRecords.clear(), db.settings.clear()])
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
    const d1 = await attendanceService.startOrGetDay('2026-10-23')
    const d2 = await attendanceService.startOrGetDay('2026-10-23')
    expect(d2.id).toBe(d1.id)
    expect(await db.attendanceDays.count()).toBe(1)
    expect(computeStats(await attendanceRepository.recordsForDay(d1.id))).toMatchObject({ total: 3, unmarked: 3 })
  })

  it('الاعتماد يحوّل غير المحدد فقط إلى غائب ويحفظ الملاحظات', async () => {
    await seed(['أ', 'ب', 'ج'])
    const day = await attendanceService.startOrGetDay('2026-10-23')
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
    const d1 = await attendanceService.startOrGetDay('2026-10-22')
    const d2 = await attendanceService.startOrGetDay('2026-10-23')
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
    await attendanceService.startOrGetDay('2026-10-22')
    const prev = await attendanceService.unconfirmedDaysBefore('2026-10-23')
    expect(prev).toHaveLength(1)
  })
})

describe('النسخ الاحتياطي', () => {
  it('تصدير ثم استيراد يعيد البيانات نفسها بما فيها الملاحظات', async () => {
    await studentService.addOne({ name: 'أ', notes: 'ملاحظة' })
    const day = await attendanceService.startOrGetDay('2026-10-23')
    const [s] = await db.students.toArray()
    await attendanceService.setNote(day.id, s.id, 'وصل متأخراً بسبب المطر')
    const backup = await createBackup()
    await Promise.all([db.students.clear(), db.attendanceDays.clear(), db.attendanceRecords.clear()])
    await restoreBackup(parseBackupText(JSON.stringify(backup)))
    expect((await db.students.toArray())[0].notes).toBe('ملاحظة')
    expect((await db.attendanceRecords.toArray())[0].note).toBe('وصل متأخراً بسبب المطر')
  })

  it('يرفض الملفات غير الصحيحة', () => {
    expect(() => parseBackupText('not json')).toThrow(BackupError)
    expect(() => parseBackupText('{"format":"x"}')).toThrow(BackupError)
    expect(() =>
      parseBackupText(JSON.stringify({ format: 'tafaqqud-backup', version: 99, createdAt: '', students: [], days: [], records: [] })),
    ).toThrow(BackupError)
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
    const day = await attendanceService.startOrGetDay('2026-10-23')
    const [s] = await db.students.toArray()
    await attendanceService.setNote(day.id, s.id, 'ملاحظة اليوم')
    const csv = await buildDayCsv(day.id)
    expect(csv.content.startsWith('﻿')).toBe(true)
    expect(csv.content).toContain('ملاحظة اليوم')
  })
})
