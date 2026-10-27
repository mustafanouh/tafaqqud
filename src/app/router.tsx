import { createBrowserRouter, Navigate } from 'react-router-dom'
import Layout from '../components/Layout'
import DashboardPage from '../pages/DashboardPage'
import StudentsPage from '../pages/StudentsPage'
import DailyAttendancePage from '../pages/DailyAttendancePage'
import HistoryPage from '../pages/HistoryPage'
import AttendanceDetailsPage from '../pages/AttendanceDetailsPage'
import GradesPage from '../pages/GradesPage'
import AssessmentPage from '../pages/AssessmentPage'
import StudentProfilePage from '../pages/StudentProfilePage'
import SettingsPage from '../pages/SettingsPage'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/students', element: <StudentsPage /> },
      { path: '/attendance', element: <DailyAttendancePage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/history/:dayId', element: <AttendanceDetailsPage /> },
      { path: '/students/:studentId', element: <StudentProfilePage /> },
      { path: '/grades', element: <GradesPage /> },
      { path: '/grades/:assessmentId', element: <AssessmentPage /> },
      // المسار القديم: النسخ الاحتياطي أصبح ضمن الإعدادات
      { path: '/backup', element: <Navigate to="/settings#backup" replace /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <DashboardPage /> },
    ],
  },
])
