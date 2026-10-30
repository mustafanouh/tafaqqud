import { getAllSettings } from '../db/settingsRepository'
import { STATUS_LABEL } from '../types/attendance'
import { ASSESSMENT_TYPE_LABEL } from '../types/assessment'
import { todayLocal } from '../utils/date'
import { formatScore } from '../utils/evaluation'
import { loadPdfMake } from './pdfReportService'
import { loadStudentProfile, type DateRange, type StudentProfile } from './studentProfileService'
import { loadClassRanking, type ClassRankingResult } from './rankingService'

export interface StudentRankingInfo {
  rank: number | null
  totalRanked: number
  sufficientData: boolean
  classSummary?: {
    averageScore: number | null
    averageAttendanceRate: number | null
    averageGradesPercent: number | null
    averageBehavior: number | null
    averageDictation: number | null
    averageHomeworkRate: number | null
  }
}

const BORDER = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1' }

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)
const avg1 = (v: number | null) => (v === null ? '—' : formatScore(Math.round(v * 10) / 10))
const percentColor = (p: number | null) => (p === null ? '#6b7280' : p >= 85 ? '#047857' : p >= 50 ? '#0f766e' : '#b91c1c')

function statCard(label: string, value: string, color = '#111827', fill = '#f3f4f6') {
  return {
    stack: [
      { text: label, fontSize: 8, color: '#4b5563', alignment: 'center' as const },
      { text: value, fontSize: 13, bold: true, color, alignment: 'center' as const },
    ],
    fillColor: fill,
    margin: [2, 3, 2, 3],
  }
}

function statRow(cards: ReturnType<typeof statCard>[]) {
  const rtlCards = [...cards].reverse()
  return { table: { widths: rtlCards.map(() => '*'), body: [rtlCards] }, layout: BORDER, margin: [0, 0, 0, 8] }
}

function sectionTitle(text: string) {
  return { text, fontSize: 11, bold: true, color: '#0f766e', margin: [0, 6, 0, 4] }
}

const th = (text: string, alignment: 'center' | 'right' = 'center') => ({ text, bold: true, color: '#ffffff', fillColor: '#0f766e', alignment, margin: [0, 3, 0, 3] })

const tableLayout = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
  vLineWidth: () => 0.5,
  hLineColor: (i: number) => (i === 1 ? '#0f766e' : '#e5e7eb'),
  vLineColor: () => '#e5e7eb',
  paddingTop: () => 3.5,
  paddingBottom: () => 3.5,
}

