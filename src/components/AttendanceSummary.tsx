import type { DayStats } from '../types/attendance'

export default function AttendanceSummary({ stats }: { stats: DayStats }) {
  const cells = [
    { label: 'حاضر', value: stats.present, cls: 'bg-green-50 text-green-800 border-green-200' },
    { label: 'غائب', value: stats.absent, cls: 'bg-red-50 text-red-800 border-red-200' },
    { label: 'متأخر', value: stats.late, cls: 'bg-orange-50 text-orange-800 border-orange-200' },
    { label: 'غير محدد', value: stats.unmarked, cls: 'bg-gray-50 text-gray-700 border-gray-200' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2" aria-label="ملخص الحضور">
      {cells.map((c) => (
        <div key={c.label} className={`rounded-xl border p-2 text-center ${c.cls}`}>
          <div className="text-2xl font-bold">{c.value.toLocaleString('ar-SY')}</div>
          <div className="text-xs font-semibold">{c.label}</div>
        </div>
      ))}
    </div>
  )
}
