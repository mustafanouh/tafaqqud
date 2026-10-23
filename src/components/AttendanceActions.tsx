import { memo } from 'react'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import type { RecordStatus } from '../types/attendance'

interface Props {
  status: RecordStatus
  disabled?: boolean
  onChange: (s: RecordStatus) => void
}

const options: { value: RecordStatus; label: string; Icon: typeof CheckCircle2; on: string }[] = [
  { value: 'present', label: 'حاضر', Icon: CheckCircle2, on: 'bg-green-700 border-green-700 text-white' },
  { value: 'late', label: 'متأخر', Icon: Clock, on: 'bg-orange-600 border-orange-600 text-white' },
  { value: 'absent', label: 'غائب', Icon: XCircle, on: 'bg-red-700 border-red-700 text-white' },
]

function AttendanceActionsComponent({ status, disabled, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="تحديد الحالة">
      {options.map(({ value, label, Icon, on }) => {
        const active = status === value
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(value)}
            className={`btn px-2 ${active ? on : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50'}`}
          >
            <Icon size={18} aria-hidden />
            {label}
          </button>
        )
      })}
    </div>
  )
}

const AttendanceActions = memo(AttendanceActionsComponent, (prev, next) => (
  prev.status === next.status &&
  prev.disabled === next.disabled &&
  prev.onChange === next.onChange
))

export default AttendanceActions
