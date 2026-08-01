// BULK · Alertas de órdenes atrasadas (lógica pura, testeable).
// Marca en ROJO las órdenes que llevan demasiado tiempo sin avanzar:
//   - "recogida": creada/ofrecida/aceptada/en planta sin registrar carga tras N horas.
//   - "entrega":  cargada/en ruta/en destino sin registrar entrega tras N horas.
import { tsMillis } from '../data/chatKeys'
import { ORDEN_ESTADO as E } from './constants'

export const LIMITE_ALERTA_MS = 3 * 3600 * 1000 // 3 horas

const ESPERA_RECOGIDA = [E.CREADA, E.EN_COLA, E.NOTIFICANDO, E.ACEPTADA, E.EN_PLANTA]
const EN_ENTREGA = [E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]

// Devuelve { tipo, horas } si la orden está atrasada, o null si va en tiempo.
export function alertaOrden(orden, ahoraMs, limiteMs = LIMITE_ALERTA_MS) {
  if (!orden) return null
  const h = orden.hitos || {}
  if (ESPERA_RECOGIDA.includes(orden.estado) && !h.carga) {
    const base = tsMillis(orden.asignadoEn || orden.creadoEn)
    if (base && ahoraMs - base > limiteMs) return { tipo: 'recogida', horas: Math.floor((ahoraMs - base) / 3600000) }
  }
  if (EN_ENTREGA.includes(orden.estado) && !h.entrega) {
    const base = tsMillis(h.carga || h.salidaPlanta || orden.asignadoEn || orden.creadoEn)
    if (base && ahoraMs - base > limiteMs) return { tipo: 'entrega', horas: Math.floor((ahoraMs - base) / 3600000) }
  }
  return null
}
