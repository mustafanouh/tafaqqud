import { db } from '../db/database'
import { getAllSettings, setSetting, SETTING_KEYS } from '../db/settingsRepository'
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile } from '../types/backup'
import { STATUS_LABEL, type AttendanceDay, type AttendanceRecord, type RecordStatus } from '../types/attendance'
import type { Student } from '../types/student'
import { isValidDateString, nowIso } from '../utils/date'
import { toCsv } from '../utils/csv'

const RECORD_STATUSES: RecordStatus[] = ['unmarked', 'present', 'absent', 'late']

export class BackupError extends Error {}

export async function createBackup(): Promise<BackupFile> {
  const [settings, students, days, records] = await Promise.all([
    getAllSettings(),
    db.students.toArray(),
    db.attendanceDays.toArray(),
    db.attendanceRecords.toArray(),
  ])
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: nowIso(), settings, students, days, records }
}

export async function markExported(): Promise<void> {
  await setSetting(SETTING_KEYS.lastExport, nowIso())
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'

/** يتحقق من البنية ويُرجع ملفاً مُطبَّعاً (مع قيم افتراضية للحقول الاختيارية) أو يرمي BackupError */
export function validateBackup(raw: unknown): BackupFile {
  if (!isObj(raw)) throw new BackupError('الملف ليس نسخة احتياطية صالحة')
  if (raw.format !== BACKUP_FORMAT) throw new BackupError('هذا الملف ليس نسخة احتياطية من تطبيق تفقد')
  if (raw.version !== BACKUP_VERSION) throw new BackupError(`إصدار النسخة غير مدعوم (${String(raw.version)})`)
  if (!isStr(raw.createdAt)) throw new BackupError('تاريخ إنشاء النسخة مفقود')
  if (!Array.isArray(raw.students) || !Array.isArray(raw.days) || !Array.isArray(raw.records)) {
    throw new BackupError('بنية الملف غير صحيحة')
  }
  const settings: Record<string, string> = {}
  if (isObj(raw.settings)) {
    for (const [k, v] of Object.entries(raw.settings)) if (isStr(v)) settings[k] = v
  }

  const studentIds = new Set<string>()
  const students: Student[] = raw.students.map((s, i) => {
    if (!isObj(s) || !isStr(s.id) || !isStr(s.name) || !s.name.trim()) {
      throw new BackupError(`بيانات الطالب رقم ${i + 1} غير صالحة`)
    }
    if (studentIds.has(s.id)) throw new BackupError('معرّف طالب مكرر في الملف')
    studentIds.add(s.id)
    return {
      id: s.id,
      name: s.name,
      normalizedName: isStr(s.normalizedName) ? s.normalizedName : s.name,
      active: s.active === 0 || s.active === false ? 0 : 1,
      notes: isStr(s.notes) ? s.notes : '',
      deactivationNote: isStr(s.deactivationNote) ? s.deactivationNote : '',
      deactivatedAt: isStr(s.deactivatedAt) ? s.deactivatedAt : null,
      createdAt: isStr(s.createdAt) ? s.createdAt : nowIso(),
      updatedAt: isStr(s.updatedAt) ? s.updatedAt : nowIso(),
    }
  })

  const dayIds = new Set<string>()
  const dates = new Set<string>()
  const days: AttendanceDay[] = raw.days.map((d, i) => {
    if (!isObj(d) || !isStr(d.id) || !isStr(d.date) || !isValidDateString(d.date)) {
      throw new BackupError(`بيانات اليوم رقم ${i + 1} غير صالحة`)
    }
    if (d.status !== 'draft' && d.status !== 'confirmed') throw new BackupError(`حالة اليوم ${d.date} غير صالحة`)
    if (dayIds.has(d.id) || dates.has(d.date)) throw new BackupError('يوجد يوم مكرر في الملف')
    dayIds.add(d.id)
    dates.add(d.date)
    return {
      id: d.id,
      date: d.date,
      status: d.status,
      createdAt: isStr(d.createdAt) ? d.createdAt : nowIso(),
      confirmedAt: isStr(d.confirmedAt) ? d.confirmedAt : null,
      updatedAt: isStr(d.updatedAt) ? d.updatedAt : nowIso(),
    }
  })

  const pairs = new Set<string>()
  const recordIds = new Set<string>()
  const records: AttendanceRecord[] = raw.records.map((r, i) => {
    if (!isObj(r) || !isStr(r.id) || !isStr(r.dayId) || !isStr(r.studentId)) {
      throw new BackupError(`سجل الحضور رقم ${i + 1} غير صالح`)
    }
    if (!RECORD_STATUSES.includes(r.status as RecordStatus)) throw new BackupError(`حالة السجل رقم ${i + 1} غير صالحة`)
    if (!dayIds.has(r.dayId)) throw new BackupError(`السجل رقم ${i + 1} يشير إلى يوم غير موجود`)
    if (!studentIds.has(r.studentId)) throw new BackupError(`السجل رقم ${i + 1} يشير إلى طالب غير موجود`)
    const pair = `${r.dayId}|${r.studentId}`
    if (pairs.has(pair) || recordIds.has(r.id)) throw new BackupError('يوجد سجل حضور مكرر في الملف')
    pairs.add(pair)
    recordIds.add(r.id)
    return {
      id: r.id,
      dayId: r.dayId,
      studentId: r.studentId,
      status: r.status as RecordStatus,
      note: isStr(r.note) ? r.note : '',
      createdAt: isStr(r.createdAt) ? r.createdAt : nowIso(),
      updatedAt: isStr(r.updatedAt) ? r.updatedAt : nowIso(),
    }
  })

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: raw.createdAt, settings, students, days, records }
}

