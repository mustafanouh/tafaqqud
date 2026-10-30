import { Link } from 'react-router-dom'
import { FileQuestion, Home } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center px-4 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 shadow-sm mb-4">
        <FileQuestion size={36} aria-hidden />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">الصفحة غير موجودة</h2>
      <p className="text-sm text-gray-600 max-w-sm mb-6 leading-relaxed">
        عذراً، الرابط الذي تحاول الوصول إليه غير موجود أو تم نقله.
      </p>
      <Link
        to="/"
        className="btn-primary min-h-[44px] px-6 text-sm font-semibold inline-flex items-center gap-2 shadow-sm"
      >
        <Home size={18} aria-hidden />
        العودة إلى الرئيسية
      </Link>
    </div>
  )
}
