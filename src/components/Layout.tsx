import { Outlet } from 'react-router-dom'
import AppHeader from './AppHeader'
import AppNavigation from './AppNavigation'

export default function Layout() {
  return (
    <div className="min-h-screen md:flex">
      <AppNavigation />
      <div className="flex-1 min-w-0">
        <AppHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-4 pb-28 md:pb-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
