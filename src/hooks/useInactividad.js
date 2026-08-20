// Cierra la sesión tras N minutos SIN actividad del usuario. Robusto ante
// pestañas en segundo plano: marca la última actividad y comprueba el tiempo
// transcurrido con un intervalo y al volver a la pestaña (no depende de un solo
// setTimeout que el navegador congela al minimizar).
import { useEffect, useRef } from 'react'

export function useInactividad(onIdle, { minutos = 30, activo = true } = {}) {
  const ultima = useRef(Date.now())
  const disparado = useRef(false)
  useEffect(() => {
    if (!activo || typeof window === 'undefined') return
    const ms = minutos * 60 * 1000
    ultima.current = Date.now()
    disparado.current = false
    const marcar = () => { ultima.current = Date.now() }
    const revisar = () => {
      if (!disparado.current && Date.now() - ultima.current >= ms) {
        disparado.current = true
        try { onIdle() } catch { /* noop */ }
      }
    }
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel']
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }))
    const onVis = () => { if (document.visibilityState === 'visible') revisar() }
    document.addEventListener('visibilitychange', onVis)
    const id = setInterval(revisar, 30000) // comprueba cada 30 s
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcar))
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(id)
    }
  }, [onIdle, minutos, activo])
}
