// ============================================================================
// BULK · Dominio · Flujo de una orden (máquina de estados del chofer)
// Cada avance registra automáticamente su marca de tiempo (hito).
// ============================================================================
import { ORDEN_ESTADO as E } from './constants'

// Dado el estado actual, devuelve el siguiente paso que ejecuta el CHOFER.
//   requiere : datos extra que pide el paso ('ticket' o 'pod').
//   gate     : geocerca que debe alcanzar para habilitar el botón ('planta' | 'destino').
//   fase     : 'recogida' (va/llega a la planta) o 'entrega' (va/llega al destino).
export function siguientePasoChofer(estado) {
  switch (estado) {
    case E.ACEPTADA:   return { next: E.EN_PLANTA,  hito: 'llegadaPlanta',  label: 'Llegué a la planta', gate: 'planta', fase: 'recogida' }
    case E.EN_PLANTA:  return { next: E.EN_RUTA,    hito: 'carga',          label: 'Registrar ticket de carga', requiere: 'ticket', fase: 'recogida' }
    case E.EN_RUTA:    return { next: E.EN_DESTINO, hito: 'llegadaDestino', label: 'Llegué al destino', gate: 'destino', fase: 'entrega' }
    case E.EN_DESTINO: return { next: E.ENTREGADA,  hito: 'entrega',        label: 'Registrar entrega (foto + firma)', requiere: 'pod', fase: 'entrega' }
    default: return null // ENTREGADA espera liberación (código del supervisor)
  }
}

// Fase actual del chofer según el estado (para saber qué destino mostrar).
export function faseChofer(estado) {
  if ([E.ACEPTADA, E.EN_PLANTA].includes(estado)) return 'recogida'
  if ([E.EN_RUTA, E.EN_DESTINO].includes(estado)) return 'entrega'
  return null
}

// Estados en los que el chofer tiene una orden "activa" (en curso).
export const ESTADOS_ACTIVOS_CHOFER = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO, E.ENTREGADA]
// Estados finales (aparecen en historial).
export const ESTADOS_HISTORIAL = [E.LIBERADA, E.CERRADA]

export function ahora() { return new Date().toISOString() }
