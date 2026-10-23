import { db, newId } from '../db/database'
import { attendanceRepository } from '../db/attendanceRepository'
import type { AttendanceDay, AttendanceRecord, RecordStatus } from '../types/attendance'
import { nowIso, todayLocal } from '../utils/date'

export const attendanceService = {
  /**
   * يعيد يوم التاريخ المطلوب إن وُجد، وإلا ينشئه مع سجل «غير محدد» لكل طالب نشط.
   * العملية داخل معاملة واحدة، والفهرس الفريد على date يمنع تكرار اليوم.
   */
  async startOrGetDay(date: string = todayLocal()): Promise<AttendanceDay> {
    return db.transaction('rw', db.students, db.attendanceDays, db.attendanceRecords, async () => {
      const existing = await attendanceRepository.dayByDate(date)
      if (existing) return existing
      const now = nowIso()
      const day: AttendanceDay = {
        id: newId(),
        date,
        status: 'draft',
        createdAt: now,
        confirmedAt: null,
        updatedAt: now,
      }
      await db.attendanceDays.add(day)
      const students = await db.students.where('active').equals(1).toArray()
      const records: AttendanceRecord[] = students.map((s) => ({
        id: newId(),
        dayId: day.id,
        studentId: s.id,
        status: 'unmarked',
        note: '',
        createdAt: now,
        updatedAt: now,
      }))
      await db.attendanceRecords.bulkAdd(records)
      return day
    })
  },

  /** أيام سابقة غير معتمدة (باستثناء تاريخ معيّن) */
  async unconfirmedDaysBefore(date: string): Promise<AttendanceDay[]> {
    const days = await db.attendanceDays.where('status').equals('draft').toArray()
    return days.filter((d) => d.date < date).sort((a, b) => b.date.localeCompare(a.date))
  },

  async setStatus(dayId: string, studentId: string, status: RecordStatus): Promise<void> {
    await db.transaction('rw', db.attendanceDays, db.attendanceRecords, async () => {
      const rec = await attendanceRepository.record(dayId, studentId)
      const now = nowIso()
      if (rec) {
        await db.attendanceRecords.update(rec.id, { status, updatedAt: now })
      } else {
        // طالب أُضيف بعد بدء اليوم: يُنشأ له سجل عند أول تحديد
        await db.attendanceRecords.add({
          id: newId(),
          dayId,
          studentId,
          status,
          note: '',
          createdAt: now,
          updatedAt: now,
        })
      }
      await db.attendanceDays.update(dayId, { updatedAt: now })
    })
  },

  async setNote(dayId: string, studentId: string, note: string): Promise<void> {
    await db.transaction('rw', db.attendanceDays, db.attendanceRecords, async () => {
      const rec = await attendanceRepository.record(dayId, studentId)
      const now = nowIso()
      if (rec) {
        await db.attendanceRecords.update(rec.id, { note: note.trim(), updatedAt: now })
      } else {
        await db.attendanceRecords.add({
          id: newId(),
          dayId,
          studentId,
          status: 'unmarked',
          note: note.trim(),
          createdAt: now,
          updatedAt: now,
        })
      }
      await db.attendanceDays.update(dayId, { updatedAt: now })
    })
  },

  /** عدد من سيتحولون إلى غائب عند الاعتماد */
  async countUnmarked(dayId: string): Promise<number> {
    const recs = await attendanceRepository.recordsForDay(dayId)
    return recs.filter((r) => r.status === 'unmarked').length
  },

  /** اعتماد: غير المحدد → غائب فقط؛ المحددون مسبقاً كما هم. آمن عند التكرار. */
  async confirmDay(dayId: string): Promise<number> {
    return db.transaction('rw', db.attendanceDays, db.attendanceRecords, async () => {
      const day = await db.attendanceDays.get(dayId)
      if (!day) throw new Error('يوم التفقد غير موجود')
      const now = nowIso()
      const recs = await attendanceRepository.recordsForDay(dayId)
      const unmarked = recs.filter((r) => r.status === 'unmarked')
      for (const r of unmarked) {
        await db.attendanceRecords.update(r.id, { status: 'absent', updatedAt: now })
      }
      await db.attendanceDays.update(dayId, {
        status: 'confirmed',
        confirmedAt: day.confirmedAt ?? now,
        updatedAt: now,
      })
      return unmarked.length
    })
  },
}