/** يبني تعريف مستند pdfmake لتقرير الطالب (منفصل عن التنزيل لسهولة الاختبار) */
export function buildStudentReportDocument(
  profile: StudentProfile,
  settings: Record<string, string>,
  range: DateRange,
  today: string = todayLocal(),
  rankingInfo?: StudentRankingInfo | null,
) {
  const { student, attendanceStats: st, evaluation: ev } = profile
  const header = [
    settings.schoolName?.trim() && `المدرسة: ${settings.schoolName.trim()}`,
    settings.sectionName?.trim() && `الصف / الشعبة: ${settings.sectionName.trim()}`,
    settings.teacherName?.trim() && `المعلم: ${settings.teacherName.trim()}`,
  ].filter(Boolean) as string[]
  const periodText = range.from || range.to ? `الفترة: ${range.from ?? 'البداية'} — ${range.to ?? 'اليوم'}` : 'الفترة: كل السجلات'

  // أعمدة العلامات بالترتيب العربي (من اليمين إلى اليسار: #، الاختبار، النوع، المادة، التاريخ، العلامة، النسبة)
  // ونعكسها عند تمريرها لـ pdfmake لأن الفهرس 0 يظهر على أقصى اليسار
  const gradeRows = profile.grades.map(({ assessment, grade, percent }, i) => {
    const fill = i % 2 ? '#f9fafb' : '#ffffff'
    const scoreText = grade?.absent ? 'غائب' : grade && grade.score !== null ? `${formatScore(grade.score)} / ${formatScore(assessment.maxScore)}` : 'لم تُدخل'
    return [
      { text: pct(percent), alignment: 'center' as const, fillColor: fill, color: percentColor(percent) },
      { text: scoreText, alignment: 'center' as const, fillColor: fill, bold: true, color: percentColor(percent) },
      { text: assessment.date, alignment: 'center' as const, fillColor: fill },
      { text: assessment.subject ? assessment.subject : '—', alignment: 'center' as const, fillColor: fill },
      { text: ASSESSMENT_TYPE_LABEL[assessment.type], alignment: 'center' as const, fillColor: fill },
      { text: assessment.title, bold: true, alignment: 'right' as const, fillColor: fill },
      { text: String(i + 1), alignment: 'center' as const, fillColor: fill, color: '#6b7280' },
    ]
  })

  // أيام الغياب والتأخر فقط (الأهم للمراجعة)، مع الملاحظات (معكوسة لـ pdfmake)
  const issues = profile.attendance.filter((e) => e.record.status === 'absent' || e.record.status === 'late')
  const issueRows = issues.map(({ day, record }, i) => {
    const fill = i % 2 ? '#f9fafb' : '#ffffff'
    return [
      { text: record.note ? record.note : '—', alignment: 'right' as const, fillColor: fill, color: record.note ? '#1f2937' : '#9ca3af' },
      { text: STATUS_LABEL[record.status], alignment: 'center' as const, bold: true, color: record.status === 'absent' ? '#b91c1c' : '#b45309', fillColor: fill },
      { text: day.date, alignment: 'center' as const, fillColor: fill },
    ]
  })

  // سجل الإملاء (معكوس لـ pdfmake)
  const dictations = profile.attendance.filter(
    (e) => e.day.hasDictation && (e.record.dictationScore !== null || e.record.status === 'absent'),
  )
  const dictationRows = dictations.map(({ day, record }, i) => {
    const fill = i % 2 ? '#f9fafb' : '#ffffff'
    const scoreText =
      record.status === 'absent'
        ? 'غائب'
        : record.dictationScore !== null
          ? `${formatScore(record.dictationScore)} / 10`
          : 'لم تُدخل'
    const scoreColor =
      record.status === 'absent'
        ? '#b91c1c'
        : record.dictationScore !== null && record.dictationScore < 5
          ? '#b91c1c'
          : '#0f766e'

    return [
      { text: record.note ? record.note : '—', alignment: 'right' as const, fillColor: fill, color: record.note ? '#1f2937' : '#9ca3af' },
      { text: scoreText, alignment: 'center' as const, bold: true, fillColor: fill, color: scoreColor },
      { text: STATUS_LABEL[record.status], alignment: 'center' as const, fillColor: fill },
      { text: day.date, alignment: 'center' as const, fillColor: fill },
      { text: String(i + 1), alignment: 'center' as const, fillColor: fill, color: '#6b7280' },
    ]
  })

  // بطاقات الترتيب إن وجدت
  let rankCardContent: ReturnType<typeof statCard>[] | null = null
  if (rankingInfo) {
    if (rankingInfo.rank !== null) {
      rankCardContent = [
        statCard('ترتيبه في الشعبة', `${rankingInfo.rank} من ${rankingInfo.totalRanked}`, '#0f766e', '#f0fdfa'),
        statCard(
          'متوسط الشعبة للحضور',
          rankingInfo.classSummary?.averageAttendanceRate !== null && rankingInfo.classSummary?.averageAttendanceRate !== undefined
            ? `${rankingInfo.classSummary.averageAttendanceRate}%`
            : '—',
          '#047857',
          '#ecfdf5',
        ),
        statCard(
          'متوسط الشعبة للعلامات',
          rankingInfo.classSummary?.averageGradesPercent !== null && rankingInfo.classSummary?.averageGradesPercent !== undefined
            ? `${rankingInfo.classSummary.averageGradesPercent}%`
            : '—',
          '#0f766e',
          '#f0fdfa',
        ),
      ]
    } else {
      rankCardContent = [
        statCard('ترتيبه في الشعبة', 'لا توجد بيانات', '#6b7280', '#f9fafb'),
      ]
    }
  }

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
              { text: 'تفقد — تقرير الطالب', fontSize: 16, bold: true, color: '#0f766e', alignment: 'center' },
              { text: student.name, fontSize: 13, bold: true, alignment: 'center', margin: [0, 2, 0, 0] },
              { text: periodText, fontSize: 9, color: '#374151', alignment: 'center', margin: [0, 2, 0, 0] },
              ...(header.length ? [{ text: header.join('   •   '), fontSize: 8.5, color: '#4b5563', alignment: 'center', margin: [0, 2, 0, 0] }] : []),
            ],
            fillColor: '#f0fdfa',
            margin: [6, 8, 6, 8],
          }]],
        },
        layout: { hLineWidth: () => 1.5, vLineWidth: () => 1.5, hLineColor: () => '#0f766e', vLineColor: () => '#0f766e' },
        margin: [0, 0, 0, 8],
      },
      ...(student.notes ? [{ text: `ملاحظة على الطالب: ${student.notes}`, fontSize: 8.5, color: '#4b5563', margin: [0, 0, 0, 6] }] : []),

      ...(rankCardContent ? [statRow(rankCardContent)] : []),

      statRow([
        statCard('نسبة الحضور', pct(profile.attendanceRate), percentColor(profile.attendanceRate), '#f0fdfa'),
        statCard('متوسط العلامات', pct(profile.overallSummary.averagePercent), percentColor(profile.overallSummary.averagePercent), '#f0fdfa'),
        statCard('متوسط السلوك', avg1(ev.averageBehavior), '#047857', '#ecfdf5'),
        statCard('متوسط الإملاء', avg1(ev.averageDictation), '#0f766e', '#f0fdfa'),
      ]),

      sectionTitle('الحضور'),
      statRow([
        statCard('إجمالي الأيام', String(st.total)),
        statCard('حاضر', String(st.present), '#047857', '#ecfdf5'),
        statCard('متأخر', String(st.late), '#b45309', '#fffbeb'),
        statCard('غائب', String(st.absent), '#b91c1c', '#fef2f2'),
      ]),
      ...(issueRows.length
        ? [{
            table: { headerRows: 1, dontBreakRows: true, widths: ['*', 50, 70], body: [[th('الملاحظة', 'right'), th('الحالة'), th('التاريخ')], ...issueRows] },
            layout: tableLayout,
            margin: [0, 0, 0, 6],
          }]
        : [{ text: 'لا توجد أيام غياب أو تأخر في هذه الفترة.', color: '#6b7280', margin: [0, 0, 0, 6] }]),

      sectionTitle('التقييم اليومي'),
      statRow([
        statCard('وظيفة: كتب', String(ev.homeworkDone), '#047857', '#ecfdf5'),
        statCard('وظيفة: جزئياً', String(ev.homeworkPartial), '#b45309', '#fffbeb'),
        statCard('وظيفة: لم يكتب', String(ev.homeworkNone), ev.homeworkNone ? '#b91c1c' : '#6b7280', ev.homeworkNone ? '#fef2f2' : '#f9fafb'),
        statCard('متوسط الإملاء', avg1(ev.averageDictation), '#0f766e', '#f0fdfa'),
      ]),
      ...(dictationRows.length
        ? [
            { text: 'سجل علامات الإملاء', fontSize: 10, bold: true, color: '#0f766e', margin: [0, 4, 0, 3] },
            {
              table: {
                headerRows: 1,
                dontBreakRows: true,
                widths: ['*', 65, 50, 70, 22],
                body: [[th('الملاحظة', 'right'), th('علامة الإملاء'), th('الحالة'), th('التاريخ'), th('#')], ...dictationRows],
              },
              layout: tableLayout,
              margin: [0, 0, 0, 6],
            },
          ]
        : []),

      sectionTitle('العلامات'),
      ...(gradeRows.length
        ? [
            statRow([
              statCard(`مذاكرات · ${profile.quizSummary.count}`, pct(profile.quizSummary.averagePercent), percentColor(profile.quizSummary.averagePercent)),
              statCard(`امتحانات · ${profile.examSummary.count}`, pct(profile.examSummary.averagePercent), percentColor(profile.examSummary.averagePercent)),
              statCard('الأعلى', pct(profile.overallSummary.bestPercent), '#047857', '#ecfdf5'),
              statCard('الأدنى', pct(profile.overallSummary.worstPercent), '#b91c1c', '#fef2f2'),
            ]),
            {
              table: {
                headerRows: 1,
                dontBreakRows: true,
                widths: [36, 62, 58, 50, 44, '*', 22],
                body: [[th('النسبة'), th('العلامة'), th('التاريخ'), th('المادة'), th('النوع'), th('الاختبار', 'right'), th('#')], ...gradeRows],
              },
              layout: tableLayout,
            },
          ]
        : [{ text: 'لا توجد علامات مسجلة في هذه الفترة.', color: '#6b7280' }]),

      // خانتا التوقيع والاعتماد (المعلم على اليمين والإدارة على اليسار)
      {
        table: {
          widths: ['*', '*'],
          body: [
            [
              {
                stack: [
                  { text: 'اعتماد إدارة المدرسة / الختم:', bold: true, fontSize: 8.5, margin: [0, 12, 0, 16] },
                  { text: '................................................', color: '#9ca3af' },
                ],
                alignment: 'left' as const,
                border: [false, false, false, false],
              },
              {
                stack: [
                  { text: 'توقيع المعلم / المربي:', bold: true, fontSize: 8.5, margin: [0, 12, 0, 16] },
                  { text: '................................................', color: '#9ca3af' },
                ],
                alignment: 'right' as const,
                border: [false, false, false, false],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 10, 0, 0],
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
      margin: [32, 10, 32, 0],
    }),
  }
}

