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

// ¿El chofer está habilitado para el trabajo de la orden? (regla ESTRICTA)
//  - Chofer SIN trabajos asignados → NO recibe ninguna orden: el transportista
//    dirige a cada chofer a sus trabajos desde "Mis choferes".
//  - Orden SIN trabajo (directa) → la recibe cualquier chofer habilitado (con
//    al menos un trabajo asignado).
//  - Orden CON trabajo → el chofer debe tenerlo asignado. El trabajo del chofer
//    se guarda por CÓDIGO (prefijo del número, ej. "OBRA1") — el transportista
//    no puede leer bulk_jobs — así que se acepta por código O por jobId.
export function trabajoCompatible(jobsChofer, orden) {
  const jobs = (Array.isArray(jobsChofer) ? jobsChofer : []).filter(Boolean)
  if (jobs.length === 0) return false
  const o = orden && typeof orden === 'object' ? orden : { jobId: orden }
  const codigo = String(o.numero || '').split('-').slice(0, -1).join('-')
  if (!o.jobId && !codigo) return true
  return (o.jobId && jobs.includes(o.jobId)) || (codigo && jobs.includes(codigo))
}

// Enriquece cada presencia con los Trabajos/equipos ACTUALES del roster del
// transportista (no la foto que el chofer guardó al conectarse). Engancha su ficha
// por uid y, si no, por nombre — así los cambios del admin (agregar/quitar un
// Trabajo o equipo) aplican al instante SIN que el chofer tenga que reconectarse.
// Se usa igual en el motor y en el diagnóstico para que siempre coincidan.
export function enriquecerConRoster(presencias, carriers) {
  const norm = (s) => (s || '').trim().toLowerCase()
  const rosterDe = (p) => {
    const carrier = (carriers || []).find((c) => c.id === p.carrierId)
    const lista = carrier?.choferes || []
    return lista.find((d) => d.uid && d.uid === p.uid)
      || lista.find((d) => norm(d.nombre) === norm(p.nombre))
      || null
  }
  return (presencias || []).map((p) => {
    const r = rosterDe(p)
    if (!r) return p
    // UNIÓN de equipos/trabajos de la PRESENCIA (lo que el chofer llevaba al conectarse)
    // y del ROSTER (lo que el admin tiene puesto). Así, si CUALQUIERA de los dos tiene el
    // equipo requerido, el chofer es compatible. (Antes el roster PISABA la presencia:
    // si el roster estaba incompleto, el chofer quedaba fuera aunque su app mostrara el
    // equipo correcto — ese era el caso de "carlos sí tiene End Dump pero no le llega".)
    const pEquipos = (p.equipos && p.equipos.length) ? p.equipos : (p.equipo ? [p.equipo] : [])
    const rEquipos = (r.equipos && r.equipos.length) ? r.equipos : (r.equipo ? [r.equipo] : [])
    const equipos = [...new Set([...pEquipos, ...rEquipos])]
    const pJobs = Array.isArray(p.jobs) ? p.jobs : []
    const rJobs = Array.isArray(r.jobs) ? r.jobs : []
    const jobs = [...new Set([...pJobs, ...rJobs])]
    return { ...p, equipos, jobs }
  })
}

// ── Rechazos: NO excluyen, solo mandan AL FINAL de la cola de ESA orden ──
// Cada rechazo suma en orden.rechazosNum[uid]; el motor ordena a los candidatos
// por rechazos ASCENDENTES (quien nunca rechazó va primero) y la orden sigue
// circulando entre TODOS los choferes en ciclo. El único freno es un
// enfriamiento corto para no re-timbrar al que ACABA de rechazarla.
export const RECHAZO_COOLDOWN_MS = 3 * 60 * 1000
export function rechazosDe(orden, uid) {
  const m = (orden && orden.rechazosNum) || {}
  if (m[uid] != null) return Number(m[uid]) || 0
  return ((orden && orden.rechazadoPor) || []).includes(uid) ? 1 : 0
}
export function enEnfriamiento(orden, uid, ahoraMs) {
  const u = orden && orden.ultimoRechazo
  if (!u || !u.porUid || u.porUid !== uid) return false
  return (ahoraMs - tsMillis(u.ts)) < RECHAZO_COOLDOWN_MS
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
// COMPATIBLE POR EQUIPO que lleva más tiempo en línea (orden de llegada). Quien
// rechazó la orden NO queda fuera: va al final (rechazos ascendentes) y la orden
// sigue circulando en ciclo; solo se salta al que la rechazó hace <3 min.
// 1 orden → 1 chofer (un chofer no recibe dos a la vez).
// La afiliación al Trabajo se toma en cuenta como PREFERENCIA: primero se ofrece a
// los choferes afiliados al Job de la orden; si NINGUNO afiliado está libre, cae a
// cualquier chofer con el equipo correcto (así las órdenes nunca se quedan atascadas).
// Con N órdenes y N choferes libres con el equipo correcto → N asignaciones a la vez.
// Devuelve [{ orden, chofer }] listo para persistir.
export function emparejar(ordenesCola, presencias, ahoraMs) {
  const libres = choferesLibres(presencias, ahoraMs)
  const usados = new Set()
  const cola = [...(ordenesCola || [])].sort((a, b) => tsMillis(a.creadoEn || a.numero) - tsMillis(b.creadoEn || b.numero))
  const pares = []
  for (const orden of cola) {
    const disponibles = libres
      .filter((p) => !usados.has(p.id))
      .filter((p) => !enEnfriamiento(orden, p.uid || p.id, ahoraMs))
      .filter((p) => equipoCompatible(p.equipos || p.equipo, orden.tipoEquipo))
    // Afiliación al Trabajo OBLIGATORIA: sin trabajo asignado no llegan órdenes.
    const afiliados = disponibles.filter((p) => trabajoCompatible(p.jobs, orden))
    const cand = afiliados
      .sort((a, b) => (rechazosDe(orden, a.uid || a.id) - rechazosDe(orden, b.uid || b.id)) || (tsMillis(a.desde) - tsMillis(b.desde)))
    if (cand.length) { pares.push({ orden, chofer: cand[0] }); usados.add(cand[0].id) }
  }
  return pares
}

// ¿Venció el tiempo de respuesta de una orden ya ofrecida (NOTIFICANDO)?
export function ofertaVencida(orden, ahoraMs) {
  if (!orden?.asignacionExpira) return false
  return ahoraMs > tsMillis(orden.asignacionExpira)
}
