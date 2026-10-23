/** توحيد الاسم للبحث وكشف التكرار: إزالة التشكيل والتطويل وتوحيد الألف والياء والتاء المربوطة */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** تقسيم نص متعدد الأسطر إلى أسماء نظيفة (دون أسطر فارغة) */
export function parseNamesBlock(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
}
