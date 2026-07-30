// ============================================================================
// BULK · Dominio · Geo (lógica pura): distancias, geocercas, métricas de viaje.
// ============================================================================

const R_TIERRA_M = 6371000 // radio terrestre en metros

// Distancia Haversine en METROS entre dos coordenadas {lat,lng}.
export function distanciaM(a, b) {
  if (!a || !b) return 0
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

// ¿La posición está DENTRO de la geocerca (círculo lat/lng/radio en metros)?
export function dentroGeocerca(pos, gf) {
  if (!pos || !gf) return false
  return distanciaM(pos, { lat: gf.lat, lng: gf.lng }) <= (Number(gf.radio) || 0)
}

// Dado el estado previo (dentro/fuera) y la posición nueva, devuelve el evento de
// transición para una geocerca, o null si no cruzó el borde.
export function transicionGeocerca(estabaDentro, pos, gf) {
  const ahoraDentro = dentroGeocerca(pos, gf)
  if (ahoraDentro && !estabaDentro) return 'entrada'
  if (!ahoraDentro && estabaDentro) return 'salida'
  return null
}

// Geocerca objetivo de la fase actual del chofer.
//   recogida → la geocerca de la planta de la orden (por plantaId), o el GPS de la
//              planta con radio por defecto si no hay geocerca creada.
//   entrega  → como la orden no guarda un destino puntual, se usan TODAS las
//              geocercas tipo 'destino' (llega si entra en cualquiera).
// Devuelve una geocerca, un array de geocercas, o null si no hay ninguna definida.
export function geocercaObjetivo(orden, fase, geocercas, plantas) {
  const gs = geocercas || []
  if (fase === 'recogida') {
    const porPlanta = gs.find((g) => g.plantaId && g.plantaId === orden?.plantaId)
    if (porPlanta) return porPlanta
    const planta = (plantas || []).find((p) => p.id === orden?.plantaId)
    if (planta?.gps && planta.gps.lat != null) return { lat: planta.gps.lat, lng: planta.gps.lng, radio: 200, nombre: planta.nombre, tipo: 'planta' }
    return null
  }
  if (fase === 'entrega') {
    const dest = gs.filter((g) => g.tipo === 'destino')
    return dest.length ? dest : null
  }
  return null
}

// ¿Puede el chofer marcar "Llegué"? Si no hay geocerca definida para la fase, no se
// bloquea (true). Si la hay pero aún no tenemos GPS, false. Si la hay, exige estar dentro.
export function puedeMarcarLlegada(pos, orden, fase, geocercas, plantas) {
  const obj = geocercaObjetivo(orden, fase, geocercas, plantas)
  if (!obj) return true
  if (!pos) return false
  const lista = Array.isArray(obj) ? obj : [obj]
  return lista.some((g) => dentroGeocerca(pos, g))
}

// Métricas de un recorrido a partir de puntos [{lat,lng,speed?,ts}] ordenados por ts.
//   umbralMovMS: velocidad (m/s) sobre la cual se considera "en movimiento".
export function metricasRecorrido(puntos, umbralMovMS = 1.2) {
  const pts = (puntos || []).filter((p) => p && p.lat != null && p.lng != null)
  let km = 0, movMs = 0, stopMs = 0, vMax = 0, vSum = 0, vN = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const d = distanciaM(a, b) // metros
    km += d
    const dt = (new Date(b.ts) - new Date(a.ts)) / 1000 // s
    const v = b.speed != null ? Number(b.speed) : (dt > 0 ? d / dt : 0) // m/s
    if (v > vMax) vMax = v
    vSum += v; vN += 1
    if (dt > 0) { if (v >= umbralMovMS) movMs += dt; else stopMs += dt }
  }
  return {
    km: Math.round((km / 1000) * 100) / 100,
    minMovimiento: Math.round(movMs / 60),
    minDetenido: Math.round(stopMs / 60),
    velMaxKmh: Math.round(vMax * 3.6),
    velPromKmh: vN ? Math.round((vSum / vN) * 3.6) : 0,
    puntos: pts.length,
  }
}

// Desvío básico: distancia del punto al "corredor" recto planta→destino. Si supera
// `toleranciaM`, se considera fuera de ruta. (La ruta real por calles llega con la
// integración de mapas.) Devuelve la distancia perpendicular aproximada en metros.
export function distanciaAlCorredor(pos, origen, destino) {
  if (!pos || !origen || !destino) return 0
  // Proyección aproximada en plano local (suficiente para distancias cortas).
  const mLat = 111320
  const mLng = 111320 * Math.cos((origen.lat * Math.PI) / 180)
  const P = { x: (pos.lng - origen.lng) * mLng, y: (pos.lat - origen.lat) * mLat }
  const D = { x: (destino.lng - origen.lng) * mLng, y: (destino.lat - origen.lat) * mLat }
  const len2 = D.x * D.x + D.y * D.y
  if (len2 === 0) return Math.hypot(P.x, P.y)
  let t = (P.x * D.x + P.y * D.y) / len2
  t = Math.max(0, Math.min(1, t))
  const proj = { x: t * D.x, y: t * D.y }
  return Math.hypot(P.x - proj.x, P.y - proj.y)
}
