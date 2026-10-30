import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardCheck, GraduationCap, History, Trophy, Users, X } from 'lucide-react'
import AttendanceSummary from '../components/AttendanceSummary'
import EmptyState from '../components/EmptyState'
import { db } from '../db/database'
import { SETTING_KEYS, getSetting } from '../db/settingsRepository'
import { computeStats } from '../services/statisticsService'
import { DEFAULT_RANKING_WEIGHTS, type RankingWeights } from '../services/rankingService'
import { downloadRankingPdf } from '../services/rankingPdfService'
import { getWeekendDayName, isWeekend } from '../utils/date'
import { useToday } from '../hooks/useToday'

export default function DashboardPage() {
  const today = useToday()
  const [showModal, setShowModal] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [weights, setWeights] = useState<RankingWeights>({ ...DEFAULT_RANKING_WEIGHTS })
  const [includeCriteriaRanks, setIncludeCriteriaRanks] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const data = useLiveQuery(async () => {
    const day = await db.attendanceDays.where('date').equals(today).first()
    const records = day ? await db.attendanceRecords.where('dayId').equals(day.id).toArray() : []
    return {
      day,
      stats: computeStats(records),
      studentCount: await db.students.where('active').equals(1).count(),
      section: await getSetting(SETTING_KEYS.section),
    }
  }, [today])

  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && setShowModal(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal, busy])

  if (!data) return <p className="text-gray-500">جارٍ التحميل…</p>
  const { day, stats, studentCount, section } = data
  const isTodayWeekend = isWeekend(today)
  const weekendName = getWeekendDayName(today)

  const totalWeights = weights.grades + weights.attendance + weights.homework + weights.dictation + weights.behavior

  const handleGenerateReport = async () => {
    if (busy) return
    if (totalWeights <= 0) {
      setError('مجموع الأوزان يجب أن يكون أكبر من صفر')
      return
    }
    setBusy(true)
    setError('')
    try {
      await downloadRankingPdf(
        { from: from || undefined, to: to || undefined },
        { weights, includeCriteriaRanks },
      )
      setShowModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر توليد تقرير الترتيب')
    } finally {
      setBusy(false)
    }
  }

  const resetWeights = () => {
    setWeights({ ...DEFAULT_RANKING_WEIGHTS })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">الرئيسية</h2>
        {section && <p className="text-gray-600">{section}</p>}
      </div>

      {studentCount === 0 ? (
        <EmptyState
          title="لم تتم إضافة أي طالب بعد"
          text="ابدأ بإضافة أسماء الطلاب مرة واحدة."
          action={
            <Link to="/students" className="btn-primary">
              إضافة الطلاب
            </Link>
          }
        />
      ) : (
        <>
          <div className="card p-4">
            <p className="mb-2 font-semibold">
              الطلاب المسجلون: {studentCount.toLocaleString('ar-SY')}
            </p>
            {day ? (
              <AttendanceSummary stats={stats} />
            ) : (
              <p className="text-gray-600">لم يبدأ تفقد اليوم بعد.</p>
            )}
          </div>

          {day ? (
            <Link to="/attendance" className="btn-primary w-full">
              <ClipboardCheck size={20} aria-hidden /> متابعة تفقد اليوم
            </Link>
          ) : isTodayWeekend ? (
            <button
              type="button"
              disabled
              className="btn-primary w-full cursor-not-allowed opacity-50 bg-gray-400 hover:bg-gray-400 border-gray-400 text-white shadow-none pointer-events-none"
              title={`اليوم عطلة (${weekendName})`}
            >
              <ClipboardCheck size={20} aria-hidden /> بدء تفقد اليوم
            </button>
          ) : (
            <Link to="/attendance" className="btn-primary w-full">
              <ClipboardCheck size={20} aria-hidden /> بدء تفقد اليوم
            </Link>
          )}

          <button
            type="button"
            className="btn-secondary w-full border-teal-700/40 text-teal-900 hover:bg-teal-50"
            onClick={() => setShowModal(true)}
          >
            <Trophy size={20} className="text-teal-700" aria-hidden /> تقرير ترتيب الشعبة (PDF)
          </button>
        </>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link to="/students" className="btn-secondary">
          <Users size={18} aria-hidden /> إدارة الطلاب
        </Link>
        <Link to="/history" className="btn-secondary">
          <History size={18} aria-hidden /> سجل الأيام السابقة
        </Link>
        <Link to="/grades" className="btn-secondary">
          <GraduationCap size={18} aria-hidden /> العلامات
        </Link>
      </div>

      {showModal && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="card max-h-[92vh] w-full max-w-lg overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                  <Trophy size={18} aria-hidden />
                </span>
                <h3 className="text-lg font-bold">تقرير ترتيب الشعبة (PDF)</h3>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1"
                onClick={() => !busy && setShowModal(false)}
                aria-label="إغلاق"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="mt-4 space-y-4 text-sm text-gray-700">
              {/* اختيار الفترة */}
              <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800">الفترة الزمنية</span>
                  {(from || to) && (
                    <button
                      type="button"
                      className="text-xs font-bold text-teal-700 underline"
                      onClick={() => {
                        setFrom('')
                        setTo('')
                      }}
                    >
                      كل السجلات
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs font-medium text-gray-600">
                    من
                    <input
                      className="input text-sm"
                      type="date"
                      value={from}
                      max={to || undefined}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium text-gray-600">
                    إلى
                    <input
                      className="input text-sm"
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              {/* أوزان المعايير */}
              <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800">أوزان المعايير</span>
                  <button
                    type="button"
                    className="text-xs font-bold text-teal-700 underline"
                    onClick={resetWeights}
                  >
                    القيم الافتراضية
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="space-y-1 text-xs text-gray-600">
                    العلامات (٥٠)
                    <input
                      className="input text-center text-sm"
                      type="number"
                      min="0"
                      max="100"
                      value={weights.grades}
                      onChange={(e) => setWeights({ ...weights, grades: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-600">
                    الحضور (٢٠)
                    <input
                      className="input text-center text-sm"
                      type="number"
                      min="0"
                      max="100"
                      value={weights.attendance}
                      onChange={(e) => setWeights({ ...weights, attendance: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-600">
                    الوظائف (١٠)
                    <input
                      className="input text-center text-sm"
                      type="number"
                      min="0"
                      max="100"
                      value={weights.homework}
                      onChange={(e) => setWeights({ ...weights, homework: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-600">
                    الإملاء (١٠)
                    <input
                      className="input text-center text-sm"
                      type="number"
                      min="0"
                      max="100"
                      value={weights.dictation}
                      onChange={(e) => setWeights({ ...weights, dictation: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label className="space-y-1 text-xs text-gray-600">
                    السلوك (١٠)
                    <input
                      className="input text-center text-sm"
                      type="number"
                      min="0"
                      max="100"
                      value={weights.behavior}
                      onChange={(e) => setWeights({ ...weights, behavior: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-gray-500">
                    مجموع الأوزان الحالية:{' '}
                    <span className={`font-bold ${totalWeights === 100 ? 'text-teal-700' : 'text-amber-700'}`}>
                      {totalWeights.toLocaleString('ar-SY')}٪
                    </span>
                  </span>
                  {totalWeights !== 100 && (
                    <span className="text-[11px] text-gray-500">يُطبَّع تلقائياً إلى ١٠٠٪</span>
                  )}
                </div>
              </div>

              {/* خيارات إضافية */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={includeCriteriaRanks}
                    onChange={(e) => setIncludeCriteriaRanks(e.target.checked)}
                    className="rounded text-teal-700 focus:ring-teal-500"
                  />
                  إظهار ترتيب كل معيار في الجدول
                </label>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1 min-h-[44px]"
                onClick={handleGenerateReport}
                disabled={busy}
              >
                {busy ? 'جارٍ التجهيز…' : 'توليد التقرير'}
              </button>
              <button
                type="button"
                className="btn-secondary flex-1 min-h-[44px]"
                onClick={() => setShowModal(false)}
                disabled={busy}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
