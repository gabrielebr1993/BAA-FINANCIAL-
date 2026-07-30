// BULK · Lógica PURA del perfil del chofer (sin React ni Firebase).
// Calcula, a partir de órdenes/transportes/jobs, todo lo que muestra el perfil:
// actividad, transporte(s) y trabajo(s), estadísticas, calificación por estrellas
// (derivada de entregas vs rechazos) y la bandera de "rechaza muchas órdenes".
import { ORDEN_ESTADO as E } from './constants'
import { tsMillis } from '../data/chatKeys'

const FIN = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const n = (v) => Number(v) || 0
const clave = (s) => (s || '').trim().toLowerCase()

// Fecha representativa de una orden para ordenar la actividad (más reciente primero).
export const fechaOrden = (o) => o.hitos?.entrega || o.hitos?.tomada || o.creadoEn || ''

export function perfilDeChofer({ ordenes = [], carriers = [], jobs = [], nombre = '' }) {
  const k = clave(nombre)
  const misOrdenes = ordenes
    .filter((o) => clave(o.choferNombre) === k)
    .slice()
    .sort((a, b) => tsMillis(fechaOrden(b)) - tsMillis(fechaOrden(a)))
  // Rechazos hechos por este chofer (la orden guarda rechazo.por con su nombre).
  const rechazos = ordenes.filter((o) => clave(o.rechazo?.por) === k).length

  const rosterCarrier = carriers.find((c) => (c.choferes || []).some((d) => clave(d.nombre) === k)) || null
  const rosterChofer = rosterCarrier?.choferes?.find((d) => clave(d.nombre) === k) || null

  const idsT = new Set(misOrdenes.map((o) => o.transportistaId).filter(Boolean))
  if (rosterCarrier) idsT.add(rosterCarrier.id)
  const transportes = [...idsT]
  const trabajos = [...new Set(misOrdenes.map((o) => o.jobId).filter(Boolean))]
    .map((id) => jobs.find((j) => j.id === id))
    .filter(Boolean)

  const entregadas = misOrdenes.filter((o) => FIN.includes(o.estado))
  const stats = {
    total: misOrdenes.length,
    entregadas: entregadas.length,
    ton: Math.round(entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)),
    pago: entregadas.reduce((a, o) => a + n(o.pagoChofer), 0),
  }

  // Calificación (1–5) derivada del desempeño: entregas vs rechazos.
  const baseCalif = stats.entregadas + rechazos
  const rating = baseCalif > 0 ? Math.round((stats.entregadas / baseCalif) * 5 * 10) / 10 : null
  const rechazoRate = baseCalif > 0 ? rechazos / baseCalif : 0
  const rechazaMucho = rechazos >= 3 && rechazoRate > 0.3
  const confiable = rechazos === 0 && stats.entregadas > 0

  const existe = misOrdenes.length > 0 || !!rosterCarrier
  return { misOrdenes, rechazos, rosterCarrier, rosterChofer, transportes, trabajos, stats, rating, rechazaMucho, confiable, existe }
}
