import { NavLink } from 'react-router-dom'
import { ClipboardCheck, History, Home, Save, Settings, Users } from 'lucide-react'

const items = [
  { to: '/', label: 'الرئيسية', icon: Home, end: true },
  { to: '/attendance', label: 'التفقد', icon: ClipboardCheck, end: false },
  { to: '/students', label: 'الطلاب', icon: Users, end: false },
  { to: '/history', label: 'السجل', icon: History, end: false },
  { to: '/backup', label: 'النسخ', icon: Save, end: false },
  { to: '/settings', label: 'الإعدادات', icon: Settings, end: false },
]

export default function AppNavigation() {
  return (
    <>
      {/* شريط جانبي للحاسوب */}
      <nav className="no-print hidden md:flex md:w-56 md:flex-col md:gap-1 md:border-l md:border-gray-200 md:bg-white md:p-3 md:min-h-screen">
        <div className="px-3 py-4 text-2xl font-bold text-teal-700">تفقد</div>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 min-h-[48px] font-semibold ${
                isActive ? 'bg-teal-50 text-teal-800' : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            <Icon size={20} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* شريط سفلي للهاتف */}
      <nav className="no-print fixed bottom-0 inset-x-0 z-20 grid grid-cols-6 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                isActive ? 'text-teal-700' : 'text-gray-500'
              }`
            }
          >
            <Icon size={22} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
