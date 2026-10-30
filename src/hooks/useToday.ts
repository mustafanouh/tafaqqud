import { useEffect, useState } from 'react'
import { todayLocal } from '../utils/date'

/**
 * Hook يعيد تاريخ اليوم المحلي (YYYY-MM-DD)، ويتحدث تلقائياً:
 * 1. بمؤقت عند حلول منتصف الليل
 * 2. عند عودة التبويب أو التطبيق للواجهة (visibilitychange و focus)
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayLocal())

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined

    const updateIfChanged = () => {
      const current = todayLocal()
      setToday((prev) => (prev !== current ? current : prev))
      scheduleNextMidnight()
    }

    const scheduleNextMidnight = () => {
      if (timerId) clearTimeout(timerId)
      const now = new Date()
      // حساب التاريخ عند بداية يوم الغد تماماً (00:00:01)
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime())
      timerId = setTimeout(updateIfChanged, delay)
    }

    scheduleNextMidnight()

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateIfChanged()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', updateIfChanged)

    return () => {
      if (timerId) clearTimeout(timerId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', updateIfChanged)
    }
  }, [])

  return today
}
