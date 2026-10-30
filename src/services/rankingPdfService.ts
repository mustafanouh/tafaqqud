import { getAllSettings } from '../db/settingsRepository'
import { todayLocal } from '../utils/date'
import { formatScore } from '../utils/evaluation'
import { loadPdfMake } from './pdfReportService'
import {
  loadClassRanking,
  type ClassRankingResult,
  type DateRange,
  type RankingOptions,
  type StudentRankingRow,
} from './rankingService'

const BORDER = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#cbd5e1',
  vLineColor: () => '#cbd5e1',
}

const tableLayout = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
  vLineWidth: () => 0.5,
  hLineColor: (i: number) => (i === 1 ? '#0f766e' : '#e5e7eb'),
  vLineColor: () => '#e5e7eb',
  paddingTop: () => 3.5,
  paddingBottom: () => 3.5,
  paddingLeft: () => 2.5,
  paddingRight: () => 2.5,
}

const th = (text: string, alignment: 'center' | 'right' = 'center') => ({
  text,
  bold: true,
  color: '#ffffff',
  fillColor: '#0f766e',
  alignment,
  margin: [0, 3, 0, 3],
})

function statCard(label: string, value: string, color = '#111827', fill = '#f3f4f6') {
  return {
    stack: [
      { text: label, fontSize: 8, color: '#4b5563', alignment: 'center' as const },
      { text: value, fontSize: 12, bold: true, color, alignment: 'center' as const },
    ],
    fillColor: fill,
    margin: [2, 3, 2, 3],
  }
}

function statRow(cards: ReturnType<typeof statCard>[]) {
  // نعكس ترتيب البطاقات لأن pdfmake يضع أول عنصر على اليسار،
  // ونريد في النسق العربي أن تبدأ البطاقة الأولى (إجمالي الطلاب) من أقصى اليمين
  const rtlCards = [...cards].reverse()
  return {
    table: {
      widths: rtlCards.map(() => '*'),
      body: [rtlCards],
    },
    layout: BORDER,
    margin: [0, 0, 0, 8],
  }
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)
const num10 = (v: number | null) => (v === null ? '—' : formatScore(Math.round(v * 10) / 10))

interface TableColumnDef {
  key: string
  header: ReturnType<typeof th>
  width: number | string
  cell: (row: StudentRankingRow, styling: ReturnType<typeof getRowStyling>) => {
    text: string
    alignment: 'center' | 'right'
    bold?: boolean
    fillColor?: string
    color?: string
    fontSize?: number
  }
}

function getRowStyling(row: StudentRankingRow, index: number) {
  if (row.rank === null) {
    return {
      bg: '#f9fafb',
      badge: '—',
      badgeColor: '#9ca3af',
      scoreText: '—',
      scoreColor: '#9ca3af',
      statusText: 'لا توجد بيانات',
      statusColor: '#6b7280',
    }
  }

  if (row.rank === 1) {
    return {
      bg: '#fef9c3', // Soft gold
      badge: '١',
      badgeColor: '#854d0e',
      scoreText: row.score !== null ? `${formatScore(row.score)}%` : '—',
      scoreColor: '#854d0e',
      statusText: 'الأول على الشعبة',
      statusColor: '#854d0e',
    }
  }

  if (row.rank === 2) {
    return {
      bg: '#f1f5f9', // Soft silver
      badge: '٢',
      badgeColor: '#334155',
      scoreText: row.score !== null ? `${formatScore(row.score)}%` : '—',
      scoreColor: '#334155',
      statusText: 'الثاني على الشعبة',
      statusColor: '#334155',
    }
  }

  if (row.rank === 3) {
    return {
      bg: '#ffedd5', // Soft bronze
      badge: '٣',
      badgeColor: '#9a3412',
      scoreText: row.score !== null ? `${formatScore(row.score)}%` : '—',
      scoreColor: '#9a3412',
      statusText: 'الثالث على الشعبة',
      statusColor: '#9a3412',
    }
  }

  const isEven = index % 2 === 1
  return {
    bg: isEven ? '#f9fafb' : '#ffffff',
    badge: String(row.rank),
    badgeColor: '#374151',
    scoreText: row.score !== null ? `${formatScore(row.score)}%` : '—',
    scoreColor: '#0f766e',
    statusText: '—',
    statusColor: '#9ca3af',
  }
}

