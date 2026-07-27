// ============================================================================
// BULK · Dominio · Flujo de una orden (máquina de estados del chofer)
// Cada avance registra automáticamente su marca de tiempo (hito).
// ============================================================================
import { ORDEN_ESTADO as E } from './constants'

// Dado el estado actual, devuelve el siguiente paso que ejecuta el CHOFER.
// `requiere` indica si el paso necesita datos extra (peso/ticket o POD).
export function siguientePasoChofer(estado) {
  switch (estado) {
    case E.ACEPTADA: return { next: E.EN_PLANTA, hito: 'llegadaPlanta', label: 'Llegué a la planta' }
    case E.EN_PLANTA: return { next: E.CARGANDO, hito: 'carga', label: 'Iniciar carga' }
    case E.CARGANDO: return { next: E.EN_RUTA, hito: 'salidaPlanta', label: 'Salí de la planta', requiere: 'ticket' }
    case E.EN_RUTA: return { next: E.EN_DESTINO, hito: 'llegadaDestino', label: 'Llegué al destino' }
    case E.EN_DESTINO: return { next: E.ENTREGADA, hito: 'entrega', label: 'Entregar (POD)', requiere: 'pod' }
    default: return null // ENTREGADA espera liberación del supervisor
  }
}

// Estados en los que el chofer tiene una orden "activa" (en curso).
export const ESTADOS_ACTIVOS_CHOFER = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO, E.ENTREGADA]
// Estados finales (aparecen en historial).
export const ESTADOS_HISTORIAL = [E.LIBERADA, E.CERRADA]

export function ahora() { return new Date().toISOString() }
