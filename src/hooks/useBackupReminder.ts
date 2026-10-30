import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { getSetting, setSetting, SETTING_KEYS } from '../db/settingsRepository'
import { BACKUP_STALE_DAYS, exportBackupFile } from '../services/backupService'

export type BackupReminderStatus = 'never' | 'stale' | 'ok'

export interface BackupReminderData {
  status: BackupReminderStatus
  daysSinceLast: number | null
  shouldShowBanner: boolean
  lastExportAt: string | null
  snoozedUntil: string | null
  hasData: boolean
  snooze: () => Promise<void>
  exportNow: () => Promise<{ shared: boolean; filename: string }>
}

export function useBackupReminder(): BackupReminderData {
  const queryResult = useLiveQuery(async () => {
    const [studentCount, dayCount, lastExportAt, snoozedUntil] = await Promise.all([
      db.students.count(),
      db.attendanceDays.count(),
      getSetting(SETTING_KEYS.lastExport),
      getSetting(SETTING_KEYS.backupSnoozedUntil),
    ])

    const hasData = studentCount > 0 || dayCount > 0
    if (!hasData) {
      return {
        status: 'ok' as BackupReminderStatus,
        daysSinceLast: null,
        shouldShowBanner: false,
        lastExportAt: lastExportAt || null,
        snoozedUntil: snoozedUntil || null,
        hasData: false,
      }
    }

    const now = Date.now()
    const isSnoozed = !!snoozedUntil && new Date(snoozedUntil).getTime() > now

    if (!lastExportAt) {
      return {
        status: 'never' as BackupReminderStatus,
        daysSinceLast: null,
        shouldShowBanner: !isSnoozed,
        lastExportAt: null,
        snoozedUntil: snoozedUntil || null,
        hasData: true,
      }
    }

    const lastExportTime = new Date(lastExportAt).getTime()
    const diffMs = now - lastExportTime
    const daysSinceLast = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

    if (daysSinceLast >= BACKUP_STALE_DAYS) {
      return {
        status: 'stale' as BackupReminderStatus,
        daysSinceLast,
        shouldShowBanner: !isSnoozed,
        lastExportAt,
        snoozedUntil: snoozedUntil || null,
        hasData: true,
      }
    }

    return {
      status: 'ok' as BackupReminderStatus,
      daysSinceLast,
      shouldShowBanner: false,
      lastExportAt,
      snoozedUntil: snoozedUntil || null,
      hasData: true,
    }
  }, [])

  const snooze = useCallback(async () => {
    // تأجيل 24 ساعة وحفظه في جدول settings
    const snoozeTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await setSetting(SETTING_KEYS.backupSnoozedUntil, snoozeTime)
  }, [])

  const exportNow = useCallback(async () => {
    const res = await exportBackupFile()
    return res
  }, [])

  return {
    status: queryResult?.status ?? 'ok',
    daysSinceLast: queryResult?.daysSinceLast ?? null,
    shouldShowBanner: queryResult?.shouldShowBanner ?? false,
    lastExportAt: queryResult?.lastExportAt ?? null,
    snoozedUntil: queryResult?.snoozedUntil ?? null,
    hasData: queryResult?.hasData ?? false,
    snooze,
    exportNow,
  }
}