/** بناء مستند تقرير ترتيب الشعبة بصيغة pdfmake (منفصل عن التنزيل لاختباره بسهولة) */
export function buildRankingReportDocument(
  ranking: ClassRankingResult,
  settings: Record<string, string>,
  options: { includeCriteriaRanks?: boolean; today?: string } = {},
) {
  const today = options.today ?? todayLocal()
  const { range, weights, availableColumns, rows } = ranking

  const headerDetails: string[] = []
  if (settings.schoolName?.trim()) {
    headerDetails.push(`المدرسة: ${settings.schoolName.trim()}`)
  }
  if (settings.sectionName?.trim()) {
    headerDetails.push(`الصف / الشعبة: ${settings.sectionName.trim()}`)
  }
  if (settings.teacherName?.trim()) {
    headerDetails.push(`المعلم / المربي: ${settings.teacherName.trim()}`)
  }

  const periodText =
    range.from || range.to
      ? `الفترة: من ${range.from ?? 'البداية'} إلى ${range.to ?? 'اليوم'}`
      : 'الفترة: كل السجلات المعتمدة'

  // الترتيب المنطقي للأعمدة باللغة العربية (من اليمين إلى اليسار):
  // 1. # (الرتبة)
  // 2. اسم الطالب
  // 3. الدرجة الكلية
  // 4. الحضور
  // 5. الوظائف
  // [6. الإملاء (١٠)]
  // [7. السلوك (١٠)]
  // [8. المذاكرات]
  // [9. الامتحانات]
  // 10. الحالة / ملاحظة
  const logicalColumns: TableColumnDef[] = [
    {
      key: 'rank',
      header: th('#', 'center'),
      width: 30,
      cell: (_row, styling) => ({
        text: styling.badge,
        bold: true,
        alignment: 'center',
        fillColor: styling.bg,
        color: styling.badgeColor,
      }),
    },
    {
      key: 'name',
      header: th('اسم الطالب', 'right'),
      width: '*',
      cell: (row, styling) => ({
        text: row.student.name,
        bold: true,
        alignment: 'right',
        fillColor: styling.bg,
      }),
    },
    {
      key: 'score',
      header: th('الدرجة الكلية', 'center'),
      width: 54,
      cell: (_row, styling) => ({
        text: styling.scoreText,
        bold: true,
        alignment: 'center',
        fillColor: styling.bg,
        color: styling.scoreColor,
      }),
    },
    {
      key: 'attendance',
      header: th('الحضور', 'center'),
      width: 46,
      cell: (row, styling) => ({
        text: pct(row.attendanceRate),
        alignment: 'center',
        fillColor: styling.bg,
      }),
    },
    {
      key: 'homework',
      header: th('الوظائف', 'center'),
      width: 48,
      cell: (row, styling) => ({
        text: pct(row.homeworkRate),
        alignment: 'center',
        fillColor: styling.bg,
      }),
    },
  ]

  if (availableColumns.dictation) {
    logicalColumns.push({
      key: 'dictation',
      header: th('الإملاء (١٠)', 'center'),
      width: 44,
      cell: (row, styling) => ({
        text: num10(row.dictationAvg),
        alignment: 'center',
        fillColor: styling.bg,
      }),
    })
  }

  if (availableColumns.behavior) {
    logicalColumns.push({
      key: 'behavior',
      header: th('السلوك (١٠)', 'center'),
      width: 44,
      cell: (row, styling) => ({
        text: num10(row.behaviorAvg),
        alignment: 'center',
        fillColor: styling.bg,
      }),
    })
  }

  if (availableColumns.quizzes) {
    logicalColumns.push({
      key: 'quizzes',
      header: th('المذاكرات', 'center'),
      width: 48,
      cell: (row, styling) => ({
        text: pct(row.quizAvg),
        alignment: 'center',
        fillColor: styling.bg,
      }),
    })
  }

  if (availableColumns.exams) {
    logicalColumns.push({
      key: 'exams',
      header: th('الامتحانات', 'center'),
      width: 48,
      cell: (row, styling) => ({
        text: pct(row.examAvg),
        alignment: 'center',
        fillColor: styling.bg,
      }),
    })
  }

  logicalColumns.push({
    key: 'status',
    header: th('الحالة / ملاحظة', 'center'),
    width: 76,
    cell: (_row, styling) => ({
      text: styling.statusText,
      alignment: 'center',
      bold: styling.statusText !== '—',
      color: styling.statusColor,
      fillColor: styling.bg,
      fontSize: 8,
    }),
  })

  // بما أن محرك pdfmake يقوم بصف أعمدة الجدول من أقصى اليسار (الفهرس 0) إلى أقصى اليمين (الفهرس الأخير)،
  // نقوم بعكس مصفوفة الأعمدة حتى يظهر العمود الأول في القراءة العربية (#) على أقصى اليمين،
  // والعمود الأخير (الحالة / ملاحظة) على أقصى اليسار:
  const renderedColumns = [...logicalColumns].reverse()
  const headers = renderedColumns.map((col) => col.header)
  const widths = renderedColumns.map((col) => col.width)

  const tableRows = rows.map((row, index) => {
    const styling = getRowStyling(row, index)
    return renderedColumns.map((col) => col.cell(row, styling))
  })

  const weightsText = `الأوزان المعتمدة: العلامات (${Math.round(weights.grades)}٪) · الحضور (${Math.round(weights.attendance)}٪) · الوظائف (${Math.round(weights.homework)}٪) · الإملاء (${Math.round(weights.dictation)}٪) · السلوك (${Math.round(weights.behavior)}٪) · يُعاد توزيع الأوزان تلقائياً عند غياب أي معيار لدى الطالب.`
  const notesText = `نسبة الوظائف تُحسب للأيام التي كُتبت فيها الوظيفة كاملة أثناء الحضور فقط · يتم ترتيب كافة الطلاب حسب الدرجة المركبة للمعايير المتوفرة.`

  return {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [28, 22, 28, 26],
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 8.5, color: '#1f2937' },
    content: [
      // ترويسة التقرير الرسمية
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  { text: 'تفقد — تقرير ترتيب الشعبة', fontSize: 15, bold: true, color: '#0f766e', alignment: 'center' },
                  { text: periodText, fontSize: 9, color: '#374151', bold: true, alignment: 'center', margin: [0, 1, 0, 1] },
                  ...(headerDetails.length > 0
                    ? [
                        {
                          text: headerDetails.join('   •   '),
                          fontSize: 8.5,
                          color: '#4b5563',
                          alignment: 'center' as const,
                        },
                      ]
                    : []),
                ],
                fillColor: '#f0fdfa',
                margin: [4, 6, 4, 6],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1.5,
          vLineWidth: () => 1.5,
          hLineColor: () => '#0f766e',
          vLineColor: () => '#0f766e',
        },
        margin: [0, 0, 0, 6],
      },

      // بطاقات ملخص الشعبة (تبدأ من اليمين بإجمالي الطلاب وتنتهي باليسار بمتوسط العلامات)
      statRow([
        statCard('إجمالي الطلاب', String(ranking.totalStudents)),
        statCard('الطلاب المصنفون', String(ranking.rankedCount), '#047857', '#ecfdf5'),
        statCard(
          'متوسط الشعبة العام',
          ranking.classSummary.averageScore !== null ? `${ranking.classSummary.averageScore}%` : '—',
          '#0f766e',
          '#f0fdfa',
        ),
        statCard(
          'نسبة حضور الشعبة',
          ranking.classSummary.averageAttendanceRate !== null ? `${ranking.classSummary.averageAttendanceRate}%` : '—',
          '#047857',
          '#ecfdf5',
        ),
        statCard(
          'متوسط علامات الشعبة',
          ranking.classSummary.averageGradesPercent !== null ? `${ranking.classSummary.averageGradesPercent}%` : '—',
          '#0f766e',
          '#f0fdfa',
        ),
      ]),

      // جدول ترتيب الطلاب الرئيسي (مرتّب من اليمين إلى اليسار)
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths,
          body: [headers, ...tableRows],
        },
        layout: tableLayout,
      },

      // سطرين توضيح الأوزان
      {
        stack: [
          { text: weightsText, fontSize: 7.5, color: '#4b5563', alignment: 'right' },
          { text: notesText, fontSize: 7.5, color: '#6b7280', alignment: 'right', margin: [0, 1, 0, 0] },
        ],
        margin: [0, 8, 0, 4],
        unbreakable: true,
      },

      // خانتا التوقيع والاعتماد (المعلم على اليمين والإدارة على اليسار)
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              {
                stack: [
                  { text: 'اعتماد إدارة المدرسة / الختم:', bold: true, fontSize: 8.5, margin: [0, 8, 0, 14] },
                  { text: '................................................', color: '#9ca3af' },
                ],
                alignment: 'left' as const,
                border: [false, false, false, false],
              },
              {
                stack: [
                  { text: 'توقيع المعلم / المربي:', bold: true, fontSize: 8.5, margin: [0, 8, 0, 14] },
                  { text: '................................................', color: '#9ca3af' },
                ],
                alignment: 'right' as const,
                border: [false, false, false, false],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 6, 0, 0],
        unbreakable: true,
      },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      table: {
        widths: ['*', '*'],
        body: [
          [
            {
              text: `صفحة ${currentPage} من ${pageCount}`,
              alignment: 'left' as const,
              fontSize: 7.5,
              color: '#9ca3af',
              border: [false, false, false, false],
            },
            {
              text: `تطبيق تفقد — تاريخ الإصدار: ${today}`,
              alignment: 'right' as const,
              fontSize: 7.5,
              color: '#9ca3af',
              border: [false, false, false, false],
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [28, 8, 28, 0],
    }),
  }
}

/** توليد وتنزيل ملف PDF لترتيب الشعبة */
export async function downloadRankingPdf(
  range: DateRange = {},
  options: RankingOptions = {},
): Promise<void> {
  const [ranking, settings] = await Promise.all([
    loadClassRanking(range, options),
    getAllSettings(),
  ])

  if (ranking.totalStudents === 0) {
    throw new Error('لا يوجد طلاب نشطون لتوليد التقرير')
  }

  const pdfMake = await loadPdfMake()
  const today = todayLocal()
  const doc = buildRankingReportDocument(ranking, settings, {
    includeCriteriaRanks: options.includeCriteriaRanks,
    today,
  })

  await pdfMake.createPdf(doc).download(`tafaqqud-ranking-${today}.pdf`)
}
