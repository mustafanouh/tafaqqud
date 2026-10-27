import { db } from '../db/database'
import { getAllSettings } from '../db/settingsRepository'
import { ASSESSMENT_TYPE_LABEL, type Assessment, type Grade } from '../types/assessment'
import type { Student } from '../types/student'
import { todayLocal } from '../utils/date'
import { formatScore } from '../utils/evaluation'
import { toPercent } from './gradeService'
import { loadPdfMake } from './pdfReportService'

const BORDER = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1' }
const percentColor = (p: number | null) => (p === null ? '#6b7280' : p >= 85 ? '#047857' : p >= 50 ? '#0f766e' : '#b91c1c')

export interface AssessmentReportRow {
  student: Student
  grade: Grade | undefined
}

export function buildAssessmentReportDocument(assessment: Assessment, rows: AssessmentReportRow[], settings: Record<string, string>, today: string = todayLocal()) {
  const max = assessment.maxScore
  const entered = rows.flatMap((r) => (r.grade && r.grade.score !== null && !r.grade.absent ? [r.grade.score] : []))
  const absent = rows.filter((r) => r.grade?.absent).length
  const avg = entered.length ? entered.reduce((a, b) => a + b, 0) / entered.length : null
  const passed = entered.filter((s) => toPercent(s, max) >= 50).length
  const info = [
    settings.schoolName?.trim() && `المدرسة: ${settings.schoolName.trim()}`,
    settings.sectionName?.trim() && `الصف / الشعبة: ${settings.sectionName.trim()}`,
    settings.teacherName?.trim() && `المعلم: ${settings.teacherName.trim()}`,
  ].filter(Boolean) as string[]

  const card = (label: string, value: string, color = '#111827', fill = '#f3f4f6') => ({
    stack: [
      { text: label, fontSize: 8, color: '#4b5563', alignment: 'center' as const },
      { text: value, fontSize: 13, bold: true, color, alignment: 'center' as const },
    ],
    fillColor: fill,
    margin: [2, 3, 2, 3],
  })
  const th = (text: string, alignment: 'center' | 'right' = 'center') => ({ text, bold: true, color: '#ffffff', fillColor: '#0f766e', alignment, margin: [0, 3, 0, 3] })

  const body = rows.map(({ student, grade }, i) => {
    const fill = i % 2 ? '#f9fafb' : '#ffffff'
    const has = grade && grade.score !== null && !grade.absent
    const percent = has ? toPercent(grade!.score as number, max) : null
    return [
      { text: String(i + 1), alignment: 'center' as const, fillColor: fill, color: '#6b7280' },
      { text: student.name, bold: true, alignment: 'right' as const, fillColor: fill },
      { text: grade?.absent ? 'غائب' : has ? `${formatScore(grade!.score as number)} / ${formatScore(max)}` : '—', alignment: 'center' as const, fillColor: fill, bold: true, color: grade?.absent ? '#b91c1c' : percentColor(percent) },
      { text: percent === null ? '—' : `${Math.round(percent)}%`, alignment: 'center' as const, fillColor: fill, color: percentColor(percent) },
      { text: grade?.note ? grade.note : '—', alignment: 'right' as const, fillColor: fill, color: grade?.note ? '#1f2937' : '#9ca3af' },
    ]
  })

  return {
    pageSize: 'A4',
    pageMargins: [32, 24, 32, 30],
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 9, color: '#1f2937' },
    content: [
      {
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { text: `تفقد — كشف علامات ${ASSESSMENT_TYPE_LABEL[assessment.type]}`, fontSize: 16, bold: true, color: '#0f766e', alignment: 'center' },
              { text: assessment.title, fontSize: 13, bold: true, alignment: 'center', margin: [0, 2, 0, 0] },
              { text: [`التاريخ: ${assessment.date}`, assessment.subject && `المادة: ${assessment.subject}`, `العلامة العظمى: ${formatScore(max)}`].filter(Boolean).join('   •   '), fontSize: 9, color: '#374151', alignment: 'center', margin: [0, 2, 0, 0] },
              ...(info.length ? [{ text: info.join('   •   '), fontSize: 8.5, color: '#4b5563', alignment: 'center', margin: [0, 2, 0, 0] }] : []),
            ],
            fillColor: '#f0fdfa',
            margin: [6, 8, 6, 8],
          }]],
        },
        layout: { hLineWidth: () => 1.5, vLineWidth: () => 1.5, hLineColor: () => '#0f766e', vLineColor: () => '#0f766e' },
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          widths: ['*', '*', '*', '*', '*'],
          body: [[
            card('المتوسط', avg === null ? '—' : formatScore(Math.round(avg * 100) / 100), '#0f766e', '#f0fdfa'),
            card('الأعلى', entered.length ? formatScore(Math.max(...entered)) : '—', '#047857', '#ecfdf5'),
            card('الأدنى', entered.length ? formatScore(Math.min(...entered)) : '—', '#b91c1c', '#fef2f2'),
            card('الناجحون من نصف العلامة', `${passed} / ${entered.length}`),
            card('غائبون', String(absent), '#b45309', '#fffbeb'),
          ]],
        },
        layout: BORDER,
        margin: [0, 0, 0, 10],
      },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: [24, '*', 62, 40, '*'], body: [[th('#'), th('اسم الطالب', 'right'), th('العلامة'), th('النسبة'), th('ملاحظة', 'right')], ...body] },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
          vLineWidth: () => 0.5,
          hLineColor: (i: number) => (i === 1 ? '#0f766e' : '#e5e7eb'),
          vLineColor: () => '#e5e7eb',
          paddingTop: () => 3.5,
          paddingBottom: () => 3.5,
        },
      },
      {
        columns: [
          { width: '*', stack: [{ text: 'توقيع المعلم / المربي:', bold: true, margin: [0, 16, 0, 20] }, { text: '................................................', color: '#9ca3af' }], alignment: 'right' },
          { width: '*', stack: [{ text: 'اعتماد إدارة المدرسة / الختم:', bold: true, margin: [0, 16, 0, 20] }, { text: '................................................', color: '#9ca3af' }], alignment: 'left' },
        ],
        margin: [0, 12, 0, 0],
        unbreakable: true,
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `تطبيق تفقد — تاريخ الإصدار: ${today}`, alignment: 'right', fontSize: 7.5, color: '#9ca3af' },
        { text: `صفحة ${currentPage} من ${pageCount}`, alignment: 'left', fontSize: 7.5, color: '#9ca3af' },
      ],
      margin: [32, 10, 32, 0],
    }),
  }
}

export async function downloadAssessmentReportPdf(assessmentId: string): Promise<void> {
  const assessment = await db.assessments.get(assessmentId)
  if (!assessment) throw new Error('الاختبار غير موجود')
  const [grades, students, settings] = await Promise.all([
    db.grades.where('assessmentId').equals(assessmentId).toArray(),
    db.students.toArray(),
    getAllSettings(),
  ])
  const byStudent = new Map(grades.map((g) => [g.studentId, g]))
  const rows = students
    .filter((s) => s.active === 1 || byStudent.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    .map((student) => ({ student, grade: byStudent.get(student.id) }))
  const pdfMake = await loadPdfMake()
  const safe = assessment.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'اختبار'
  await pdfMake.createPdf(buildAssessmentReportDocument(assessment, rows, settings)).download(`علامات-${safe}-${assessment.date}.pdf`)
}
