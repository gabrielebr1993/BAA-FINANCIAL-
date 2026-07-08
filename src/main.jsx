import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

// Auto-actualización de la PWA: cuando se despliega una versión nueva, el nuevo
// service worker toma control y recargamos la página UNA vez, para no quedar
// pegados en una versión vieja en caché. Antes había que cerrar todas las
// pestañas manualmente; ahora se actualiza solo.
if ('serviceWorker' in navigator) {
  let recargando = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return
    recargando = true
    window.location.reload()
  })
}
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
