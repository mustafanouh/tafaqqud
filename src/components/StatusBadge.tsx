import { CheckCircle2, Clock, HelpCircle, XCircle } from 'lucide-react'
import { STATUS_LABEL, type RecordStatus } from '../types/attendance'

const style: Record<RecordStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  present: { cls: 'bg-green-100 text-green-800', Icon: CheckCircle2 },
  absent: { cls: 'bg-red-100 text-red-800', Icon: XCircle },
  late: { cls: 'bg-orange-100 text-orange-800', Icon: Clock },
  unmarked: { cls: 'bg-gray-100 text-gray-700', Icon: HelpCircle },
}

export default function StatusBadge({ status }: { status: RecordStatus }) {
  const { cls, Icon } = style[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${cls}`}>
      <Icon size={16} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}
