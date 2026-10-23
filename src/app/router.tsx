import { createBrowserRouter } from 'react-router-dom'
import Layout from '../components/Layout'
import DashboardPage from '../pages/DashboardPage'
import StudentsPage from '../pages/StudentsPage'
import DailyAttendancePage from '../pages/DailyAttendancePage'
import HistoryPage from '../pages/HistoryPage'
import AttendanceDetailsPage from '../pages/AttendanceDetailsPage'
import BackupPage from '../pages/BackupPage'
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
      { path: '/backup', element: <BackupPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '*', element: <DashboardPage /> },
    ],
  },
])
