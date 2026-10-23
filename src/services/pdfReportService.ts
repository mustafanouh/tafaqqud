import cairoFontUrl from '../assets/fonts/Cairo.ttf?url'
import { getAllSettings } from '../db/settingsRepository'
import { db } from '../db/database'
import type { AttendanceDay } from '../types/attendance'
import { buildAttendanceReportData } from './reportService'

interface PdfDocument {
    download(filename?: string): Promise<void>
    open(): void
    getBlob(): Promise<Blob>
}

interface PdfMakeInstance {
    addVirtualFileSystem(vfs: Record<string, string>): void
    addFonts(fonts: Record<string, Record<string, string>>): void
    createPdf(document: unknown): PdfDocument
}

let pdfMakePromise: Promise<PdfMakeInstance> | undefined

async function toBase64(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) throw new Error('تعذر تحميل خط التقرير')
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
}

async function loadPdfMake(): Promise<PdfMakeInstance> {
    if (!pdfMakePromise) {
        pdfMakePromise = (async () => {
            const module = (await import('pdfmake-rtl/build/pdfmake')) as { default?: PdfMakeInstance } | PdfMakeInstance
            const pdfMake = (module && 'default' in module && module.default ? module.default : module) as PdfMakeInstance

            const localFontBase64 = await toBase64(cairoFontUrl)
            pdfMake.addVirtualFileSystem({
                'Cairo.ttf': localFontBase64,
                'Cairo-Regular.ttf': localFontBase64,
                'Cairo-Bold.ttf': localFontBase64,
            })

            pdfMake.addFonts({
                Cairo: {
                    normal: 'Cairo-Regular.ttf',
                    bold: 'Cairo-Bold.ttf',
                    italics: 'Cairo-Regular.ttf',
                    bolditalics: 'Cairo-Bold.ttf',
                },
            })

            return pdfMake
        })()
    }
    return pdfMakePromise
}

/**
 * In pdfmake-rtl, multi-digit numbers inside an Arabic text run get reversed by the bidirectional engine.
 * Pre-reversing numbers embedded in mixed text guarantees they render in their true natural order.
 */
function fixRtlDigits(text: string): string {
    if (!text) return ''
    return text.replace(/\d+(\.\d+)?/g, (match) => match.split('').reverse().join(''))
}

