/** تاريخ الجهاز المحلي بصيغة YYYY-MM-DD دون تحويل المنطقة الزمنية */
export function todayLocal(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function formatDateAr(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ar-SY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDateTimeAr(iso: string): string {
  return new Date(iso).toLocaleString('ar-SY', { dateStyle: 'medium', timeStyle: 'short' })
}

export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** يتحقق مما إذا كان التاريخ يصادف عطلة أسبوعية (يوم الجمعة أو السبت) */
export function isWeekend(dateStrOrObj?: string | Date): boolean {
  let dayOfWeek: number
  if (!dateStrOrObj) {
    dayOfWeek = new Date().getDay()
  } else if (typeof dateStrOrObj === 'string') {
    const [y, m, d] = dateStrOrObj.split('-').map(Number)
    dayOfWeek = new Date(y, m - 1, d).getDay()
  } else {
    dayOfWeek = dateStrOrObj.getDay()
  }
  return dayOfWeek === 5 || dayOfWeek === 6
}

/** يعيد اسم يوم العطلة إن كان جمعة أو سبت، أو null إن لم يكن عطلة */
export function getWeekendDayName(dateStrOrObj?: string | Date): string | null {
  let dayOfWeek: number
  if (!dateStrOrObj) {
    dayOfWeek = new Date().getDay()
  } else if (typeof dateStrOrObj === 'string') {
    const [y, m, d] = dateStrOrObj.split('-').map(Number)
    dayOfWeek = new Date(y, m - 1, d).getDay()
  } else {
    dayOfWeek = dateStrOrObj.getDay()
  }
  if (dayOfWeek === 5) return 'الجمعة'
  if (dayOfWeek === 6) return 'السبت'
  return null
}

