import { Minus, Plus } from 'lucide-react'

interface Props {
    label: string
    value: number
    min: number
    max: number
    step: number
    onChange: (value: number) => void
    onValueClick?: () => void
    displayValue?: string
}

export default function NumberStepper({ label, value, min, max, step, onChange, onValueClick, displayValue }: Props) {
    const decrease = () => onChange(Math.max(min, Math.round((value - step) / step) * step))
    const increase = () => onChange(Math.min(max, Math.round((value + step) / step) * step))
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{label}</span>
            <div className="flex items-center gap-1" dir="ltr">
                <button type="button" className="btn-secondary h-11 min-h-[44px] w-11 px-0" onClick={decrease} disabled={value <= min} aria-label={`إنقاص ${label}`}>
                    <Minus size={17} aria-hidden />
                </button>
                <button type="button" className="min-h-[44px] min-w-[48px] rounded-lg border border-gray-300 px-2 text-center font-bold" onClick={onValueClick} aria-label={`قيمة ${label}`}>
                    {displayValue ?? value}
                </button>
                <button type="button" className="btn-secondary h-11 min-h-[44px] w-11 px-0" onClick={increase} disabled={value >= max} aria-label={`زيادة ${label}`}>
                    <Plus size={17} aria-hidden />
                </button>
            </div>
        </div>
    )
}