export function parseBackupText(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('الملف ليس JSON صالحاً')
  }
  return validateBackup(raw)
}

/** استبدال كامل للبيانات المحلية داخل معاملة واحدة (تفشل كلها أو تنجح كلها) */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', db.students, db.attendanceDays, db.attendanceRecords, db.settings, async () => {
    await Promise.all([db.students.clear(), db.attendanceDays.clear(), db.attendanceRecords.clear(), db.settings.clear()])
    await db.students.bulkAdd(backup.students)
    await db.attendanceDays.bulkAdd(backup.days)
    await db.attendanceRecords.bulkAdd(backup.records)
    await db.settings.bulkAdd(Object.entries(backup.settings).map(([key, value]) => ({ key, value })))
  })
}

/** CSV ليوم واحد: الاسم، التاريخ، الحالة، ملاحظة الحضور، ملاحظة الطالب */
export async function buildDayCsv(dayId: string): Promise<{ filename: string; content: string }> {
  const day = await db.attendanceDays.get(dayId)
  if (!day) throw new BackupError('اليوم غير موجود')
  const records = await db.attendanceRecords.where('dayId').equals(dayId).toArray()
  const students = new Map((await db.students.toArray()).map((s) => [s.id, s]))
  const rows = records
    .map((r) => ({ r, s: students.get(r.studentId) }))
    .filter((x): x is { r: AttendanceRecord; s: Student } => !!x.s)
    .sort((a, b) => a.s.name.localeCompare(b.s.name, 'ar'))
    .map(({ r, s }) => [s.name, day.date, STATUS_LABEL[r.status], r.note, s.notes])
  return {
    filename: `tafaqqud-${day.date}.csv`,
    content: toCsv([['اسم الطالب', 'التاريخ', 'الحالة', 'ملاحظة الحضور', 'ملاحظة الطالب'], ...rows]),
  }
}

/** CSV لكل الأيام */
export async function buildAllCsv(): Promise<{ filename: string; content: string }> {
  const [days, records, students] = await Promise.all([
    db.attendanceDays.toArray(),
    db.attendanceRecords.toArray(),
    db.students.toArray(),
  ])
  const dayMap = new Map(days.map((d) => [d.id, d]))
  const stuMap = new Map(students.map((s) => [s.id, s]))
  const rows = records
    .map((r) => ({ r, d: dayMap.get(r.dayId), s: stuMap.get(r.studentId) }))
    .filter((x) => x.d && x.s)
    .sort((a, b) => b.d!.date.localeCompare(a.d!.date) || a.s!.name.localeCompare(b.s!.name, 'ar'))
    .map(({ r, d, s }) => [s!.name, d!.date, STATUS_LABEL[r.status], r.note, s!.notes])
  return {
    filename: 'tafaqqud-all.csv',
    content: toCsv([['اسم الطالب', 'التاريخ', 'الحالة', 'ملاحظة الحضور', 'ملاحظة الطالب'], ...rows]),
  }
}
