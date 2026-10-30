import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import BackupSection from '../components/BackupSection'
import ConfirmDialog from '../components/ConfirmDialog'
import { db } from '../db/database'
import { SETTING_KEYS, getAllSettings, setSetting } from '../db/settingsRepository'
import { useBackupReminder } from '../hooks/useBackupReminder'
import { formatDateTimeAr } from '../utils/date'

const APP_VERSION = '1.1.0'

export default function SettingsPage() {
  const location = useLocation()
  const saved = useLiveQuery(getAllSettings, [])
  const backupReminder = useBackupReminder()
  const [school, setSchool] = useState('')
  const [section, setSection] = useState('')
  const [teacher, setTeacher] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [usage, setUsage] = useState('')
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (!saved) return
    setSchool(saved[SETTING_KEYS.school] ?? '')
    setSection(saved[SETTING_KEYS.section] ?? '')
    setTeacher(saved[SETTING_KEYS.teacher] ?? '')
  }, [saved])

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
  }, [location.hash])

  const refreshUsage = () => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024).toFixed(1)} ك.ب`)
    })
  }

  useEffect(() => {
    refreshUsage()
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      navigator.storage.persisted().then(setIsPersisted).catch(() => {})
    }
  }, [])

  const requestPersistence = async () => {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      const persisted = await navigator.storage.persist().catch(() => false)
      setIsPersisted(persisted)
    }
  }

  const save = async () => {
    setError('')
    setMessage('')
    try {
      await Promise.all([
        setSetting(SETTING_KEYS.school, school.trim()),
        setSetting(SETTING_KEYS.section, section.trim()),
        setSetting(SETTING_KEYS.teacher, teacher.trim()),
      ])
      setMessage('تم حفظ الإعدادات')
    } catch {
      setError('تعذر حفظ الإعدادات')
    }
  }

  const checkForUpdates = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          await reg.update()
        }
      }
    } catch {
      // تجاهل أخطاء التحديث
    }
    window.location.reload()
  }

  const handleClearAllData = async () => {
    setClearing(true)
    setError('')
    setMessage('')
    try {
      await Promise.all([
        db.students.clear(),
        db.attendanceDays.clear(),
        db.attendanceRecords.clear(),
        db.settings.clear(),
        db.assessments.clear(),
        db.grades.clear(),
      ])
      setSchool('')
      setSection('')
      setTeacher('')
      refreshUsage()
      setClearDialogOpen(false)
      setMessage('تم مسح جميع بيانات التطبيق من الهاتف بنجاح.')
    } catch {
      setError('تعذر مسح البيانات')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">الإعدادات</h2>
      <div className="card space-y-3 p-4">
        <input className="input" placeholder="اسم المدرسة (اختياري)" value={school} onChange={(e) => setSchool(e.target.value)} aria-label="اسم المدرسة" />
        <input className="input" placeholder="الصف و الشعبة (اختياري)" value={section} onChange={(e) => setSection(e.target.value)} aria-label="اسم الشعبة" />
        <input className="input" placeholder="اسم المدرس (اختياري)" value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="اسم المدرس" />
        <button className="btn-primary w-full" onClick={save}>
          حفظ
        </button>
        {message && <p className="text-green-700 font-semibold">{message}</p>}
        {error && (
          <p role="alert" className="text-red-700 font-semibold">
            {error}
          </p>
        )}
      </div>

      <div className="card space-y-2 p-4 text-sm text-gray-700">
        <div className="flex items-center justify-between">
          <p className="font-semibold">إصدار التطبيق: {APP_VERSION}</p>
          <button
            type="button"
            onClick={checkForUpdates}
            className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline"
          >
            <RefreshCw size={14} aria-hidden /> تحديث وإعادة تحميل
          </button>
        </div>
        {usage && <p>المساحة المستخدمة تقريباً: {usage}</p>}
        <p>البيانات محلية على هذا الجهاز ولا تُرسل إلى أي خادم.</p>
        <p>تم الإنشاء بواسطة: م.مصطفى نوح</p>
      </div>
 
      {/* مؤشر حماية البيانات والنسخ الاحتياطي */}
      <div className="card space-y-3 p-4">
        <h3 className="font-bold flex items-center gap-2 text-base text-gray-900">
          <ShieldCheck size={20} className="text-teal-700" aria-hidden />
          حالة حماية البيانات والتخزين
        </h3>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-sm">
          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 space-y-1">
            <span className="text-xs font-semibold text-gray-500 block">آخر نسخة احتياطية:</span>
            <div className="font-bold text-gray-900 flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-full ${backupReminder.status === 'ok' ? 'bg-teal-500' : 'bg-orange-500'}`} />
              {backupReminder.lastExportAt ? formatDateTimeAr(backupReminder.lastExportAt) : 'لم يتم التصدير بعد'}
            </div>
            <p className="text-xs text-gray-600">
              {backupReminder.status === 'ok'
                ? 'النسخة الاحتياطية حديثة وآمنة.'
                : backupReminder.status === 'stale'
                  ? `مرّ ${backupReminder.daysSinceLast?.toLocaleString('ar-SY')} يوماً دون تصدير جديد.`
                  : 'يُوصى بتصدير نسخة احتياطية لحماية بيانات الطلاب.'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 space-y-1">
            <span className="text-xs font-semibold text-gray-500 block">حالة التخزين على المتصفح:</span>
            <div className="font-bold text-gray-900 flex items-center gap-1.5">
              {isPersisted ? (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
                  <span className="text-teal-800">تخزين دائم ومحمي</span>
                </>
              ) : isPersisted === false ? (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-amber-800">تخزين افتراضي (غير دائم)</span>
                </>
              ) : (
                <span className="text-gray-500">جاري التحقق…</span>
              )}
            </div>
            <p className="text-xs text-gray-600">
              {isPersisted
                ? 'المتصفح لن يقوم بحذف بيانات تفقد تلقائياً عند امتلاء الذاكرة.'
                : 'قد يقوم المتصفح بحذف البيانات إذا نفدت مساحة الجهاز. صدّر نسخاً دورية.'}
            </p>
            {isPersisted === false && (
              <button
                type="button"
                onClick={requestPersistence}
                className="mt-1 text-xs font-bold text-teal-700 underline block"
              >
                تفعيل الحماية الدائمة
              </button>
            )}
          </div>
        </div>
      </div>

      <BackupSection />

      <div className="card space-y-3 p-4 border-red-200 bg-red-50/40">
        <h3 className="font-bold text-red-800 flex items-center gap-2">
          <Trash2 size={18} aria-hidden /> مسح بيانات التطبيق
        </h3>
        <p className="text-xs text-gray-600">
          مسح جميع الطلاب وسجلات الحضور والغياب والإعدادات المخزنة محلياً على هذا الجهاز والبدء من جديد.
        </p>
        <button
          type="button"
          className="btn-danger w-full text-sm"
          onClick={() => setClearDialogOpen(true)}
        >
          مسح جميع البيانات من الهاتف
        </button>
      </div>

      <ConfirmDialog
        open={clearDialogOpen}
        title="تأكيد مسح جميع البيانات نهائياً؟"
        confirmLabel="نعم، احذف جميع البيانات"
        cancelLabel="إلغاء"
        danger
        busy={clearing}
        onConfirm={handleClearAllData}
        onCancel={() => setClearDialogOpen(false)}
      >
        <div className="space-y-2 text-sm text-gray-700">
          <p className="font-bold text-red-700">
            تحذير: هذا الإجراء لا يمكن التراجع عنه!
          </p>
          <p>
            سيتم مسح كافة أسماء الطلاب وسجلات تفقد الأيام والعلامات والإعدادات من ذاكرة هذا الهاتف بشكل كامل.
          </p>
          <p className="text-gray-500">
            إذا كنت بحاجة للاحتفاظ بالبيانات الحالية، يُرجى تصدير نسخة احتياطية من قسم «النسخ الاحتياطي» أعلاه أولاً.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  )
}
