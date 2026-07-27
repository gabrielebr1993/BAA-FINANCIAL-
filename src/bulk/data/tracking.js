// BULK · Tracking GPS. Puntos en `bulk_trackpoints` (uno por posición) y la última
// posición espejeada en la orden para el mapa en vivo. Se ordena por `ts` en cliente
// para no requerir índices compuestos de Firestore.
import { crear, guardar, suscribir, where } from './repo'

export async function enviarPunto(tenantId, orden, pos) {
  const punto = { orderId: orden.id, lat: pos.lat, lng: pos.lng, speed: pos.speed ?? null, ts: new Date().toISOString() }
  await crear('trackpoints', tenantId, punto)
  await guardar('orders', orden.id, { ultimaPos: { ...punto } })
}

// Suscripción a los puntos de una orden (ordenados por tiempo).
export function suscribirTrack(tenantId, orderId, cb) {
  return suscribir('trackpoints', tenantId, (d) => {
    cb(d.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1)))
  }, [where('orderId', '==', orderId)])
}
