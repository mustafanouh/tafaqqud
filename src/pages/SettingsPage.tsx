import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
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

  useEffect(() => {
    if (!saved) return
    setSchool(saved[SETTING_KEYS.school] ?? '')
    setSection(saved[SETTING_KEYS.section] ?? '')
    setTeacher(saved[SETTING_KEYS.teacher] ?? '')
  }, [saved])

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024).toFixed(1)} ك.ب`)
    })
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

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">الإعدادات</h2>
      <div className="card space-y-3 p-4">
        <input className="input" placeholder="اسم المدرسة (اختياري)" value={school} onChange={(e) => setSchool(e.target.value)} aria-label="اسم المدرسة" />
        <input className="input" placeholder="اسم الشعبة (اختياري)" value={section} onChange={(e) => setSection(e.target.value)} aria-label="اسم الشعبة" />
        <input className="input" placeholder="اسم المدرس (اختياري)" value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="اسم المدرس" />
        <button className="btn-primary w-full" onClick={save}>
          حفظ
        </button>
        {message && <p className="text-green-700">{message}</p>}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="card space-y-1 p-4 text-sm text-gray-700">
        <p>إصدار التطبيق: {APP_VERSION}</p>
        {usage && <p>المساحة المستخدمة تقريباً: {usage}</p>}
        <p>البيانات محلية على هذا الجهاز ولا تُرسل إلى أي خدمة. الوصول إلى الجهاز أو المتصفح يعني الوصول إلى البيانات.</p>
      </div>
      <Link to="/backup" className="btn-secondary w-full">
        الانتقال إلى النسخ الاحتياطي
      </Link>
    </div>
  )
}
