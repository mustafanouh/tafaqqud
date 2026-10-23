import { db } from './database'
import type { Student } from '../types/student'

export const studentRepository = {
  all: () => db.students.toArray(),
  active: () => db.students.where('active').equals(1).toArray(),
  get: (id: string) => db.students.get(id),
  add: (s: Student) => db.students.add(s),
  bulkAdd: (list: Student[]) => db.students.bulkAdd(list),
  update: (id: string, changes: Partial<Student>) => db.students.update(id, changes),
  findByNormalized: (n: string) => db.students.where('normalizedName').equals(n).toArray(),
}
