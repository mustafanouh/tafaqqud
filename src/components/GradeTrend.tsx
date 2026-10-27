import type { StudentGradeRow } from '../services/gradeService'

/** منحنى بسيط لتطور النسب المئوية بترتيب زمني (الأقدم يساراً في الرسم ← الأحدث يميناً بحسب اتجاه الصفحة) */
export default function GradeTrend({ rows }: { rows: StudentGradeRow[] }) {
  const points = rows
    .filter((r): r is StudentGradeRow & { percent: number } => r.percent !== null)
    .sort((a, b) => a.assessment.date.localeCompare(b.assessment.date) || a.assessment.createdAt.localeCompare(b.assessment.createdAt))
  if (points.length < 2) return null

  const W = 300
  const H = 100
  const pad = 8
  const x = (i: number) => pad + (i * (W - pad * 2)) / (points.length - 1)
  const y = (p: number) => H - pad - (Math.min(100, Math.max(0, p)) / 100) * (H - pad * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(' ')

  return (
    <figure className="card p-3">
      <figcaption className="mb-1 text-sm font-semibold text-gray-700">تطور العلامات (٪)</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" role="img" aria-label={`تطور العلامات عبر ${points.length} اختبارات`} direction="ltr">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} stroke="#e5e7eb" strokeWidth="0.7" />
            <text x={W - 1} y={y(g) - 1.5} fontSize="7" fill="#9ca3af" textAnchor="end">
              {g}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#0f766e" strokeWidth="1.8" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.assessment.id} cx={x(i)} cy={y(p.percent)} r="3" fill={p.assessment.type === 'exam' ? '#7e22ce' : '#0f766e'}>
            <title>{`${p.assessment.title}: ${Math.round(p.percent)}٪`}</title>
          </circle>
        ))}
      </svg>
      <p className="mt-1 flex gap-3 text-xs text-gray-600">
        <span><span className="me-1 inline-block h-2 w-2 rounded-full bg-teal-700" />مذاكرة</span>
        <span><span className="me-1 inline-block h-2 w-2 rounded-full bg-purple-700" />امتحان</span>
      </p>
    </figure>
  )
}
