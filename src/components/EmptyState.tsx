import type { ReactNode } from 'react'

export default function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card p-6 text-center">
      <p className="text-lg font-bold">{title}</p>
      {text && <p className="mt-1 text-gray-600">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
