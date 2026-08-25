// ============================================================================
// BULK · Dominio · ETA de una orden (lógica pura, sin costo de API).
// ----------------------------------------------------------------------------
// Fuente del ETA en tiempo real:
//   1) POSICIÓN VIVA del camión (orden.ultimaPos, la espejea el GPS del chofer
//      cada ~20 s durante el viaje).
//   2) DESTINO de la fase: hacia la PLANTA (estado aceptada) o hacia la ZONA DE
//      ENTREGA (estado en_ruta) — la geocerca del trabajo (destinoGeofenceId)
//      o la geocerca de la planta.
//   3) Distancia Haversine × factor de ruta (1.25: las carreteras no son línea
//      recta) ÷ velocidad promedio (55 km/h, o la velocidad GPS reciente si el
//      camión va más rápido).
// Es un ESTIMADO honesto sin costo. Para tráfico real se puede conectar Google
// Routes API vía backend (misma GOOGLE_MAPS_API_KEY) sin cambiar esta interfaz.
// ============================================================================
import { distanciaM, geocercaObjetivo } from './geo'

const FACTOR_RUTA = 1.25
const VEL_BASE_KMH = 55
const GPS_VIEJO_MS = 5 * 60 * 1000 // sin señal > 5 min → el ETA se marca como viejo

// Calcula el ETA de una orden EN MOVIMIENTO. Devuelve null si no aplica
// (sin GPS, en planta/cargando, ya en destino o finalizada).
// → { fase: 'recogida'|'entrega', distKm, minutos, llegada: Date, viejo: bool }
export function etaOrden(orden, geocercas = [], plantas = []) {
  const pos = orden?.ultimaPos
  if (!pos || pos.lat == null) return null
  let fase = null
  if (orden.estado === 'aceptada') fase = 'recogida'
  else if (orden.estado === 'en_ruta') fase = 'entrega'
  else return null

  // Destino puntual del trabajo primero (job amarrado a una geocerca concreta).
  let obj = null
  if (fase === 'entrega' && orden.destinoGeofenceId) {
    obj = geocercas.find((g) => g.id === orden.destinoGeofenceId) || null
  }
  if (!obj) obj = geocercaObjetivo(orden, fase, geocercas, plantas)
  if (!obj) return null
  const lista = (Array.isArray(obj) ? obj : [obj]).filter((g) => g && g.lat != null)
  if (!lista.length) return null

  const distRecta = Math.min(...lista.map((g) => distanciaM(pos, { lat: g.lat, lng: g.lng })))
  const distM = distRecta * FACTOR_RUTA
  // Velocidad: la del GPS si viene y es realista (> 20 km/h); si no, la base.
  const velGps = Number(pos.speed) > 5.5 ? Number(pos.speed) * 3.6 : 0
  const velKmh = Math.max(VEL_BASE_KMH, Math.min(110, velGps))
  const minutos = Math.max(1, Math.round((distM / 1000 / velKmh) * 60))
  const tsPos = pos.ts ? new Date(pos.ts).getTime() : null
  return {
    fase,
    distKm: Math.round(distM / 100) / 10,
    minutos,
    llegada: new Date(Date.now() + minutos * 60000),
    viejo: tsPos != null && Date.now() - tsPos > GPS_VIEJO_MS,
  }
}

// Texto corto listo para pintar: "≈ 35 min · 2:40 pm (a 28.4 km)".
export function etaTexto(eta) {
  if (!eta) return ''
  const hora = eta.llegada.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })
  return `≈ ${eta.minutos} min · ${hora}`
}
