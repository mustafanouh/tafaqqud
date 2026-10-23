import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { RefreshCw, Trash2 } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { db } from '../db/database'
import { SETTING_KEYS, getAllSettings, setSetting } from '../db/settingsRepository'

const APP_VERSION = '1.0.0'

export default function SettingsPage() {
  const saved = useLiveQuery(getAllSettings, [])
  const [school, setSchool] = useState('')
  const [section, setSection] = useState('')
  const [teacher, setTeacher] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [usage, setUsage] = useState('')
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (!saved) return
    setSchool(saved[SETTING_KEYS.school] ?? '')
    setSection(saved[SETTING_KEYS.section] ?? '')
    setTeacher(saved[SETTING_KEYS.teacher] ?? '')
  }, [saved])

  const refreshUsage = () => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024).toFixed(1)} ك.ب`)
    })
  }

  useEffect(() => {
    refreshUsage()
  }, [])

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

      <Link to="/backup" className="btn-secondary w-full">
        الانتقال إلى النسخ الاحتياطي
      </Link>

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
            سيتم مسح كافة أسماء الطلاب وسجلات تفقد الأيام والإعدادات من ذاكرة هذا الهاتف بشكل كامل.
          </p>
          <p className="text-gray-500">
            إذا كنت بحاجة للاحتفاظ بالبيانات الحالية، يُرجى تصدير نسخة احتياطية من شاشة «النسخ الاحتياطي» أولاً.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  )
}
