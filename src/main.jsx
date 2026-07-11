import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
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

// Tras un despliegue, el index en caché del teléfono puede pedir un archivo JS que
// ya fue purgado -> la carga del "chunk" falla y la pantalla queda EN BLANCO. Vite
// emite 'vite:preloadError' en ese caso: recargamos UNA vez para bajar la versión
// nueva (guardado en sessionStorage para no entrar en bucle).
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('mp-reload-chunk')) return
  sessionStorage.setItem('mp-reload-chunk', '1')
  window.location.reload()
})

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
