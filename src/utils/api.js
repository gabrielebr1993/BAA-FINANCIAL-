// ---------------------------------------------------------------------------
// Cliente del endpoint serverless /api/crear-usuario.
//
// Blindado para que la UI NUNCA se quede colgada esperando a la función:
//   - AbortController con timeout (la función serverless en frío puede tardar).
//   - Si la respuesta no es JSON (timeout/500 de Vercel devuelve HTML), se
//     traduce a un mensaje claro en vez de "Respuesta inválida del servidor".
//   - Un reintento automático (los arranques en frío suelen fallar solo la 1ª vez).
// ---------------------------------------------------------------------------

async function intento(body, token, timeoutMs) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch('/api/crear-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    let data = null
    try { data = await resp.json() } catch { data = null }
    if (data && typeof data === 'object') return data
    // Respuesta sin JSON válido → casi siempre timeout (504/502) o crash (500) de la función.
    return {
      ok: false,
      _reintentable: resp.status >= 500,
      error:
        resp.status === 504 || resp.status === 502
          ? 'El servidor tardó demasiado en responder (timeout de la función). Reintenta; si persiste, revisa los logs en Vercel.'
          : `El servidor respondió sin datos válidos (HTTP ${resp.status}). Revisa los logs de la función en Vercel.`,
    }
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { ok: false, _reintentable: true, error: `El servidor no respondió a tiempo (${Math.round(timeoutMs / 1000)}s). Reintenta en un momento (arranque en frío).` }
    }
    return { ok: false, _reintentable: true, error: 'No se pudo contactar al servidor: ' + (e?.message || 'desconocido') }
  } finally {
    clearTimeout(t)
  }
}

// Crea un usuario vía el endpoint. Devuelve { ok, uid } o { ok:false, error }.
export async function crearUsuarioApi(body, token, { timeoutMs = 30000 } = {}) {
  const r1 = await intento(body, token, timeoutMs)
  if (r1.ok || !r1._reintentable) return r1
  // Un reintento (típico: la función estaba fría y ya quedó caliente).
  const r2 = await intento(body, token, timeoutMs)
  return r2
}
