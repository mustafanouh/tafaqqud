import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Download, FileSpreadsheet, Upload } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { SETTING_KEYS, getSetting } from '../db/settingsRepository'
import { BackupError, buildAllCsv, createBackup, markExported, parseBackupText, restoreBackup } from '../services/backupService'
import type { BackupFile } from '../types/backup'
import { downloadText } from '../utils/csv'
import { formatDateTimeAr, todayLocal } from '../utils/date'

export default function BackupPage() {
  const lastExport = useLiveQuery(() => getSetting(SETTING_KEYS.lastExport), [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupFile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع')

  const exportJson = async () => {
    setError('')
    setInfo('')
    try {
      const backup = await createBackup()
      downloadText(`tafaqqud-backup-${todayLocal()}.json`, JSON.stringify(backup, null, 2), 'application/json')
      await markExported()
      setInfo('تم تصدير النسخة الاحتياطية. احفظ الملف في مكان آمن.')
    } catch (e) {
      fail(e)
    }
  }

  const exportCsv = async () => {
    setError('')
    setInfo('')
    try {
      const { filename, content } = await buildAllCsv()
      downloadText(filename, content, 'text/csv')
    } catch (e) {
      fail(e)
    }
  }

  const onFile = async (file: File | undefined) => {
    setError('')
    setInfo('')
    if (!file) return
    try {
      // التحقق قبل أي تغيير في البيانات الحالية
      setPending(parseBackupText(await file.text()))
    } catch (e) {
      fail(e instanceof BackupError ? e : new Error('تعذر قراءة الملف'))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const doRestore = async () => {
    if (!pending || busy) return
    setBusy(true)
    try {
      await restoreBackup(pending)
      setPending(null)
      setInfo('تم استرجاع النسخة الاحتياطية بنجاح.')
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">النسخ الاحتياطي</h2>

      <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-orange-900">
        <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
        <p>البيانات محفوظة على هذا الجهاز فقط وقد تُفقد عند حذف بيانات المتصفح أو فقدان الجهاز. صدّر نسخة احتياطية دورياً.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
          {error}
        </div>
      )}
      {info && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-green-800">{info}</div>}

      <div className="card space-y-3 p-4">
        <p className="text-sm text-gray-600">آخر تصدير: {lastExport ? formatDateTimeAr(lastExport) : 'لم يتم التصدير بعد'}</p>
        <button className="btn-primary w-full" onClick={exportJson}>
          <Download size={18} aria-hidden /> تصدير نسخة احتياطية كاملة (JSON)
        </button>
        <button className="btn-secondary w-full" onClick={exportCsv}>
          <FileSpreadsheet size={18} aria-hidden /> تصدير تقرير CSV (كل الأيام)
        </button>
        <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()}>
          <Upload size={18} aria-hidden /> استيراد نسخة احتياطية
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      <ConfirmDialog
        open={!!pending}
        title="استبدال جميع البيانات؟"
        confirmLabel="استبدال البيانات"
        danger
        busy={busy}
        onConfirm={doRestore}
        onCancel={() => setPending(null)}
      >
        {pending && (
          <>
            <p>
              الملف يحتوي {pending.students.length.toLocaleString('ar-SY')} طالب، {pending.days.length.toLocaleString('ar-SY')} يوم،{' '}
              {pending.records.length.toLocaleString('ar-SY')} سجل حضور (بتاريخ {formatDateTimeAr(pending.createdAt)}).
            </p>
            <p className="font-semibold text-red-700">
              تحذير: سيتم حذف كل البيانات الحالية على هذا الجهاز واستبدالها بمحتوى الملف. لا يتم الدمج.
            </p>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
