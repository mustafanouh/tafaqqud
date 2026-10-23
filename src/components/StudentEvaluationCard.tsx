import { Check, Circle, Eraser } from 'lucide-react'
import { useEffect, useState } from 'react'
import { effectiveBehavior, type AttendanceRecord, type HomeworkStatus } from '../types/attendance'
import type { Student } from '../types/student'
import { parseEvaluationNumber } from '../utils/evaluation'
import NumberStepper from './NumberStepper'

interface Props {
    student: Student
    record: AttendanceRecord
    hasDictation: boolean
    hasHomework: boolean
    onChange: (evaluation: { dictationScore?: number | null; homework?: HomeworkStatus | null; behaviorScore?: number | null }) => Promise<void> | void
}

const homeworkOptions: { value: HomeworkStatus; label: string }[] = [
    { value: 'done', label: 'كتب' },
    { value: 'partial', label: 'كتب بعضها' },
    { value: 'none', label: 'لم يكتب' },
]

export default function StudentEvaluationCard({ student, record, hasDictation, hasHomework, onChange }: Props) {
    const [editingDictation, setEditingDictation] = useState(false)
    const [dictationDraft, setDictationDraft] = useState(record.dictationScore === null ? '' : String(record.dictationScore))
    useEffect(() => setDictationDraft(record.dictationScore === null ? '' : String(record.dictationScore)), [record.dictationScore])

    const saveDictation = async () => {
        const value = dictationDraft.trim() === '' ? null : parseEvaluationNumber(dictationDraft)
        if (dictationDraft.trim() !== '' && value === null) return
        setEditingDictation(false)
        if (value !== record.dictationScore) await onChange({ dictationScore: value })
    }

    const setDictation = (value: number) => onChange({ dictationScore: Math.round(value * 2) / 2 })
    const setBehavior = (value: number) => onChange({ behaviorScore: Math.round(value) })
    const setHomework = (value: HomeworkStatus) => onChange({ homework: record.homework === value ? null : value })

    return (
        <li className="card space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="font-bold break-words">{student.name}</p>
                <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-800">{record.status === 'late' ? 'متأخر' : 'حاضر'}</span>
            </div>

            {hasDictation && (
                <div className="space-y-2">
                    {editingDictation ? (
                        <div className="flex items-center gap-2">
                            <label className="sr-only" htmlFor={`dictation-${record.id}`}>علامة الإملاء</label>
                            <input
                                id={`dictation-${record.id}`}
                                className="input min-h-[44px]"
                                inputMode="decimal"
                                value={dictationDraft}
                                onChange={(event) => setDictationDraft(event.target.value)}
                                onBlur={saveDictation}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') void saveDictation()
                                    if (event.key === 'Escape') setEditingDictation(false)
                                }}
                                autoFocus
                                aria-label="علامة الإملاء"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">الإملاء</span>
                            <div className="flex items-center gap-2">
                                <NumberStepper label="الإملاء" value={record.dictationScore ?? 0} min={0} max={10} step={0.5} onChange={setDictation} onValueClick={() => setEditingDictation(true)} displayValue={record.dictationScore === null ? '—' : undefined} />
                                {record.dictationScore !== null && (
                                    <button type="button" className="btn-secondary min-h-[44px] px-2 text-red-700" onClick={() => onChange({ dictationScore: null })} aria-label="مسح علامة الإملاء">
                                        <Eraser size={17} aria-hidden />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {hasHomework && (
                <div className="space-y-1">
                    <p className="text-sm font-semibold">الوظيفة</p>
                    <div className="grid grid-cols-3 gap-1">
                        {homeworkOptions.map((option) => {
                            const selected = record.homework === option.value
                            return (
                                <button type="button" key={option.value} className={`btn min-h-[44px] px-1 text-sm ${selected ? 'border-teal-700 bg-teal-50 text-teal-800' : 'btn-secondary'}`} onClick={() => setHomework(option.value)} aria-pressed={selected}>
                                    {selected ? <Check size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
                                    {option.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <NumberStepper label="السلوك" value={effectiveBehavior(record)} min={0} max={10} step={1} onChange={setBehavior} />
        </li>
    )
}
