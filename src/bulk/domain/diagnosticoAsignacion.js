// ============================================================================
// BULK · Dominio · DIAGNÓSTICO de por qué una orden en cola no se está asignando.
// Lógica pura (sin Firebase): reutiliza los MISMOS filtros que el motor de
// emparejamiento para explicar, orden por orden, qué está bloqueando el match.
// Es solo lectura: no cambia nada, solo informa al dispatcher.
// ============================================================================
import { choferDisponible, equipoCompatible, trabajoCompatible, enEnfriamiento, PRESENCIA_TTL_MS } from './asignacionAuto'
import { tsMillis } from '../data/chatKeys'

// Explica por qué UN chofer en línea NO está recibiendo una orden de la cola (o 'ok').
export function diagnosticarChofer(p, ordenesCola, ahoraMs) {
  if (!p) return { tipo: 'na', texto: '' }
  if (p.demo) return { tipo: 'demo', texto: 'Chofer de prueba (demo): no recibe órdenes reales' }
  if (p.ordenId || (p.estado && p.estado !== 'libre')) return { tipo: 'ocupado', texto: 'Tiene una orden asignada u ofreciéndose' }
  if ((ahoraMs - tsMillis(p.heartbeat || p.desde)) > PRESENCIA_TTL_MS) return { tipo: 'viejo', texto: 'Sin latido reciente (app cerrada): pídele reconectarse' }
  const equipos = (p.equipos && p.equipos.length) ? p.equipos : (p.equipo ? [p.equipo] : [])
  const cola = ordenesCola || []
  if (cola.length === 0) return { tipo: 'sin_cola', texto: 'No hay órdenes en cola' }
  const conEquipo = cola.filter((o) => equipoCompatible(equipos, o.tipoEquipo))
  if (conEquipo.length === 0) return { tipo: 'equipo', texto: `Su equipo (${equipos.join(', ') || '—'}) no coincide con las órdenes en cola` }
  // Rechazar ya NO excluye (solo manda al final del ciclo de esa orden); el único
  // bloqueo real es el enfriamiento de 3 min tras el último rechazo.
  const sinEnfriar = conEquipo.filter((o) => !enEnfriamiento(o, p.uid || p.id, ahoraMs))
  if (sinEnfriar.length === 0) return { tipo: 'rechazo', texto: 'Acaba de rechazar las órdenes compatibles: se le volverán a ofrecer en unos minutos (va al final del ciclo)' }
  return { tipo: 'ok', texto: 'Disponible — recibirá una orden en breve' }
}

// Choferes REALES (no demo) en línea, libres y con latido fresco ahora mismo.
export function choferesReales(presencias, ahoraMs) {
  return (presencias || []).filter((p) => !p.demo && choferDisponible(p, ahoraMs))
}

// Para UNA orden en cola: aplica los filtros del matcher en cascada y devuelve la
// PRIMERA razón que la deja sin chofer (o 'ok' si sí hay compatibles).
export function diagnosticarOrden(orden, presencias, ahoraMs) {
  const libres = choferesReales(presencias, ahoraMs)
  // Rechazar NO excluye: solo aplica el enfriamiento de 3 min del último rechazo.
  const sinEnfriar = libres.filter((p) => !enEnfriamiento(orden, p.uid || p.id, ahoraMs))
  // Compatibilidad por EQUIPO (obligatorio) y afiliación al Trabajo (obligatoria).
  const compat = sinEnfriar.filter((p) => equipoCompatible(p.equipos || p.equipo, orden.tipoEquipo))
  const afiliados = compat.filter((p) => trabajoCompatible(p.jobs, orden))

  let razon
  if (afiliados.length) razon = { tipo: 'ok', texto: `${afiliados.length} chofer(es) afiliado(s) al trabajo en línea` }
  else if (compat.length) razon = { tipo: 'trabajo', texto: 'Hay choferes con el equipo, pero NINGUNO tiene asignado este trabajo (el transportista los asigna en "Mis choferes")' }
  else if (libres.length === 0) razon = { tipo: 'sin_online', texto: 'No hay choferes en línea, libres y con la app activa' }
  else if (sinEnfriar.length === 0) razon = { tipo: 'rechazada', texto: 'El último chofer acaba de rechazarla: se re-ofrece en unos minutos (el ciclo sigue con todos)' }
  else razon = { tipo: 'equipo', texto: `Ningún chofer en línea tiene el equipo que pide la orden (${orden.tipoEquipo || 'sin especificar'})` }

  return { orden, razon, compatibles: compat.length, enLinea: libres.length }
}

// Diagnóstico de TODA la cola.
export function diagnosticarCola(ordenesCola, presencias, ahoraMs) {
  return (ordenesCola || []).map((o) => diagnosticarOrden(o, presencias, ahoraMs))
}
