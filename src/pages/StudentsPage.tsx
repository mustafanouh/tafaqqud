import { useMemo, useState } from 'react'
import { Pencil, Plus, RotateCcw, UserMinus, Users } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import SearchInput from '../components/SearchInput'
import { useStudents } from '../hooks/useStudents'
import { studentService, type PreparedBatch } from '../services/studentService'
import type { Student } from '../types/student'
import { normalizeName } from '../utils/normalizeName'

type Mode = 'single' | 'bulk'

export default function StudentsPage() {
  const students = useStudents()
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [mode, setMode] = useState<Mode>('single')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // إضافة فردية
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [dupConfirm, setDupConfirm] = useState<Student | null>(null)

  // إضافة جماعية
  const [bulkText, setBulkText] = useState('')
  const [batch, setBatch] = useState<PreparedBatch | null>(null)

  // تعديل / تعطيل
  const [editing, setEditing] = useState<Student | null>(null)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [deactivating, setDeactivating] = useState<Student | null>(null)
  const [deactivationNote, setDeactivationNote] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ التغييرات')
    } finally {
      setBusy(false)
    }
  }

  const doAddOne = () =>
    run(async () => {
      await studentService.addOne({ name, notes })
      setName('')
      setNotes('')
      setDupConfirm(null)
    })

  const submitSingle = async () => {
    if (!name.trim()) return setError('اكتب اسم الطالب أولاً')
    const dup = await studentService.findDuplicate(name)
    if (dup) {
      setDupConfirm(dup)
      return
    }
    await doAddOne()
  }

  const prepareBulk = () =>
    run(async () => {
      const prepared = await studentService.prepareBatch(bulkText)
      if (prepared.toAdd.length === 0) throw new Error('لا توجد أسماء للإضافة')
      setBatch(prepared)
    })

  const confirmBulk = () =>
    run(async () => {
      if (!batch) return
      await studentService.addMany(batch.toAdd)
      setBatch(null)
      setBulkText('')
    })

  const saveEdit = () =>
    run(async () => {
      if (!editing) return
      await studentService.update(editing.id, { name: editName, notes: editNotes })
      setEditing(null)
    })

  const confirmDeactivate = () =>
    run(async () => {
      if (!deactivating) return
      await studentService.deactivate(deactivating.id, deactivationNote)
      setDeactivating(null)
      setDeactivationNote('')
    })

  const visible = useMemo(() => {
    const q = normalizeName(query)
    return (students ?? []).filter(
      (s) => (showInactive ? true : s.active === 1) && (!q || s.normalizedName.includes(q)),
    )
  }, [students, query, showInactive])

  const activeCount = (students ?? []).filter((s) => s.active === 1).length

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">إدارة الطلاب</h2>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}

      <section className="card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2" role="tablist">
          <button role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('single')}>
            طالب واحد
          </button>
          <button role="tab" aria-selected={mode === 'bulk'} className={mode === 'bulk' ? 'btn-primary' : 'btn-secondary'} onClick={() => setMode('bulk')}>
            عدة أسماء
          </button>
        </div>

        {mode === 'single' ? (
          <div className="space-y-2">
            <input className="input" placeholder="اسم الطالب" value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الطالب" />
            <textarea
              className="textarea"
              rows={2}
              placeholder="ملاحظة على الطالب (اختياري)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-label="ملاحظة على الطالب"
            />
            <button className="btn-primary w-full" disabled={busy} onClick={submitSingle}>
              <Plus size={18} aria-hidden /> إضافة الطالب
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              className="textarea"
              rows={7}
              placeholder={'اكتب كل اسم في سطر مستقل\nأحمد محمد\nسارة علي'}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              aria-label="قائمة الأسماء"
            />
            <button className="btn-primary w-full" disabled={busy || !bulkText.trim()} onClick={prepareBulk}>
              <Users size={18} aria-hidden /> مراجعة الأسماء
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">الطلاب النشطون ({activeCount.toLocaleString('ar-SY')})</h3>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            إظهار المعطّلين
          </label>
        </div>
        <SearchInput value={query} onChange={setQuery} />

        {students === undefined ? (
          <p className="text-gray-500">جارٍ التحميل…</p>
        ) : visible.length === 0 ? (
          <EmptyState title={students.length === 0 ? 'لم تتم إضافة أي طالب بعد' : 'لا توجد نتائج'} text={students.length === 0 ? 'أضف الأسماء من الأعلى لتبدأ.' : undefined} />
        ) : (
          <ul className="space-y-2">
            {visible.map((s) => (
              <li key={s.id} className={`card p-3 ${s.active === 0 ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold break-words">
                      {s.name}
                      {s.active === 0 && <span className="ms-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs">معطّل</span>}
                    </p>
                    {s.notes && <p className="text-sm text-gray-600 break-words">ملاحظة: {s.notes}</p>}
                    {s.active === 0 && s.deactivationNote && (
                      <p className="text-sm text-gray-600 break-words">سبب التعطيل: {s.deactivationNote}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="btn-secondary px-3"
                      aria-label={`تعديل ${s.name}`}
                      onClick={() => {
                        setEditing(s)
                        setEditName(s.name)
                        setEditNotes(s.notes)
                      }}
                    >
                      <Pencil size={18} aria-hidden />
                    </button>
                    {s.active === 1 ? (
                      <button className="btn-secondary px-3 text-red-700" aria-label={`تعطيل ${s.name}`} onClick={() => setDeactivating(s)}>
                        <UserMinus size={18} aria-hidden />
                      </button>
                    ) : (
                      <button className="btn-secondary px-3" aria-label={`إعادة تفعيل ${s.name}`} onClick={() => run(() => studentService.reactivate(s.id))}>
                        <RotateCcw size={18} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!dupConfirm}
        title="اسم مشابه موجود"
        confirmLabel="إضافة على أي حال"
        busy={busy}
        onConfirm={doAddOne}
        onCancel={() => setDupConfirm(null)}
      >
        <p>يوجد طالب نشط بالاسم «{dupConfirm?.name}». هل تريد إضافة طالب جديد بالاسم نفسه؟</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!batch}
        title={`إضافة ${batch?.toAdd.length.toLocaleString('ar-SY') ?? ''} طالب`}
        confirmLabel="تأكيد الإضافة"
        busy={busy}
        onConfirm={confirmBulk}
        onCancel={() => setBatch(null)}
      >
        {batch && batch.duplicatesInInput.length > 0 && (
          <p>سيتم تجاهل {batch.duplicatesInInput.length.toLocaleString('ar-SY')} اسم مكرر داخل القائمة.</p>
        )}
        {batch && batch.similarExisting.length > 0 && (
          <p className="text-orange-700">
            تنبيه: {batch.similarExisting.length.toLocaleString('ar-SY')} اسم يشبه طلاباً موجودين ({batch.similarExisting.slice(0, 3).map((x) => x.name).join('، ')}
            {batch.similarExisting.length > 3 ? '…' : ''}) وسيُضاف مرة أخرى عند التأكيد.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={!!editing} title="تعديل الطالب" confirmLabel="حفظ" busy={busy} onConfirm={saveEdit} onCancel={() => setEditing(null)}>
        <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} aria-label="اسم الطالب" />
        <textarea className="textarea" rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="ملاحظة على الطالب" aria-label="ملاحظة على الطالب" />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deactivating}
        title={`تعطيل ${deactivating?.name ?? ''}`}
        confirmLabel="تعطيل الطالب"
        danger
        busy={busy}
        onConfirm={confirmDeactivate}
        onCancel={() => {
          setDeactivating(null)
          setDeactivationNote('')
        }}
      >
        <p>لن يظهر الطالب في التفقد الجديد، وستبقى كل سجلاته السابقة محفوظة. لا يوجد حذف نهائي.</p>
        <textarea
          className="textarea"
          rows={3}
          value={deactivationNote}
          onChange={(e) => setDeactivationNote(e.target.value)}
          placeholder="سبب التعطيل / ملاحظة (اختياري)"
          aria-label="سبب التعطيل"
        />
      </ConfirmDialog>
    </div>
  )
}
