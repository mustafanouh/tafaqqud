import { db } from '../db/database'
import { effectiveBehavior, type AttendanceDay, type AttendanceRecord } from '../types/attendance'
import type { Assessment, Grade } from '../types/assessment'
import type { Student } from '../types/student'
import { toPercent } from './gradeService'

export interface DateRange {
  from?: string // YYYY-MM-DD inclusive
  to?: string // YYYY-MM-DD inclusive
}

export interface RankingWeights {
  grades: number // default 50
  attendance: number // default 20
  homework: number // default 10
  dictation: number // default 10
  behavior: number // default 10
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  grades: 50,
  attendance: 20,
  homework: 10,
  dictation: 10,
  behavior: 10,
}

export interface RankingOptions {
  weights?: Partial<RankingWeights>
  minDecidedDays?: number // default 5
  minGradesCount?: number // default 1
  includeCriteriaRanks?: boolean
}

export interface HomeworkCounts {
  done: number
  partial: number
  none: number
  totalEligible: number
}

export interface CriterionRanks {
  attendance: number | null
  homework: number | null
  dictation: number | null
  behavior: number | null
  grades: number | null
}

export interface StudentRankingRow {
  student: Student
  /** عدد الأيام المحسومة (حاضر + متأخر + غائب) في الأيام المعتمدة */
  decidedDaysCount: number
  /** عدد التقييمات التي لها علامة فعلية غير غائب */
  validGradesCount: number
  /** هل حقق الطالب الحد الأدنى من البيانات للدخول في الترتيب؟ */
  sufficientData: boolean

  attendanceRate: number | null // 0-100%
  homeworkRate: number | null // 0-100% (done only)
  homeworkCounts: HomeworkCounts
  dictationAvg: number | null // 0-10
  dictationCount: number
  behaviorAvg: number | null // 0-10
  quizAvg: number | null // 0-100%
  quizCount: number
  examAvg: number | null // 0-100%
  examCount: number
  gradesAvg: number | null // 0-100% (weighted: exam 2x, quiz 1x)

  /** الدرجة المركبة 0-100 مع إعادة توزيع أوزان المعايير غير المتوفرة */
  score: number | null
  /** الرتبة العامة (1, 2, 2, 4...) أو null لمن ليس لديه بيانات كافية */
  rank: number | null
  /** ترتيب الطالب داخل كل معيار على حدة */
  rankBy: CriterionRanks
}

export interface ClassRankingResult {
  range: DateRange
  weights: RankingWeights
  options: {
    minDecidedDays: number
    minGradesCount: number
  }
  rows: StudentRankingRow[]
  totalStudents: number
  rankedCount: number
  insufficientCount: number

  // أعمدة متوفرة عبر الشعبة ككل (إن لم توجد لأي طالب تُستبعد)
  availableColumns: {
    attendance: boolean
    homework: boolean
    dictation: boolean
    behavior: boolean
    quizzes: boolean
    exams: boolean
    grades: boolean
  }

  // ملخص الشعبة العام
  classSummary: {
    averageScore: number | null
    averageAttendanceRate: number | null
    averageGradesPercent: number | null
    averageBehavior: number | null
    averageDictation: number | null
    averageHomeworkRate: number | null
  }
}

export interface RankingInputData {
  students: Student[]
  days: AttendanceDay[]
  records: AttendanceRecord[]
  assessments: Assessment[]
  grades: Grade[]
}

const inRange = (date: string, range: DateRange) =>
  (!range.from || date >= range.from) && (!range.to || date <= range.to)

const arabicCollator = new Intl.Collator('ar')

/** تطبيع الأوزان والتحقق من صحتها */
export function normalizeWeights(input?: Partial<RankingWeights>): RankingWeights {
  const merged: RankingWeights = {
    grades: input?.grades ?? DEFAULT_RANKING_WEIGHTS.grades,
    attendance: input?.attendance ?? DEFAULT_RANKING_WEIGHTS.attendance,
    homework: input?.homework ?? DEFAULT_RANKING_WEIGHTS.homework,
    dictation: input?.dictation ?? DEFAULT_RANKING_WEIGHTS.dictation,
    behavior: input?.behavior ?? DEFAULT_RANKING_WEIGHTS.behavior,
  }

  const values = Object.values(merged)
  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error('أوزان المعايير يجب أن تكون أرقاماً غير سالبة')
  }

  const sum = merged.grades + merged.attendance + merged.homework + merged.dictation + merged.behavior
  if (sum <= 0) {
    throw new Error('مجموع الأوزان يجب أن يكون أكبر من صفر')
  }

  // إذا لم يكن المجموع 100، يُطبَّع تلقائياً إلى 100
  if (Math.abs(sum - 100) > 1e-6) {
    return {
      grades: (merged.grades / sum) * 100,
      attendance: (merged.attendance / sum) * 100,
      homework: (merged.homework / sum) * 100,
      dictation: (merged.dictation / sum) * 100,
      behavior: (merged.behavior / sum) * 100,
    }
  }

  return merged
}

