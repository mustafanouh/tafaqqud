import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardCheck, History, Save, Users } from 'lucide-react'
import AttendanceSummary from '../components/AttendanceSummary'
import EmptyState from '../components/EmptyState'
import { db } from '../db/database'
import { SETTING_KEYS, getSetting } from '../db/settingsRepository'
import { computeStats } from '../services/statisticsService'
import { todayLocal } from '../utils/date'

export default function DashboardPage() {
  const data = useLiveQuery(async () => {
    const day = await db.attendanceDays.where('date').equals(todayLocal()).first()
    const records = day ? await db.attendanceRecords.where('dayId').equals(day.id).toArray() : []
    return {
      day,
      stats: computeStats(records),
      studentCount: await db.students.where('active').equals(1).count(),
      section: await getSetting(SETTING_KEYS.section),
    }
  }, [])

  if (!data) return <p className="text-gray-500">جارٍ التحميل…</p>
  const { day, stats, studentCount, section } = data

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
          <Link to="/attendance" className="btn-primary w-full">
            <ClipboardCheck size={20} aria-hidden /> {day ? 'متابعة تفقد اليوم' : 'بدء تفقد اليوم'}
          </Link>
        </>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link to="/students" className="btn-secondary">
          <Users size={18} aria-hidden /> إدارة الطلاب
        </Link>
        <Link to="/history" className="btn-secondary">
          <History size={18} aria-hidden /> سجل الأيام السابقة
        </Link>
        <Link to="/backup" className="btn-secondary">
          <Save size={18} aria-hidden /> النسخ الاحتياطي
        </Link>
      </div>
    </div>
  )
}
