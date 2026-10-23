import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState'
import SearchInput from '../components/SearchInput'
import { useAttendanceHistory } from '../hooks/useAttendanceHistory'
import { formatDateAr } from '../utils/date'

export default function HistoryPage() {
  const history = useAttendanceHistory()
  const [query, setQuery] = useState('')

  const items = useMemo(() => {
    const q = query.trim()
    if (!q) return history ?? []
    return (history ?? []).filter((h) => h.day.date.includes(q) || formatDateAr(h.day.date).includes(q))
  }, [history, query])

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">سجل الأيام السابقة</h2>
      <SearchInput value={query} onChange={setQuery} placeholder="بحث بالتاريخ (2026-10-23)…" />
      {history === undefined ? (
        <p className="text-gray-500">جارٍ التحميل…</p>
      ) : items.length === 0 ? (
        <EmptyState title="لا توجد أيام مسجلة" text="ابدأ تفقد اليوم ليظهر هنا." />
      ) : (
        <ul className="space-y-2">
          {items.map(({ day, stats }) => (
            <li key={day.id}>
              <Link to={`/history/${day.id}`} className="card block p-3 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{formatDateAr(day.date)}</span>
                  <span className={`text-xs font-semibold ${day.status === 'confirmed' ? 'text-teal-700' : 'text-orange-700'}`}>
                    {day.status === 'confirmed' ? 'معتمد' : 'مسودة'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-700">
                  حاضر {stats.present.toLocaleString('ar-SY')} · غائب {stats.absent.toLocaleString('ar-SY')} · متأخر{' '}
                  {stats.late.toLocaleString('ar-SY')}
                  {stats.unmarked > 0 && ` · غير محدد ${stats.unmarked.toLocaleString('ar-SY')}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