function computeCriterionRanks(
  rows: StudentRankingRow[],
  accessor: (r: StudentRankingRow) => number | null,
): Map<string, number> {
  const entries: { id: string; val: number }[] = []
  for (const r of rows) {
    const val = accessor(r)
    if (val !== null && Number.isFinite(val)) {
      entries.push({ id: r.student.id, val })
    }
  }

  // فرز تنازلي
  entries.sort((a, b) => b.val - a.val)

  const rankMap = new Map<string, number>()
  for (let i = 0; i < entries.length; i++) {
    if (i === 0) {
      rankMap.set(entries[i].id, 1)
    } else {
      const prev = entries[i - 1]
      const curr = entries[i]
      if (Math.abs(prev.val - curr.val) < 1e-4) {
        rankMap.set(curr.id, rankMap.get(prev.id)!)
      } else {
        rankMap.set(curr.id, i + 1)
      }
    }
  }
  return rankMap
}

/** دالة نقية لحساب ترتيب الشعبة */
export function computeRanking(
  data: RankingInputData,
  range: DateRange = {},
  options: RankingOptions = {},
): ClassRankingResult {
  const weights = normalizeWeights(options.weights)
  const minDecidedDays = options.minDecidedDays ?? 5
  const minGradesCount = options.minGradesCount ?? 1

  // 1. تصفية الأيام والاختبارات بالفترة
  const filteredDays = data.days.filter((d) => inRange(d.date, range))
  const dayMap = new Map(filteredDays.map((d) => [d.id, d]))

  const filteredAssessments = data.assessments.filter((a) => inRange(a.date, range))
  const assessmentMap = new Map(filteredAssessments.map((a) => [a.id, a]))

  // تصفية السجلات للطلاب النشطين فقط
  const activeStudents = data.students.filter((s) => s.active === 1)
  const studentMap = new Map(activeStudents.map((s) => [s.id, s]))

  // تجميع سجلات الحضور لكل طالب
  const recordsByStudent = new Map<string, AttendanceRecord[]>()
  for (const s of activeStudents) {
    recordsByStudent.set(s.id, [])
  }
  for (const r of data.records) {
    if (studentMap.has(r.studentId) && dayMap.has(r.dayId)) {
      recordsByStudent.get(r.studentId)!.push(r)
    }
  }

  // تجميع العلامات لكل طالب
  const gradesByStudent = new Map<string, Grade[]>()
  for (const s of activeStudents) {
    gradesByStudent.set(s.id, [])
  }
  for (const g of data.grades) {
    if (studentMap.has(g.studentId) && assessmentMap.has(g.assessmentId)) {
      gradesByStudent.get(g.studentId)!.push(g)
    }
  }

  const rawRows: Omit<StudentRankingRow, 'rank' | 'rankBy'>[] = []

  for (const student of activeStudents) {
    const records = recordsByStudent.get(student.id) || []
    const grades = gradesByStudent.get(student.id) || []

    // 1) الحضور والوظائف والإملاء والسلوك بتمريرة واحدة سريعة على السجلات (O(N) دون تخصيص مصفوفات متكررة)
    let presentCount = 0
    let lateCount = 0
    let absentCount = 0
    let hwDone = 0
    let hwPartial = 0
    let hwNone = 0
    let hwTotal = 0
    let dictationSum = 0
    let dictationCount = 0
    let behaviorSum = 0
    let behaviorCount = 0

    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      const day = dayMap.get(r.dayId)
      if (!day) continue
      // المسودات قد تحوي «غير محدد» لم يُحسم بعد، لذا تُستبعد
      if (day.status !== 'confirmed' && r.status === 'unmarked') continue

      if (r.status === 'present') {
        presentCount++
      } else if (r.status === 'late') {
        lateCount++
      } else if (r.status === 'absent') {
        absentCount++
      }

      // الوظائف والإملاء والسلوك للأيام الحاضرة أو المتأخرة فقط
      if (r.status === 'present' || r.status === 'late') {
        if (day.hasHomework) {
          hwTotal++
          if (r.homework === 'done') hwDone++
          else if (r.homework === 'partial') hwPartial++
          else if (r.homework === 'none') hwNone++
        }

        if (day.hasDictation && r.dictationScore !== null) {
          dictationSum += r.dictationScore
          dictationCount++
        }

        behaviorSum += effectiveBehavior(r)
        behaviorCount++
      }
    }

    const decidedDaysCount = presentCount + lateCount + absentCount
    const attendanceRate = decidedDaysCount > 0 ? ((presentCount + lateCount) / decidedDaysCount) * 100 : null
    const homeworkRate = hwTotal > 0 ? (hwDone / hwTotal) * 100 : null
    const homeworkCounts: HomeworkCounts = {
      done: hwDone,
      partial: hwPartial,
      none: hwNone,
      totalEligible: hwTotal,
    }

    const dictationAvg = dictationCount > 0 ? dictationSum / dictationCount : null
    const behaviorAvg = behaviorCount > 0 ? behaviorSum / behaviorCount : null

    // 3) العلامات
    const validQuizPercents: number[] = []
    const validExamPercents: number[] = []

    for (const g of grades) {
      const assessment = assessmentMap.get(g.assessmentId)
      if (!assessment) continue
      if (g.score !== null && !g.absent && Number.isFinite(g.score)) {
        const pct = toPercent(g.score, assessment.maxScore)
        if (assessment.type === 'quiz') {
          validQuizPercents.push(pct)
        } else if (assessment.type === 'exam') {
          validExamPercents.push(pct)
        }
      }
    }

    const quizCount = validQuizPercents.length
    const examCount = validExamPercents.length
    const validGradesCount = quizCount + examCount

    const quizAvg = quizCount > 0 ? validQuizPercents.reduce((a, b) => a + b, 0) / quizCount : null
    const examAvg = examCount > 0 ? validExamPercents.reduce((a, b) => a + b, 0) / examCount : null

    let gradesAvg: number | null = null
    if (quizAvg !== null && examAvg !== null) {
      // الامتحانات ضعف وزن المذاكرات داخل العلامات
      gradesAvg = (quizAvg * 1 + examAvg * 2) / 3
    } else if (quizAvg !== null) {
      gradesAvg = quizAvg
    } else if (examAvg !== null) {
      gradesAvg = examAvg
    }

    // حساب الدرجة المركبة (0-100) عبر تطبيع المقاييس وإعادة توزيع أوزان المعايير المتوفرة
    let score: number | null = null
    const availableComponents: { val: number; weight: number }[] = []

    if (gradesAvg !== null && weights.grades > 0) {
      availableComponents.push({ val: gradesAvg, weight: weights.grades })
    }
    if (attendanceRate !== null && weights.attendance > 0) {
      availableComponents.push({ val: attendanceRate, weight: weights.attendance })
    }
    if (homeworkRate !== null && weights.homework > 0) {
      availableComponents.push({ val: homeworkRate, weight: weights.homework })
    }
    if (dictationAvg !== null && weights.dictation > 0) {
      availableComponents.push({ val: dictationAvg * 10, weight: weights.dictation })
    }
    if (behaviorAvg !== null && weights.behavior > 0) {
      availableComponents.push({ val: behaviorAvg * 10, weight: weights.behavior })
    }

    const activeWeightSum = availableComponents.reduce((acc, c) => acc + c.weight, 0)
    if (activeWeightSum > 0) {
      // إعادة توزيع أوزان المعايير غير المتوفرة على المعايير المتوفرة
      const rawScore = availableComponents.reduce((acc, c) => acc + c.val * c.weight, 0) / activeWeightSum
      score = Math.round(rawScore * 100) / 100
    }

    const sufficientData = score !== null

    rawRows.push({
      student,
      decidedDaysCount,
      validGradesCount,
      sufficientData,
      attendanceRate,
      homeworkRate,
      homeworkCounts,
      dictationAvg,
      dictationCount,
      behaviorAvg,
      quizAvg,
      quizCount,
      examAvg,
      examCount,
      gradesAvg,
      score,
    })
  }

  // فصل الطلاب الذين لديهم درجات عن من ليس لديهم أي بيانات إطلاقاً
  const rankedRows = rawRows.filter((r) => r.score !== null)
  const noDataRows = rawRows.filter((r) => r.score === null)

  // فرز الطلاب:
  // 1. الدرجة الكلية (الأعلى أولاً)
  // 2. كسر التعادل: الأعلى علامات
  // 3. كسر التعادل: الأعلى حضوراً
  // 4. أبجدياً باسم الطالب
  rankedRows.sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0)
    if (Math.abs(scoreDiff) > 1e-4) return scoreDiff

    const gradeA = a.gradesAvg ?? -1
    const gradeB = b.gradesAvg ?? -1
    const gradeDiff = gradeB - gradeA
    if (Math.abs(gradeDiff) > 1e-4) return gradeDiff

    const attA = a.attendanceRate ?? -1
    const attB = b.attendanceRate ?? -1
    const attDiff = attB - attA
    if (Math.abs(attDiff) > 1e-4) return attDiff

    return arabicCollator.compare(a.student.name, b.student.name)
  })

  // الطلاب الذين ليس لديهم أي بيانات إطلاقاً يُفرزون أبجدياً
  noDataRows.sort((a, b) => arabicCollator.compare(a.student.name, b.student.name))

  // إسناد الرتبة العامة للطلاب (1، 2، 2، 4...)
  const finalRankedRows: StudentRankingRow[] = []
  for (let i = 0; i < rankedRows.length; i++) {
    const current = rankedRows[i]
    let rank = 1
    if (i > 0) {
      const prev = rankedRows[i - 1]
      const prevRow = finalRankedRows[i - 1]
      const isTied =
        Math.abs((current.score ?? 0) - (prev.score ?? 0)) < 1e-4 &&
        Math.abs((current.gradesAvg ?? -1) - (prev.gradesAvg ?? -1)) < 1e-4 &&
        Math.abs((current.attendanceRate ?? -1) - (prev.attendanceRate ?? -1)) < 1e-4

      rank = isTied ? prevRow.rank! : i + 1
    }
    finalRankedRows.push({
      ...current,
      rank,
      rankBy: { attendance: null, homework: null, dictation: null, behavior: null, grades: null },
    })
  }

  const finalNoDataRows: StudentRankingRow[] = noDataRows.map((r) => ({
    ...r,
    rank: null,
    rankBy: { attendance: null, homework: null, dictation: null, behavior: null, grades: null },
  }))

  const allRows = [...finalRankedRows, ...finalNoDataRows]

  // حساب ترتيب المعايير الفردية (rankBy)
  const attRanks = computeCriterionRanks(allRows, (r) => r.attendanceRate)
  const hwRanks = computeCriterionRanks(allRows, (r) => r.homeworkRate)
  const dicRanks = computeCriterionRanks(allRows, (r) => r.dictationAvg)
  const behRanks = computeCriterionRanks(allRows, (r) => r.behaviorAvg)
  const grdRanks = computeCriterionRanks(allRows, (r) => r.gradesAvg)

  for (const row of allRows) {
    row.rankBy = {
      attendance: attRanks.get(row.student.id) ?? null,
      homework: hwRanks.get(row.student.id) ?? null,
      dictation: dicRanks.get(row.student.id) ?? null,
      behavior: behRanks.get(row.student.id) ?? null,
      grades: grdRanks.get(row.student.id) ?? null,
    }
  }

  // التحقق من الأعمدة المتوفرة عبر الشعبة ككل
  const availableColumns = {
    attendance: allRows.some((r) => r.attendanceRate !== null),
    homework: allRows.some((r) => r.homeworkRate !== null),
    dictation: allRows.some((r) => r.dictationAvg !== null),
    behavior: allRows.some((r) => r.behaviorAvg !== null),
    quizzes: allRows.some((r) => r.quizAvg !== null),
    exams: allRows.some((r) => r.examAvg !== null),
    grades: allRows.some((r) => r.gradesAvg !== null),
  }

  // ملخص الشعبة العام
  const validScores = finalRankedRows.map((r) => r.score).filter((s): s is number => s !== null)
  const validAtt = allRows.map((r) => r.attendanceRate).filter((v): v is number => v !== null)
  const validGrd = allRows.map((r) => r.gradesAvg).filter((v): v is number => v !== null)
  const validBeh = allRows.map((r) => r.behaviorAvg).filter((v): v is number => v !== null)
  const validDic = allRows.map((r) => r.dictationAvg).filter((v): v is number => v !== null)
  const validHw = allRows.map((r) => r.homeworkRate).filter((v): v is number => v !== null)

  const avgOrNull = (arr: number[]) => (arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null)

  return {
    range,
    weights,
    options: { minDecidedDays, minGradesCount },
    rows: allRows,
    totalStudents: allRows.length,
    rankedCount: finalRankedRows.length,
    insufficientCount: finalNoDataRows.length,
    availableColumns,
    classSummary: {
      averageScore: avgOrNull(validScores),
      averageAttendanceRate: avgOrNull(validAtt),
      averageGradesPercent: avgOrNull(validGrd),
      averageBehavior: avgOrNull(validBeh),
      averageDictation: avgOrNull(validDic),
      averageHomeworkRate: avgOrNull(validHw),
    },
  }
}

/** دالة جلب واحدة تقرأ كافة البيانات بعدد ثابت من الاستعلامات وتحسب الترتيب */
export async function loadClassRanking(
  range: DateRange = {},
  options: RankingOptions = {},
): Promise<ClassRankingResult> {
  const [students, days, records, assessments, grades] = await Promise.all([
    db.students.where('active').equals(1).toArray(),
    db.attendanceDays.toArray(),
    db.attendanceRecords.toArray(),
    db.assessments.toArray(),
    db.grades.toArray(),
  ])

  return computeRanking(
    { students, days, records, assessments, grades },
    range,
    options,
  )
}
