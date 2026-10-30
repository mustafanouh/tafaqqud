import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/index.css'
import App from './app/App'

// التحديث التلقائي للنسخة الجديدة
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
})

// طلب التخزين الدائم لحماية البيانات من الحذف التلقائي للمتصفح
if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
  navigator.storage.persisted?.().then((isPersisted) => {
    if (!isPersisted) {
      navigator.storage.persist().catch(() => {})
    }
  }).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