export async function downloadAttendancePdf(dayId: string): Promise<void> {
    const [day, records, students, settings] = await Promise.all([
        db.attendanceDays.get(dayId),
        db.attendanceRecords.where('dayId').equals(dayId).toArray(),
        db.students.toArray(),
        getAllSettings(),
    ])
    if (!day) throw new Error('اليوم غير موجود')

    const report = buildAttendanceReportData(day, records, students, {
        schoolName: settings.schoolName,
        sectionName: settings.sectionName,
        teacherName: settings.teacherName,
    })
    const pdfMake = await loadPdfMake()

    const attendanceRate = report.stats.total > 0
        ? Math.round(((report.stats.present + report.stats.late) / report.stats.total) * 100)
        : 0

    // Header institution info
    const headerDetails: string[] = []
    if (settings.schoolName?.trim()) {
        headerDetails.push(`المدرسة / المؤسسة: ${settings.schoolName.trim()}`)
    }
    if (settings.sectionName?.trim()) {
        headerDetails.push(`الصف / الشعبة: ${settings.sectionName.trim()}`)
    }
    if (settings.teacherName?.trim()) {
        headerDetails.push(`المعلم / المربي: ${settings.teacherName.trim()}`)
    }

    // Status colors and background styling helper
    const getStatusStyle = (status: string) => {
        if (status === 'حاضر') return { text: status, color: '#047857', bold: true, alignment: 'center' as const }
        if (status === 'غائب') return { text: status, color: '#b91c1c', bold: true, alignment: 'center' as const }
        if (status === 'متأخر') return { text: status, color: '#b45309', bold: true, alignment: 'center' as const }
        return { text: status, color: '#4b5563', alignment: 'center' as const }
    }

    const getHomeworkStyle = (hw: string | null) => {
        if (hw === 'done') return { text: 'كتب', color: '#047857', bold: true, alignment: 'center' as const }
        if (hw === 'partial') return { text: 'جزئياً', color: '#b45309', bold: true, alignment: 'center' as const }
        if (hw === 'none') return { text: 'لم يكتب', color: '#b91c1c', bold: true, alignment: 'center' as const }
        return { text: '—', color: '#9ca3af', alignment: 'center' as const }
    }

    // Build table columns in natural Arabic reading order (from Right to Left):
    // 1. الرقم (#)
    // 2. اسم الطالب (Student Name)
    // 3. الحالة (Status)
    // 4. الملاحظة (Note)
    // 5. السلوك (Behavior)
    // [6. الإملاء (إذا وجد)]
    // [7. الوظيفة (إذا وجدت)]
    const tableHeader = [
        { text: '#', style: 'tableHeader', alignment: 'center' as const },
        { text: 'اسم الطالب', style: 'tableHeader', alignment: 'right' as const },
        { text: 'الحالة', style: 'tableHeader', alignment: 'center' as const },
        { text: 'ملاحظة الحضور', style: 'tableHeader', alignment: 'right' as const },
        { text: 'السلوك', style: 'tableHeader', alignment: 'center' as const },
        ...(report.hasDictation ? [{ text: 'الإملاء', style: 'tableHeader', alignment: 'center' as const }] : []),
        ...(report.hasHomework ? [{ text: 'الوظيفة', style: 'tableHeader', alignment: 'center' as const }] : []),
    ]

    const tableWidths = [
        26, // #
        '*', // Name
        55, // Status
        '*', // Notes
        40, // Behavior
        ...(report.hasDictation ? [44] : []),
        ...(report.hasHomework ? [52] : []),
    ]

    const tableRows = report.rows.map((row, index) => {
        const isEven = index % 2 === 1
        const rowBg = isEven ? '#f9fafb' : '#ffffff'

        return [
            { text: String(row.number), alignment: 'center' as const, fillColor: rowBg, color: '#6b7280' },
            { text: fixRtlDigits(row.studentName), bold: true, alignment: 'right' as const, fillColor: rowBg },
            { ...getStatusStyle(row.status), fillColor: rowBg },
            { text: row.note ? fixRtlDigits(row.note) : '—', color: row.note ? '#1f2937' : '#9ca3af', alignment: 'right' as const, fillColor: rowBg },
            {
                text: row.behaviorScore !== null ? String(row.behaviorScore) : '—',
                alignment: 'center' as const,
                fillColor: rowBg,
                color: row.behaviorScore !== null && row.behaviorScore < 6 ? '#b91c1c' : '#374151',
            },
            ...(report.hasDictation ? [{
                text: row.dictationScore !== null ? row.dictationScore.toFixed(1) : '—',
                alignment: 'center' as const,
                fillColor: rowBg,
                color: row.dictationScore !== null && row.dictationScore < 5 ? '#b91c1c' : '#374151',
            }] : []),
            ...(report.hasHomework ? [{
                ...getHomeworkStyle(row.homework),
                fillColor: rowBg,
            }] : []),
        ]
    })

    // Prepare evaluation statistics cards (instead of crowded text)
    const evalCards: unknown[] = []
    if (report.hasDictation) {
        evalCards.push({
            stack: [
                { text: 'متوسط الإملاء', style: 'statLabel' },
                {
                    text: report.evaluationStats.averageDictation !== null
                        ? report.evaluationStats.averageDictation.toFixed(1)
                        : '—',
                    style: 'statValue',
                    color: '#0f766e',
                },
                { text: 'الدرجة من 10', fontSize: 7.5, color: '#6b7280', alignment: 'center' },
            ],
            fillColor: '#f0fdfa',
            margin: [2, 3, 2, 3],
        })
    }

    evalCards.push({
        stack: [
            { text: 'متوسط السلوك', style: 'statLabel' },
            {
                text: report.evaluationStats.averageBehavior !== null
                    ? report.evaluationStats.averageBehavior.toFixed(1)
                    : '—',
                style: 'statValue',
                color: '#047857',
            },
            { text: 'الدرجة من 10', fontSize: 7.5, color: '#6b7280', alignment: 'center' },
        ],
        fillColor: '#ecfdf5',
        margin: [2, 3, 2, 3],
    })

    if (report.hasHomework) {
        evalCards.push({
            stack: [
                { text: 'الوظيفة: كتب', style: 'statLabel' },
                { text: String(report.evaluationStats.homeworkDone), style: 'statValue', color: '#047857' },
                { text: 'طالب', fontSize: 7.5, color: '#6b7280', alignment: 'center' },
            ],
            fillColor: '#ecfdf5',
            margin: [2, 3, 2, 3],
        })
        evalCards.push({
            stack: [
                { text: 'الوظيفة: جزئياً', style: 'statLabel' },
                { text: String(report.evaluationStats.homeworkPartial), style: 'statValue', color: '#b45309' },
                { text: 'طالب', fontSize: 7.5, color: '#6b7280', alignment: 'center' },
            ],
            fillColor: '#fffbeb',
            margin: [2, 3, 2, 3],
        })
        evalCards.push({
            stack: [
                { text: 'لم يكتب الوظيفة', style: 'statLabel' },
                {
                    text: String(report.evaluationStats.homeworkNone),
                    style: 'statValue',
                    color: report.evaluationStats.homeworkNone > 0 ? '#b91c1c' : '#6b7280',
                },
                { text: 'طالب', fontSize: 7.5, color: '#6b7280', alignment: 'center' },
            ],
            fillColor: report.evaluationStats.homeworkNone > 0 ? '#fef2f2' : '#f9fafb',
            margin: [2, 3, 2, 3],
        })
    }

    const document = {
        pageSize: 'A4',
        pageOrientation: 'portrait',
        pageMargins: [32, 24, 32, 30],
        rtl: true,
        defaultStyle: {
            font: 'Cairo',
            fontSize: 9,
            color: '#1f2937',
        },
        styles: {
            title: {
                fontSize: 16,
                bold: true,
                color: '#0f766e',
                margin: [0, 0, 0, 2],
            },
            dateBadge: {
                fontSize: 10,
                color: '#374151',
                bold: true,
                margin: [0, 1, 0, 2],
            },
            metaText: {
                fontSize: 8.5,
                color: '#4b5563',
                margin: [0, 2, 0, 0],
            },
            tableHeader: {
                fontSize: 9,
                bold: true,
                color: '#ffffff',
                fillColor: '#0f766e',
                margin: [0, 3, 0, 3],
            },
            statLabel: {
                fontSize: 8,
                color: '#4b5563',
                alignment: 'center' as const,
            },
            statValue: {
                fontSize: 13,
                bold: true,
                alignment: 'center' as const,
            },
        },
        content: [
            // Unified Official Header Banner (No overlapping columns)
            {
                table: {
                    widths: ['*'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'تفقد — تقرير حضور وتقييم الطلاب', style: 'title', alignment: 'center' },
                                    { text: fixRtlDigits(`تاريخ التقرير: ${report.date}`), style: 'dateBadge', alignment: 'center' },
                                    ...(headerDetails.length > 0 ? [
                                        {
                                            text: fixRtlDigits(headerDetails.join('   •   ')),
                                            style: 'metaText',
                                            alignment: 'center',
                                        },
                                    ] : []),
                                ],
                                fillColor: '#f0fdfa',
                                margin: [6, 8, 6, 8],
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
                margin: [0, 0, 0, 8],
            },

            // Attendance Statistics Cards Table
            {
                table: {
                    widths: ['*', '*', '*', '*', '*'],
                    body: [
                        [
                            {
                                stack: [
                                    { text: 'إجمالي الطلاب', style: 'statLabel' },
                                    { text: String(report.stats.total), style: 'statValue', color: '#111827' },
                                ],
                                fillColor: '#f3f4f6',
                                margin: [2, 3, 2, 3],
                            },
                            {
                                stack: [
                                    { text: 'الحاضرون', style: 'statLabel' },
                                    { text: String(report.stats.present), style: 'statValue', color: '#047857' },
                                ],
                                fillColor: '#ecfdf5',
                                margin: [2, 3, 2, 3],
                            },
                            {
                                stack: [
                                    { text: 'الغائبون', style: 'statLabel' },
                                    { text: String(report.stats.absent), style: 'statValue', color: '#b91c1c' },
                                ],
                                fillColor: '#fef2f2',
                                margin: [2, 3, 2, 3],
                            },
                            {
                                stack: [
                                    { text: 'المتأخرون', style: 'statLabel' },
                                    { text: String(report.stats.late), style: 'statValue', color: '#b45309' },
                                ],
                                fillColor: '#fffbeb',
                                margin: [2, 3, 2, 3],
                            },
                            {
                                stack: [
                                    { text: 'نسبة الحضور', style: 'statLabel' },
                                    { text: `${attendanceRate}%`, style: 'statValue', color: '#0f766e' },
                                ],
                                fillColor: '#f0fdfa',
                                margin: [2, 3, 2, 3],
                            },
                        ],
                    ],
                },
                layout: {
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => '#cbd5e1',
                    vLineColor: () => '#cbd5e1',
                },
                margin: [0, 0, 0, 8],
            },

            // Evaluation Cards Table (replaces the scrambled text box!)
            ...(evalCards.length > 0 ? [
                {
                    table: {
                        widths: evalCards.map(() => '*'),
                        body: [
                            evalCards,
                        ],
                    },
                    layout: {
                        hLineWidth: () => 0.5,
                        vLineWidth: () => 0.5,
                        hLineColor: () => '#cbd5e1',
                        vLineColor: () => '#cbd5e1',
                    },
                    margin: [0, 0, 0, 10],
                },
            ] : []),

            // Main Student Attendance Table
            {
                table: {
                    headerRows: 1,
                    dontBreakRows: true,
                    widths: tableWidths,
                    body: [
                        tableHeader,
                        ...tableRows,
                    ],
                },
                layout: {
                    hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
                    vLineWidth: () => 0.5,
                    hLineColor: (i: number) => (i === 1 ? '#0f766e' : '#e5e7eb'),
                    vLineColor: () => '#e5e7eb',
                    paddingTop: () => 3.5,
                    paddingBottom: () => 3.5,
                    paddingLeft: () => 3,
                    paddingRight: () => 3,
                },
            },

            // Signatures block at bottom
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: 'توقيع المعلم / المربي:', bold: true, fontSize: 9, margin: [0, 16, 0, 20] },
                            { text: '................................................', color: '#9ca3af' },
                        ],
                        alignment: 'right',
                    },
                    {
                        width: '*',
                        stack: [
                            { text: 'اعتماد إدارة المدرسة / الختم:', bold: true, fontSize: 9, margin: [0, 16, 0, 20] },
                            { text: '................................................', color: '#9ca3af' },
                        ],
                        alignment: 'left',
                    },
                ],
                margin: [0, 12, 0, 0],
            },
        ],
        footer: (currentPage: number, pageCount: number) => ({
            columns: [
                { text: fixRtlDigits(`تطبيق تفقد — تاريخ الإصدار: ${report.date}`), alignment: 'right', fontSize: 7.5, color: '#9ca3af' },
                { text: `صفحة ${currentPage} من ${pageCount}`, alignment: 'left', fontSize: 7.5, color: '#9ca3af' },
            ],
            margin: [32, 10, 32, 0],
        }),
    }

    await pdfMake.createPdf(document).download(`تفقد-${day.date}.pdf`)
}

export type { AttendanceDay }


