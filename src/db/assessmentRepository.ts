import { db } from './database'
import type { Assessment, Grade } from '../types/assessment'

export const assessmentRepository = {
  allAssessments: () => db.assessments.toArray(),
  getAssessment: (id: string) => db.assessments.get(id),
  bulkGetAssessments: (ids: string[]) => db.assessments.bulkGet(ids),
  addAssessment: (a: Assessment) => db.assessments.add(a),
  updateAssessment: (id: string, changes: Partial<Assessment>) => db.assessments.update(id, changes),
  deleteAssessment: (id: string) => db.assessments.delete(id),

  allGrades: () => db.grades.toArray(),
  gradesForAssessment: (assessmentId: string) => db.grades.where('assessmentId').equals(assessmentId).toArray(),
  gradesForStudent: (studentId: string) => db.grades.where('studentId').equals(studentId).toArray(),
  grade: (assessmentId: string, studentId: string) =>
    db.grades.where('[assessmentId+studentId]').equals([assessmentId, studentId]).first(),
  addGrade: (g: Grade) => db.grades.add(g),
  bulkAddGrades: (list: Grade[]) => db.grades.bulkAdd(list),
  updateGrade: (id: string, changes: Partial<Grade>) => db.grades.update(id, changes),
  deleteGradesForAssessment: (assessmentId: string) => db.grades.where('assessmentId').equals(assessmentId).delete(),
}
