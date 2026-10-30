import { useState } from 'react'
import { AlertTriangle, CheckCircle, Download, History } from 'lucide-react'
import { useBackupReminder } from '../hooks/useBackupReminder'

export default function BackupReminderBanner() {
  const { status, daysSinceLast, shouldShowBanner, snooze, exportNow } = useBackupReminder()
  const [busy, setBusy] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  if (!shouldShowBanner && !successMsg) {
    return null
  }

  const handleExport = async () => {
    if (busy) return
    setBusy(true)
    try {
      await exportNow()
      setSuccessMsg('تم تصدير النسخة الاحتياطية بنجاح. بياناتك آمنة.')
      setTimeout(() => setSuccessMsg(''), 5000)
    } catch {
      // Do nothing on failure, user can retry
    } finally {
      setBusy(false)
    }
  }

  const handleSnooze = async () => {
    if (busy) return
    setBusy(true)
    try {
      await snooze()
    } finally {
      setBusy(false)
    }
  }

  if (successMsg) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-3">
        <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 shadow-sm animate-fade-in">
          <CheckCircle size={20} className="shrink-0 text-teal-700" aria-hidden />
          <p className="font-medium">{successMsg}</p>
        </div>
      </div>
    )
  }

  const message =
    status === 'never'
      ? 'لم تُصدّر أي نسخة احتياطية بعد، بياناتك محفوظة على هذا الجهاز فقط وقد تُفقد.'
      : `لم تُصدّر نسخة احتياطية منذ ${daysSinceLast?.toLocaleString('ar-SY') ?? ''} يوماً، بياناتك محفوظة على هذا الجهاز فقط وقد تُفقد.`

  return (
    <aside aria-label="تنبيه النسخ الاحتياطي" className="mx-auto w-full max-w-3xl px-4 pt-3">
      <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3.5 text-orange-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={22} className="mt-0.5 shrink-0 text-orange-600" aria-hidden />
          <div className="text-sm font-medium leading-relaxed">
            <span className="font-bold block sm:inline">تنبيه أمان البيانات: </span>
            {message}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          <button
            type="button"
            onClick={handleExport}
            disabled={busy}
            className="btn-primary min-h-[44px] px-3.5 py-2 text-xs font-bold bg-orange-700 hover:bg-orange-800 border-orange-700 text-white shadow-sm flex items-center gap-1.5 focus:ring-orange-500"
          >
            <Download size={16} aria-hidden />
            <span>{busy ? 'جارٍ التصدير…' : 'تصدير الآن'}</span>
          </button>
          <button
            type="button"
            onClick={handleSnooze}
            disabled={busy}
            className="btn-secondary min-h-[44px] px-3 py-2 text-xs font-semibold text-orange-900 border-orange-300 hover:bg-orange-100/70 flex items-center gap-1.5 focus:ring-orange-500"
          >
            <History size={16} aria-hidden />
            <span>لاحقاً (٢٤ س)</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
