// Red de seguridad: si algo revienta al renderizar (o falla la carga de un chunk
// tras un despliegue nuevo), en vez de una PANTALLA EN BLANCO mostramos un aviso
// con un botón para ACTUALIZAR (limpia el service worker + cachés y recarga).
// Usa estilos en línea a propósito: funciona aunque el CSS no haya cargado.
import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info)
  }

  async actualizar() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      if (window.caches) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch { /* seguimos igual con la recarga */ }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#0f1729', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', textAlign: 'center' }}>
        <div style={{ maxWidth: 380 }}>
          <div style={{ width: 56, height: 56, margin: '0 auto 16px', display: 'grid', placeItems: 'center', borderRadius: 16, background: '#13233f', color: '#c9a24b', fontWeight: 800, fontSize: 26 }}>M</div>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Necesitas actualizar la app</h1>
          <p style={{ color: '#9aa4b2', margin: '0 0 20px', fontSize: 14, lineHeight: 1.5 }}>
            Hay una versión nueva. Toca el botón para actualizar (se limpia la caché y se recarga). Tus datos no se pierden.
          </p>
          <button
            onClick={() => this.actualizar()}
            style={{ background: '#c9a24b', color: '#13233f', border: 0, borderRadius: 12, padding: '12px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Actualizar ahora
          </button>
          {this.state.error && (
            <pre style={{ marginTop: 20, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, color: '#f6a5a5', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12, maxHeight: 220, overflow: 'auto' }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    )
  }
}
