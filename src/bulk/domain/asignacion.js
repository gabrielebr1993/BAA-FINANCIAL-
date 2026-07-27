// ============================================================================
// BULK · Dominio · Asignación inteligente (motor de REGLAS, sin servicio externo).
// Recomienda el mejor transportista combinando compatibilidad (regla dura),
// disponibilidad, cercanía por GPS, calificación y desempeño histórico.
// La firma está pensada para poder sustituir el scoring por un modelo de IA
// más adelante sin tocar la UI: mismo input (orden, carriers, stats), mismo output.
// ============================================================================
import { distanciaM } from './geo'
import { transportistaCompatible } from './ordenes'

const MAX_KM = 100 // a esta distancia (o más) la cercanía puntúa 0
const clamp01 = (n) => Math.max(0, Math.min(1, n))

// Pesos de cada factor (suman 1). Ajustables por el negocio.
export const PESOS = { cercania: 0.30, disponibilidad: 0.25, calificacion: 0.25, desempeno: 0.20 }

// Puntúa UN transportista para UNA orden. `s` = stats del carrier:
//   { activas, completadas, rechazos, pos:{lat,lng} }  · `planta` = {lat,lng} | null
export function puntuarTransportista(carrier, orden, s = {}, planta = null) {
  const activas = Number(s.activas) || 0
  const completadas = Number(s.completadas) || 0
  const rechazos = Number(s.rechazos) || 0

  const disponibilidad = 1 / (1 + activas) // menos órdenes activas → más disponible
  const calificacion = clamp01((carrier.calificacion != null ? Number(carrier.calificacion) : 4) / 5)
  const desempeno = clamp01(completadas / (completadas + rechazos + 1))

  let cercania = 0.5, distKm = null // neutral si no hay datos de posición
  if (planta && s.pos) { distKm = distanciaM(s.pos, planta) / 1000; cercania = clamp01(1 - distKm / MAX_KM) }

  const score = PESOS.cercania * cercania + PESOS.disponibilidad * disponibilidad + PESOS.calificacion * calificacion + PESOS.desempeno * desempeno
  return {
    carrier, score: Math.round(score * 1000) / 1000,
    detalle: {
      cercania: Math.round(cercania * 100), disponibilidad: Math.round(disponibilidad * 100),
      calificacion: Math.round(calificacion * 100), desempeno: Math.round(desempeno * 100),
      distKm: distKm != null ? Math.round(distKm * 10) / 10 : null, activas,
    },
  }
}

// Ranking de transportistas COMPATIBLES para la orden (mejor primero). `statsPorCarrier`
// es un mapa { [carrierId]: stats }. Nunca incluye transportistas incompatibles.
export function recomendarTransportistas(orden, carriers, statsPorCarrier = {}, planta = null) {
  return (carriers || [])
    .filter((c) => c.activo !== false && transportistaCompatible(c.equipos, orden?.tipoEquipo))
    .map((c) => puntuarTransportista(c, orden, statsPorCarrier[c.id] || {}, planta))
    .sort((a, b) => b.score - a.score)
}
