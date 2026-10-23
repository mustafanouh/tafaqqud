import { db } from './database'

export const SETTING_KEYS = {
  school: 'schoolName',
  section: 'sectionName',
  teacher: 'teacherName',
  lastExport: 'lastExportAt',
} as const

export async function getSetting(key: string): Promise<string> {
  return (await db.settings.get(key))?.value ?? ''
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value })
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.settings.toArray()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
