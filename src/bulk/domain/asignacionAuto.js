// ============================================================================
// BULK · Dominio · Asignación AUTOMÁTICA por disponibilidad (lógica pura)
// Empareja órdenes en cola con choferes EN LÍNEA. Sin dependencias de Firebase:
// todo es determinista y testeable en Node.
// ============================================================================
import { transportistaCompatible } from './ordenes'
import { tsMillis } from '../data/chatKeys'

// Ventana de latido: una presencia se considera "viva" si su heartbeat es
// más reciente que esto. Si el chofer cierra la app, deja de latir y sale.
export const PRESENCIA_TTL_MS = 90 * 1000
// Tiempo que tiene el chofer para aceptar antes de contar como rechazo.
export const ESPERA_RESPUESTA_MS = 120 * 1000

// ¿El camión del chofer sirve para el equipo que pide la orden?
// Acepta un equipo (string) o VARIOS (array). Orden sin `tipoEquipo` → cualquiera.
export function equipoCompatible(equipoChofer, tipoEquipoReq) {
  const lista = Array.isArray(equipoChofer) ? equipoChofer : (equipoChofer ? [equipoChofer] : [])
  return transportistaCompatible(lista, tipoEquipoReq)
}

// ¿El chofer está habilitado para el trabajo de la orden?
//  - Chofer sin trabajos configurados → recibe de cualquiera (sin restricción).
//  - Orden SIN trabajo (orden directa por cliente) → la puede recibir cualquiera,
//    aunque el chofer tenga trabajos: los trabajos del chofer solo LIMITAN las
//    órdenes que SÍ pertenecen a un trabajo, no las órdenes directas.
//  - Orden CON trabajo → el chofer debe estar afiliado a ese trabajo.
export function trabajoCompatible(jobsChofer, jobId) {
  if (!jobsChofer || jobsChofer.length === 0) return true
  if (!jobId) return true
  return jobsChofer.includes(jobId)
}

// ¿Está esta presencia libre y viva ahora mismo?
export function choferDisponible(p, ahoraMs) {
  if (!p || p.enLinea !== true) return false
  if (p.ordenId) return false // ya tiene una orden reservada/en curso
  if (p.estado && p.estado !== 'libre') return false
  return (ahoraMs - tsMillis(p.heartbeat || p.desde)) <= PRESENCIA_TTL_MS
}

// Filtra la lista de presencias a las que están disponibles ahora.
export function choferesLibres(presencias, ahoraMs) {
  return (presencias || []).filter((p) => choferDisponible(p, ahoraMs))
}

// Empareja: para cada orden en cola (más antigua primero), toma el chofer libre
// COMPATIBLE por tipo de camión que lleva más tiempo en línea (orden de llegada),
// saltando a quienes ya la rechazaron. 1 orden → 1 chofer.
// Devuelve [{ orden, chofer }] listo para persistir.
export function emparejar(ordenesCola, presencias, ahoraMs) {
  const libres = choferesLibres(presencias, ahoraMs)
  const usados = new Set()
  const cola = [...(ordenesCola || [])].sort((a, b) => tsMillis(a.creadoEn || a.numero) - tsMillis(b.creadoEn || b.numero))
  const pares = []
  for (const orden of cola) {
    const rechazadoPor = orden.rechazadoPor || []
    const cand = libres
      .filter((p) => !usados.has(p.id))
      .filter((p) => !rechazadoPor.includes(p.uid || p.id))
      .filter((p) => equipoCompatible(p.equipos || p.equipo, orden.tipoEquipo))
      .filter((p) => trabajoCompatible(p.jobs, orden.jobId))
      .sort((a, b) => tsMillis(a.desde) - tsMillis(b.desde))
    if (cand.length) { pares.push({ orden, chofer: cand[0] }); usados.add(cand[0].id) }
  }
  return pares
}

// ¿Venció el tiempo de respuesta de una orden ya ofrecida (NOTIFICANDO)?
export function ofertaVencida(orden, ahoraMs) {
  if (!orden?.asignacionExpira) return false
  return ahoraMs > tsMillis(orden.asignacionExpira)
}
