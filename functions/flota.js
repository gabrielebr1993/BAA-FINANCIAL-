// ============================================================================
// FLOTA · GPS en vivo de las cargo vans (módulo Walmart/Package → pantalla Flota)
//
// Lee las posiciones desde TU PROPIO servidor Traccar (open source, self-hosted)
// usando su API REST. Las claves del servidor viven SOLO aquí (secretos del
// backend); el navegador nunca las ve y jamás viajan por el chat.
//
// Cómo funciona:
//   [rastreador en la van] --SIM/celular--> [tu Traccar] --API REST--> aquí
//   esta function --> la app pinta las vans en el mapa (pantalla Flota).
//
// Independiente de cualquier proveedor: el servidor es tuyo, los datos son
// tuyos. Solo pagas la SIM de datos y el servidor chico donde corre Traccar.
//
// Secretos (se ponen UNA vez desde Cloud Shell, nunca por chat ni en el código):
//   firebase functions:secrets:set TRACCAR_URL      → p.ej. https://gps.milepay.io
//   firebase functions:secrets:set TRACCAR_TOKEN    → token de la API de Traccar
//     (se genera en Traccar: Configuración → tu usuario → "Token" → Generar)
//
// Mapa opcional rastreador→chofer: documento Firestore `flota_config/mapa`
//   { "<uniqueId del aparato>": { "chofer": "Nilo E.", "nombre": "Van 2" }, ... }
//   Si no existe, se usa el nombre que tenga el aparato en Traccar.
// ============================================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')
const { puedeVerFlota } = require('./flotaAuth')

const SECRETS = ['TRACCAR_URL', 'TRACCAR_TOKEN']
const db = () => admin.firestore()

// Traccar entrega la velocidad en NUDOS → la pasamos a millas por hora.
const NUDOS_A_MPH = 1.15078
const mph = (nudos) => Math.round((Number(nudos) || 0) * NUDOS_A_MPH)

// Llama a la API de Traccar con el token (Authorization: Bearer). Si el token
// no funcionara como Bearer en algún Traccar viejo, también lo manda por query.
async function traccarGet(base, token, ruta) {
  const url = base.replace(/\/+$/, '') + ruta + (ruta.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`Traccar ${ruta}: ${r.status} ${txt.slice(0, 200)}`)
  }
  return r.json()
}

// Convierte una posición + su aparato en la fila que espera la pantalla Flota.
function aVan(dev, pos, mapa) {
  const uid = dev.uniqueId || String(dev.id)
  const extra = mapa[uid] || mapa[String(dev.id)] || {}
  const attrs = pos?.attributes || {}
  const cuando = pos?.deviceTime || pos?.fixTime || dev.lastUpdate
  return {
    id: dev.id,
    nombre: extra.nombre || dev.name || `Van ${dev.id}`,
    chofer: extra.chofer || dev.name || '',
    donde: attrs.address || pos?.address || '',
    lat: pos ? Number(pos.latitude) : null,
    lng: pos ? Number(pos.longitude) : null,
    velocidad: pos ? mph(pos.speed) : 0,
    rumbo: pos ? Math.round(Number(pos.course) || 0) : 0,
    ultima: cuando ? Date.parse(cuando) : 0,
  }
}

// onCall: la app pide las ubicaciones. Devuelve { configurado, vans }.
//   configurado=false → aún no hay Traccar conectado (la app muestra el demo).
exports.flotaUbicaciones = onCall({ secrets: SECRETS, timeoutSeconds: 30 }, async (req) => {
  // Debe estar autenticado y tener el mismo acceso efectivo que la ruta /flota.
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.')
  const perfilSnap = await db().collection('users').doc(req.auth.uid).get()
  const perfil = perfilSnap.exists ? perfilSnap.data() : null
  if (!puedeVerFlota(perfil, req.auth.token?.email)) {
    throw new HttpsError('permission-denied', 'Sin permiso para ver la flota.')
  }

  const base = process.env.TRACCAR_URL
  const token = process.env.TRACCAR_TOKEN
  if (!base || !token) return { configurado: false, vans: [] }

  try {
    const [devices, positions] = await Promise.all([
      traccarGet(base, token, '/api/devices'),
      traccarGet(base, token, '/api/positions'),
    ])
    // posición más reciente por aparato
    const posPorDev = new Map()
    for (const p of positions || []) {
      const prev = posPorDev.get(p.deviceId)
      if (!prev || Date.parse(p.deviceTime || p.fixTime || 0) > Date.parse(prev.deviceTime || prev.fixTime || 0)) {
        posPorDev.set(p.deviceId, p)
      }
    }
    // mapa opcional aparato→chofer
    let mapa = {}
    try {
      const snap = await db().collection('flota_config').doc('mapa').get()
      if (snap.exists) mapa = snap.data() || {}
    } catch { /* el mapa es opcional */ }

    const vans = (devices || [])
      .map((d) => aVan(d, posPorDev.get(d.id), mapa))
      .filter((v) => v.lat != null && v.lng != null && !Number.isNaN(v.lat))

    return { configurado: true, vans, total: vans.length, consultadoEn: new Date().toISOString() }
  } catch (e) {
    throw new HttpsError('unavailable', `No pude leer del servidor Traccar: ${e.message || e}`)
  }
})
