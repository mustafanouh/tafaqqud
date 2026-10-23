import { db, newId } from '../db/database'
import { studentRepository } from '../db/studentRepository'
import type { Student } from '../types/student'
import { nowIso } from '../utils/date'
import { normalizeName, parseNamesBlock } from '../utils/normalizeName'

export interface NewStudentInput {
  name: string
  notes?: string
}

export interface PreparedBatch {
  toAdd: NewStudentInput[]
  /** أسماء مكررة داخل المدخلات نفسها (تُتجاهل) */
  duplicatesInInput: string[]
  /** أسماء تشبه طلاباً موجودين (تحتاج تأكيداً) */
  similarExisting: { name: string; existing: string }[]
}

function build(input: NewStudentInput): Student {
  const now = nowIso()
  const name = input.name.replace(/\s+/g, ' ').trim()
  return {
    id: newId(),
    name,
    normalizedName: normalizeName(name),
    active: 1,
    notes: (input.notes ?? '').trim(),
    deactivationNote: '',
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export const studentService = {
  /** تجهيز قائمة أسماء (سطر لكل اسم) وفحص التكرار دون كتابة شيء */
  async prepareBatch(text: string): Promise<PreparedBatch> {
    const names = parseNamesBlock(text)
    const existing = await studentRepository.all()
    const existingMap = new Map(existing.filter((s) => s.active === 1).map((s) => [s.normalizedName, s.name]))
    const seen = new Set<string>()
    const toAdd: NewStudentInput[] = []
    const duplicatesInInput: string[] = []
    const similarExisting: { name: string; existing: string }[] = []
    for (const name of names) {
      const n = normalizeName(name)
      if (seen.has(n)) {
        duplicatesInInput.push(name)
        continue
      }
      seen.add(n)
      const ex = existingMap.get(n)
      if (ex) similarExisting.push({ name, existing: ex })
      toAdd.push({ name })
    }
    return { toAdd, duplicatesInInput, similarExisting }
  },

  async addMany(inputs: NewStudentInput[]): Promise<number> {
    const list = inputs.map(build).filter((s) => s.name.length > 0)
    if (list.length === 0) return 0
    await studentRepository.bulkAdd(list)
    return list.length
  },

  async addOne(input: NewStudentInput): Promise<void> {
    if (!input.name.trim()) throw new Error('الاسم مطلوب')
    await studentRepository.add(build(input))
  },

  /** هل يوجد طالب نشط بالاسم نفسه (بعد التوحيد)؟ */
  async findDuplicate(name: string, excludeId?: string): Promise<Student | undefined> {
    const list = await studentRepository.findByNormalized(normalizeName(name))
    return list.find((s) => s.active === 1 && s.id !== excludeId)
  },

  async update(id: string, changes: { name?: string; notes?: string }): Promise<void> {
    const patch: Partial<Student> = { updatedAt: nowIso() }
    if (changes.name !== undefined) {
      const name = changes.name.replace(/\s+/g, ' ').trim()
      if (!name) throw new Error('الاسم مطلوب')
      patch.name = name
      patch.normalizedName = normalizeName(name)
    }
    if (changes.notes !== undefined) patch.notes = changes.notes.trim()
    await studentRepository.update(id, patch)
  },

  /** «الحذف» = تعطيل مع ملاحظة اختيارية؛ لا تُحذف السجلات التاريخية أبداً */
  async deactivate(id: string, note: string): Promise<void> {
    const now = nowIso()
    await studentRepository.update(id, {
      active: 0,
      deactivationNote: note.trim(),
      deactivatedAt: now,
      updatedAt: now,
    })
  },

  async reactivate(id: string): Promise<void> {
    await studentRepository.update(id, {
      active: 1,
      deactivationNote: '',
      deactivatedAt: null,
      updatedAt: nowIso(),
    })
  },

  /** مستخدمة في الاختبارات */
  async countAll(): Promise<number> {
    return db.students.count()
  },
}
