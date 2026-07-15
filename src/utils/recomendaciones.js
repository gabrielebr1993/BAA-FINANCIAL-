// Cliente del asesor: pide a JARVIS recomendaciones de negocio (solo análisis).
import { auth } from '../firebase'

export async function obtenerRecomendaciones({ companyId, semana, ciudad }) {
  const t = await auth.currentUser?.getIdToken()
  if (!t) return { ok: false, error: 'Sesión no válida.' }
  const resp = await fetch('/api/recomendaciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ companyId, semana, ciudad }),
  })
  return resp.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }))
}
