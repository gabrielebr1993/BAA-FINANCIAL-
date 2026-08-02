// BULK · Lógica PURA del perfil del chofer (sin React ni Firebase).
// Calcula, a partir de órdenes/transportes/jobs/clientes/plantas/incidencias,
// todo lo que muestra el perfil: actividad, transporte(s) y trabajo(s),
// estadísticas ricas (toneladas, $/ton, tiempos, puntualidad, desglose por
// material/equipo/estado/cliente/planta), calificación por estrellas (derivada
// de entregas vs rechazos) y la bandera de "rechaza muchas órdenes".
import { ORDEN_ESTADO as E } from './constants'
import { tsMillis } from '../data/chatKeys'

const FIN = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const ACTIVAS = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const n = (v) => Number(v) || 0
const clave = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const tonDe = (o) => n(o.pesoReal ?? o.pesoEstimado)

// Fecha representativa de una orden para ordenar la actividad (más reciente primero).
export const fechaOrden = (o) => o.hitos?.entrega || o.hitos?.tomada || o.creadoEn || ''

// Agrupa una lista por una clave y suma viajes/ton/pago.
const agrupar = (lista, keyFn) => {
  const m = new Map()
  for (const o of lista) {
    const k = keyFn(o)
    if (k == null || k === '') continue
    const g = m.get(k) || { key: k, viajes: 0, ton: 0, pago: 0 }
    g.viajes += 1; g.ton += tonDe(o); g.pago += n(o.pagoChofer)
    m.set(k, g)
  }
  return [...m.values()].map((g) => ({ ...g, ton: Math.round(g.ton) })).sort((a, b) => b.ton - a.ton || b.viajes - a.viajes)
}

export function perfilDeChofer({ ordenes = [], carriers = [], jobs = [], clientes = [], plants = [], incidents = [], nombre = '' }) {
  const k = clave(nombre)
  const rosterCarrier = carriers.find((c) => (c.choferes || []).some((d) => clave(d.nombre) === k)) || null
  const rosterChofer = rosterCarrier?.choferes?.find((d) => clave(d.nombre) === k) || null
  const rosterId = rosterChofer?.id || null
  const rosterUid = rosterChofer?.uid || null
  // Órdenes del chofer: por NOMBRE (normalizado), por el uid de su cuenta, o por su
  // id de roster (choferId puede ser cualquiera de ellos según cómo se asignó).
  const esMia = (o) => clave(o.choferNombre) === k || (rosterUid && o.choferId === rosterUid) || (rosterId && o.choferId === rosterId)
  const misOrdenes = ordenes
    .filter(esMia)
    .slice()
    .sort((a, b) => tsMillis(fechaOrden(b)) - tsMillis(fechaOrden(a)))
  // Rechazos hechos por este chofer (la orden guarda rechazo.por con su nombre).
  const rechazos = ordenes.filter((o) => clave(o.rechazo?.por) === k).length

  const idsT = new Set(misOrdenes.map((o) => o.transportistaId).filter(Boolean))
  if (rosterCarrier) idsT.add(rosterCarrier.id)
  const transportes = [...idsT]
  const trabajos = [...new Set(misOrdenes.map((o) => o.jobId).filter(Boolean))]
    .map((id) => jobs.find((j) => j.id === id))
    .filter(Boolean)

  const entregadas = misOrdenes.filter((o) => FIN.includes(o.estado))
  const enProceso = misOrdenes.filter((o) => ACTIVAS.includes(o.estado))
  const tonTotal = Math.round(entregadas.reduce((a, o) => a + tonDe(o), 0))
  const pagoTotal = entregadas.reduce((a, o) => a + n(o.pagoChofer), 0)
  const stats = { total: misOrdenes.length, entregadas: entregadas.length, ton: tonTotal, pago: pagoTotal }

  // Promedios y eficiencia.
  const pagoPromedio = entregadas.length ? Math.round(pagoTotal / entregadas.length) : 0
  const tonPromedio = entregadas.length ? Math.round((tonTotal / entregadas.length) * 10) / 10 : 0
  const dolarPorTon = tonTotal ? Math.round((pagoTotal / tonTotal) * 100) / 100 : 0
  // Tiempo promedio tomada → entrega (minutos).
  const durs = misOrdenes.map((o) => { const a = tsMillis(o.hitos?.tomada), b = tsMillis(o.hitos?.entrega); return (a && b && b > a) ? (b - a) / 60000 : null }).filter((v) => v != null)
  const tiempoPromMin = durs.length ? Math.round(durs.reduce((x, y) => x + y, 0) / durs.length) : null
  // Puntualidad: entregas dentro de lo esperado (< 180 min tomada→entrega).
  const aTiempo = durs.filter((d) => d <= 180).length
  const puntualidad = durs.length ? Math.round((aTiempo / durs.length) * 100) : null

  // Actividad temporal.
  const tsList = misOrdenes.map((o) => tsMillis(fechaOrden(o))).filter(Boolean).sort((a, b) => a - b)
  const primeraOrden = tsList[0] || null
  const ultimaOrden = tsList[tsList.length - 1] || null

  // Desgloses.
  const porMaterial = agrupar(misOrdenes, (o) => o.material)
  const porEstado = misOrdenes.reduce((m, o) => { m[o.estado] = (m[o.estado] || 0) + 1; return m }, {})
  const equipos = [...new Set(misOrdenes.map((o) => o.tipoEquipo).filter(Boolean))]
  const porTrabajo = agrupar(misOrdenes, (o) => o.jobId).map((g) => ({ ...g, nombre: jobs.find((j) => j.id === g.key)?.nombre || g.key }))
  const clientesTrab = [...new Set(misOrdenes.map((o) => o.clienteId).filter(Boolean))]
    .map((id) => ({ id, nombre: clientes.find((c) => c.id === id)?.nombre || '—' }))
  const plantasTrab = [...new Set(misOrdenes.map((o) => o.plantaId).filter(Boolean))]
    .map((id) => ({ id, nombre: plants.find((p) => p.id === id)?.nombre || '—' }))

  // Incidencias en las que aparece como responsable.
  const misIncidencias = incidents.filter((it) => clave(it.responsable) === k)

  // Calificación (1–5) derivada del desempeño: entregas vs rechazos.
  const baseCalif = stats.entregadas + rechazos
  const rating = baseCalif > 0 ? Math.round((stats.entregadas / baseCalif) * 5 * 10) / 10 : null
  const rechazoRate = baseCalif > 0 ? rechazos / baseCalif : 0
  const rechazaMucho = rechazos >= 3 && rechazoRate > 0.3
  const confiable = rechazos === 0 && stats.entregadas > 0
  const tasaAceptacion = (misOrdenes.length + rechazos) > 0 ? Math.round((misOrdenes.length / (misOrdenes.length + rechazos)) * 100) : null

  const existe = misOrdenes.length > 0 || !!rosterCarrier
  return {
    misOrdenes, rechazos, rosterCarrier, rosterChofer, transportes, trabajos, stats,
    enProcesoN: enProceso.length, pagoPromedio, tonPromedio, dolarPorTon, tiempoPromMin, puntualidad,
    primeraOrden, ultimaOrden, porMaterial, porEstado, equipos, porTrabajo, clientesTrab, plantasTrab,
    misIncidencias, rating, rechazaMucho, confiable, tasaAceptacion, existe,
  }
}