export async function downloadStudentReportPdf(
  studentId: string,
  range: DateRange = {},
  includeRank = true,
  preloadedRanking?: ClassRankingResult | null,
  preloadedProfile?: StudentProfile | null,
): Promise<void> {
  const [profile, settings, ranking] = await Promise.all([
    preloadedProfile ? Promise.resolve(preloadedProfile) : loadStudentProfile(studentId, range),
    getAllSettings(),
    includeRank
      ? (preloadedRanking !== undefined
          ? Promise.resolve(preloadedRanking)
          : loadClassRanking(range).catch(() => null))
      : Promise.resolve(null),
  ])
  if (!profile) throw new Error('الطالب غير موجود')

  let rankingInfo: StudentRankingInfo | null = null
  if (ranking) {
    const studentRow = ranking.rows.find((r) => r.student.id === studentId)
    if (studentRow) {
      rankingInfo = {
        rank: studentRow.rank,
        totalRanked: ranking.rankedCount,
        sufficientData: studentRow.sufficientData,
        classSummary: ranking.classSummary,
      }
    }
  }

  const pdfMake = await loadPdfMake()
  const safeName = profile.student.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'طالب'
  await pdfMake
    .createPdf(buildStudentReportDocument(profile, settings, range, todayLocal(), rankingInfo))
    .download(`تقرير-${safeName}-${todayLocal()}.pdf`)
}


