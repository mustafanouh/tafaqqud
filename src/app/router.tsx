import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from '../components/Layout'

// التحميل الكسول للصفحات الكبيرة لتقليل حجم الحزمة الابتدائية وتسريع الإقلاع
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const StudentsPage = lazy(() => import('../pages/StudentsPage'))
const DailyAttendancePage = lazy(() => import('../pages/DailyAttendancePage'))
const HistoryPage = lazy(() => import('../pages/HistoryPage'))
const AttendanceDetailsPage = lazy(() => import('../pages/AttendanceDetailsPage'))
const GradesPage = lazy(() => import('../pages/GradesPage'))
const AssessmentPage = lazy(() => import('../pages/AssessmentPage'))
const StudentProfilePage = lazy(() => import('../pages/StudentProfilePage'))
const SettingsPage = lazy(() => import('../pages/SettingsPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<div className="p-8 text-center text-gray-500">جارٍ التحميل…</div>}>
    {children}
  </Suspense>
)

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <SuspenseWrapper><DashboardPage /></SuspenseWrapper> },
      { path: '/students', element: <SuspenseWrapper><StudentsPage /></SuspenseWrapper> },
      { path: '/attendance', element: <SuspenseWrapper><DailyAttendancePage /></SuspenseWrapper> },
      { path: '/history', element: <SuspenseWrapper><HistoryPage /></SuspenseWrapper> },
      { path: '/history/:dayId', element: <SuspenseWrapper><AttendanceDetailsPage /></SuspenseWrapper> },
      { path: '/students/:studentId', element: <SuspenseWrapper><StudentProfilePage /></SuspenseWrapper> },
      { path: '/grades', element: <SuspenseWrapper><GradesPage /></SuspenseWrapper> },
      { path: '/grades/:assessmentId', element: <SuspenseWrapper><AssessmentPage /></SuspenseWrapper> },
      // المسار القديم: النسخ الاحتياطي أصبح ضمن الإعدادات
      { path: '/backup', element: <Navigate to="/settings#backup" replace /> },
      { path: '/settings', element: <SuspenseWrapper><SettingsPage /></SuspenseWrapper> },
      { path: '*', element: <SuspenseWrapper><NotFoundPage /></SuspenseWrapper> },
    ],
  },
])
