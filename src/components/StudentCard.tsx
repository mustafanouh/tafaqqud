import { useState } from 'react'
import { StickyNote } from 'lucide-react'
import type { AttendanceRecord, RecordStatus } from '../types/attendance'
import type { Student } from '../types/student'
import AttendanceActions from './AttendanceActions'
import StatusBadge from './StatusBadge'

interface Props {
  student: Student
  record: AttendanceRecord
  onStatus: (s: RecordStatus) => Promise<void> | void
  onNote: (note: string) => Promise<void> | void
}

/** بطاقة طالب في شاشة التفقد: الاسم، الحالة، أزرار الحالة، وخانة ملاحظة الحضور */
export default function StudentCard({ student, record, onStatus, onNote }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(record.note)
  const unmarked = record.status === 'unmarked'

  const saveNote = async () => {
    setEditing(false)
    if (draft.trim() !== record.note) await onNote(draft)
  }

  return (
    <li className={`card p-3 ${unmarked ? 'border-r-4 border-r-gray-400' : ''}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-bold break-words">{student.name}</p>
          {student.notes && <p className="text-sm text-gray-500 break-words">{student.notes}</p>}
        </div>
        <StatusBadge status={record.status} />
      </div>

      <AttendanceActions status={record.status} onChange={onStatus} />

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            className="textarea"
            rows={2}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="ملاحظة عن حضور الطالب اليوم (اختياري)"
            aria-label={`ملاحظة ${student.name}`}
          />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={saveNote}>
              حفظ الملاحظة
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={() => {
                setDraft(record.note)
                setEditing(false)
              }}
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="mt-2 flex w-full items-start gap-2 rounded-xl bg-gray-50 px-3 py-2 text-start text-sm text-gray-700 min-h-[44px]"
          onClick={() => {
            setDraft(record.note)
            setEditing(true)
          }}
        >
          <StickyNote size={18} className="mt-0.5 shrink-0 text-gray-500" aria-hidden />
          <span className="break-words">{record.note || 'إضافة ملاحظة'}</span>
        </button>
      )}
    </li>
  )
}
