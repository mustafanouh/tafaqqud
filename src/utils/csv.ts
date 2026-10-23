const BOM = '﻿'

function escapeCell(value: string): string {
  // حماية من حقن الصيغ في Excel
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}

export function toCsv(rows: string[][]): string {
  return BOM + rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
