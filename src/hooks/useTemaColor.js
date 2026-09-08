// Hook del rediseño 2026 / orden "Pantalla completa": una pantalla NAVY (landing,
// login, llamada, videollamada) cambia al montarse el color del documento y el
// `theme-color` (la barra de estado del sistema se pinta a juego) y lo RESTAURA
// al salir. Las pantallas crema no necesitan nada: el fondo raíz ya es crema.
import { useEffect } from 'react'

export function useTemaColor(color) {
  useEffect(() => {
    if (!color) return undefined
    const html = document.documentElement
    const prevHtml = html.style.background
    const prevBody = document.body.style.background
    html.style.background = color
    document.body.style.background = color
    // theme-color: puede haber varias <meta> (media light/dark); se cambian todas.
    const metas = [...document.querySelectorAll('meta[name="theme-color"]')]
    const prevMetas = metas.map((m) => m.getAttribute('content'))
    metas.forEach((m) => m.setAttribute('content', color))
    return () => {
      html.style.background = prevHtml
      document.body.style.background = prevBody
      metas.forEach((m, i) => m.setAttribute('content', prevMetas[i]))
    }
  }, [color])
}
