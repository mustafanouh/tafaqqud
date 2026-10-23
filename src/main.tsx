import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/index.css'
import App from './app/App'

// التحديث يتم بصمت عند إعادة فتح التطبيق؛ IndexedDB لا تتأثر بتحديث ملفات التطبيق
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
