// Hook: alto y desplazamiento REALES del viewport visible (visualViewport).
// En iOS Safari el teclado NO reduce el viewport de layout (100dvh sigue igual),
// así que una capa "fixed inset-0" queda en parte DETRÁS del teclado y el campo
// de mensaje desaparece. Con visualViewport medimos el área visible de verdad y
// el chat se ajusta a ella: el input queda siempre a la vista y nada "salta".
// Devuelve { height, top } o null (sin soporte / inactivo / pantalla grande).
import { useEffect, useState } from 'react'

export function useVisualViewport(activo = true, maxAncho = 1024) {
  const [vv, setVv] = useState(null)
  useEffect(() => {
    const v = window.visualViewport
    if (!activo || !v) { setVv(null); return }
    const medir = () => {
      // Solo en pantallas chicas (donde el chat es capa fija a pantalla completa).
      if (window.innerWidth >= maxAncho) { setVv(null); return }
      // Solo interesa cuando el viewport visible difiere del de layout (teclado).
      const dif = Math.round(window.innerHeight - v.height)
      setVv(dif > 60 ? { height: Math.round(v.height), top: Math.round(v.offsetTop) } : null)
    }
    medir()
    v.addEventListener('resize', medir)
    v.addEventListener('scroll', medir)
    window.addEventListener('resize', medir)
    return () => { v.removeEventListener('resize', medir); v.removeEventListener('scroll', medir); window.removeEventListener('resize', medir) }
  }, [activo, maxAncho])
  return vv
}
