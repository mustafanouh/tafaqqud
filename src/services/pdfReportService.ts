import cairoFontUrl from '../assets/fonts/Cairo.ttf?url'
import { getAllSettings } from '../db/settingsRepository'
import { db } from '../db/database'
import type { AttendanceDay } from '../types/attendance'
import { buildAttendanceReportData } from './reportService'

interface PdfMakeModule {
    default: {
        addVirtualFileSystem(vfs: Record<string, string>): void
        addFonts(fonts: Record<string, Record<string, string>>): void
        createPdf(document: unknown): { download(filename: string): Promise<void> }
    }
}

let fontReady: Promise<void> | undefined

async function toBase64(url: string): Promise<string> {
    const response = await fetch(url)
    if (!response.ok) throw new Error('تعذر تحميل الخط المحلي')
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
}

async function loadPdfMake() {
    const module = (await import('pdfmake/build/pdfmake')) as PdfMakeModule
    if (!fontReady) {
        fontReady = toBase64(cairoFontUrl).then((font) => {
            module.default.addVirtualFileSystem({ 'Cairo.ttf': font })
            module.default.addFonts({
                Cairo: {
                    normal: 'Cairo.ttf',
                    bold: 'Cairo.ttf',
                    italics: 'Cairo.ttf',
                    bolditalics: 'Cairo.ttf',
                },
            })
        })
    }
    await fontReady
    return module.default
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
    const summary = [
        `العدد الكلي: ${report.stats.total}`,
        `الحاضرون: ${report.stats.present}`,
        `الغائبون: ${report.stats.absent}`,
        `المتأخرون: ${report.stats.late}`,
        `غير المحددين: ${report.stats.unmarked}`,
        ...(report.hasDictation ? [`متوسط الإملاء: ${report.evaluationStats.averageDictation?.toFixed(1) ?? '—'}`] : []),
        `متوسط السلوك: ${report.evaluationStats.averageBehavior?.toFixed(1) ?? '—'}`,
        ...(report.hasHomework ? [
            `الوظيفة: كتب ${report.evaluationStats.homeworkDone} | جزئياً ${report.evaluationStats.homeworkPartial} | لم يكتب ${report.evaluationStats.homeworkNone} | غير محددة ${report.evaluationStats.homeworkUnmarked}`,
        ] : []),
    ]
    const header = [
        { text: report.title, style: 'title', alignment: 'center' },
        { text: report.date, alignment: 'center', margin: [0, 0, 0, 8] },
        ...report.headerLines.map((line) => ({ text: line, alignment: 'center' as const })),
        { text: summary.join('   |   '), alignment: 'right', margin: [0, 10, 0, 10] },
    ]
    const tableBody = [
        [
            ...(report.hasHomework ? [{ text: 'الوظيفة', style: 'tableHeader' }] : []),
            ...(report.hasDictation ? [{ text: 'الإملاء', style: 'tableHeader' }] : []),
            { text: 'السلوك', style: 'tableHeader' },
            { text: 'الملاحظة', style: 'tableHeader' },
            { text: 'الحالة', style: 'tableHeader' },
            { text: 'اسم الطالب', style: 'tableHeader' },
            { text: 'الرقم', style: 'tableHeader', alignment: 'center' },
        ],
        ...report.rows.map((row) => [
            ...(report.hasHomework ? [row.homework === null ? '—' : row.homework === 'partial' ? 'كتب بعضها' : row.homework === 'done' ? 'كتب' : 'لم يكتب'] : []),
            ...(report.hasDictation ? [row.dictationScore === null ? '—' : row.dictationScore.toFixed(1)] : []),
            row.behaviorScore === null ? '—' : String(row.behaviorScore ?? 10),
            row.note,
            row.status,
            row.studentName,
            { text: String(row.number), alignment: 'center' },
        ]),
    ]

    const document = {
        pageSize: 'A4',
        pageOrientation: 'portrait',
        pageMargins: [32, 32, 32, 32],
        content: [
            ...header,
            {
                table: {
                    headerRows: 1,
                    widths: [...(report.hasHomework ? [65] : []), ...(report.hasDictation ? [50] : []), 50, '*', 70, '*', 35],
                    body: tableBody,
                },
                layout: 'lightHorizontalLines',
            },
        ],
        footer: (currentPage: number, pageCount: number) => ({
            text: `صفحة ${currentPage} من ${pageCount}`,
            alignment: 'center',
            fontSize: 8,
            color: '#6b7280',
        }),
        defaultStyle: {
            font: 'Cairo',
            fontSize: 10,
            alignment: 'right',
        },
        styles: {
            title: { fontSize: 18, bold: true, margin: [0, 0, 0, 2] },
            tableHeader: { bold: true, fillColor: '#e5e7eb', alignment: 'right' },
        },
    }

    await pdfMake.createPdf(document).download(`tafaqqud-${day.date}.pdf`)
}

export type { AttendanceDay }
