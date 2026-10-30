import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/database'
import { getSetting, setSetting, SETTING_KEYS } from '../db/settingsRepository'
import { BACKUP_STALE_DAYS, exportBackupFile } from './backupService'
import { toBase64 } from './pdfReportService'
import { attendanceRepository } from '../db/attendanceRepository'
import { studentRepository } from '../db/studentRepository'

beforeEach(async () => {
  await Promise.all([
    db.students.clear(),
    db.attendanceDays.clear(),
    db.attendanceRecords.clear(),
    db.settings.clear(),
    db.assessments.clear(),
    db.grades.clear(),
  ])
})

describe('حماية البيانات والتذكير بالنسخ الاحتياطي', () => {
  it('ثابت الأيام 7 موجود في مكان واحد قابل للتعديل', () => {
    expect(BACKUP_STALE_DAYS).toBe(7)
  })

  it('exportBackupFile ينفذ التصدير ويحدث lastExportAt', async () => {
    await studentRepository.add({
      id: 's1',
      name: 'محمود',
      normalizedName: 'محمود',
      active: 1,
      notes: '',
      deactivationNote: '',
      deactivatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const res = await exportBackupFile()
    expect(res.filename).toContain('tafaqqud-backup')
    const lastExport = await getSetting(SETTING_KEYS.lastExport)
    expect(lastExport).toBeTruthy()
  })

  it('تأجيل النسخ الاحتياطي يخزن في جدول settings وليس localStorage', async () => {
    const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await setSetting(SETTING_KEYS.backupSnoozedUntil, futureTime)
    expect(await getSetting(SETTING_KEYS.backupSnoozedUntil)).toBe(futureTime)
  })
})

describe('تحسين أداء تحويل الخط إلى Base64', () => {
  it('يحول البيانات الكبيرة بالشرائح 0x8000 بنجاح وبنفس نتيجة التجميع التقليدي', async () => {
    // محاكاة استجابة fetch لملف خط ثنائي بحجم 100KB
    const mockSize = 100 * 1024
    const originalBuffer = new Uint8Array(mockSize)
    for (let i = 0; i < mockSize; i++) {
      originalBuffer[i] = (i * 31 + 7) % 256
    }

    // تجهيز mock fetch
    const mockResponse = {
      ok: true,
      arrayBuffer: async () => originalBuffer.buffer,
    } as Response

    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => mockResponse

    try {
      const base64Result = await toBase64('mock://test-font.ttf')
      expect(base64Result).toBeTruthy()
      expect(base64Result.length).toBeGreaterThan(mockSize)

      // التحقق من صحة فك التشفير
      const decodedBinary = atob(base64Result)
      expect(decodedBinary.length).toBe(mockSize)
      expect(decodedBinary.charCodeAt(0)).toBe(originalBuffer[0])
      expect(decodedBinary.charCodeAt(100)).toBe(originalBuffer[100])
      expect(decodedBinary.charCodeAt(mockSize - 1)).toBe(originalBuffer[mockSize - 1])
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('طبقة المستودعات والوصول الموحد للبيانات', () => {
  it('attendanceRepository.recordsForDays يجلب فقط سجلات الأيام المطلوبة دون تحميل باقي السجلات', async () => {
    await db.attendanceRecords.bulkAdd([
      { id: 'r1', dayId: 'day-1', studentId: 's1', status: 'present', note: '', createdAt: '', updatedAt: '', dictationScore: null, homework: null, behaviorScore: null },
      { id: 'r2', dayId: 'day-1', studentId: 's2', status: 'absent', note: '', createdAt: '', updatedAt: '', dictationScore: null, homework: null, behaviorScore: null },
      { id: 'r3', dayId: 'day-2', studentId: 's1', status: 'present', note: '', createdAt: '', updatedAt: '', dictationScore: null, homework: null, behaviorScore: null },
      { id: 'r4', dayId: 'day-3', studentId: 's1', status: 'late', note: '', createdAt: '', updatedAt: '', dictationScore: null, homework: null, behaviorScore: null },
    ])

    const recordsDay1And2 = await attendanceRepository.recordsForDays(['day-1', 'day-2'])
    expect(recordsDay1And2).toHaveLength(3)
    expect(recordsDay1And2.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3'])

    const empty = await attendanceRepository.recordsForDays([])
    expect(empty).toEqual([])
  })

  it('studentRepository.bulkGet يسترجع الطلاب المحددين فقط', async () => {
    await studentRepository.bulkAdd([
      { id: 's1', name: 'أحمد', normalizedName: 'احمد', active: 1, notes: '', deactivationNote: '', deactivatedAt: null, createdAt: '', updatedAt: '' },
      { id: 's2', name: 'سارة', normalizedName: 'سارة', active: 0, notes: '', deactivationNote: '', deactivatedAt: null, createdAt: '', updatedAt: '' },
      { id: 's3', name: 'زيد', normalizedName: 'زيد', active: 1, notes: '', deactivationNote: '', deactivatedAt: null, createdAt: '', updatedAt: '' },
    ])

    const retrieved = await studentRepository.bulkGet(['s1', 's2'])
    expect(retrieved).toHaveLength(2)
    expect(retrieved.map((s) => s?.name)).toEqual(['أحمد', 'سارة'])
  })
})
