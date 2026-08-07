// ============================================================================
// BULK · Dominio · DIAGNÓSTICO de por qué una orden en cola no se está asignando.
// Lógica pura (sin Firebase): reutiliza los MISMOS filtros que el motor de
// emparejamiento para explicar, orden por orden, qué está bloqueando el match.
// Es solo lectura: no cambia nada, solo informa al dispatcher.
// ============================================================================
import { choferDisponible, equipoCompatible, trabajoCompatible } from './asignacionAuto'

// Choferes REALES (no demo) en línea, libres y con latido fresco ahora mismo.
export function choferesReales(presencias, ahoraMs) {
  return (presencias || []).filter((p) => !p.demo && choferDisponible(p, ahoraMs))
}

// Para UNA orden en cola: aplica los filtros del matcher en cascada y devuelve la
// PRIMERA razón que la deja sin chofer (o 'ok' si sí hay compatibles).
export function diagnosticarOrden(orden, presencias, ahoraMs) {
  const libres = choferesReales(presencias, ahoraMs)
  const rechazadoPor = orden.rechazadoPor || []
  const noRech = libres.filter((p) => !rechazadoPor.includes(p.uid || p.id))
  const equipoOk = noRech.filter((p) => equipoCompatible(p.equipos || p.equipo, orden.tipoEquipo))
  const compat = equipoOk.filter((p) => trabajoCompatible(p.jobs, orden.jobId))

  let razon
  if (compat.length) razon = { tipo: 'ok', texto: `${compat.length} chofer(es) compatibles en línea` }
  else if (libres.length === 0) razon = { tipo: 'sin_online', texto: 'No hay choferes en línea, libres y con la app activa' }
  else if (noRech.length === 0) razon = { tipo: 'rechazada', texto: 'Todos los choferes en línea ya la rechazaron o se les venció el tiempo' }
  else if (equipoOk.length === 0) razon = { tipo: 'equipo', texto: `Ningún chofer en línea tiene el equipo que pide la orden (${orden.tipoEquipo || 'sin especificar'})` }
  else razon = { tipo: 'trabajo', texto: 'Los choferes con el equipo correcto no están afiliados al trabajo de esta orden' }

  return { orden, razon, compatibles: compat.length, enLinea: libres.length }
}

// Diagnóstico de TODA la cola.
export function diagnosticarCola(ordenesCola, presencias, ahoraMs) {
  return (ordenesCola || []).map((o) => diagnosticarOrden(o, presencias, ahoraMs))
}
