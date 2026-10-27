export function parseEvaluationNumber(value: string): number | null {
    const normalized = value
        .trim()
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - '٠'.charCodeAt(0)))
        .replace('٫', '.')
        .replace(',', '.')
    if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null
    const number = Number(normalized)
    return Number.isFinite(number) && number >= 0 && number <= 10 ? number : null
}

/** يحوّل نصاً (يقبل الأرقام العربية والفاصلة) إلى رقم غير سالب، أو null إن كان غير صالح. بلا حد أعلى. */
export function parseScoreInput(value: string): number | null {
    const normalized = value
        .trim()
        .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - '٠'.charCodeAt(0)))
        .replace('٫', '.')
        .replace(',', '.')
    if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null
    const number = Number(normalized)
    return Number.isFinite(number) ? number : null
}

/** تنسيق رقم عشري بدون أصفار زائدة: 8.5 → «8.5»، 9 → «9» */
export function formatScore(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}
