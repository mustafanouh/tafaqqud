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