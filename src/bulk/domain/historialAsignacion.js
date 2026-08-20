// ============================================================================
// BULK · Historial de asignación (auditoría del recorrido de una orden entre
// choferes). Se guarda en la propia orden como `intentos[]`, para que el admin
// vea EXACTAMENTE a quién se le ofreció, quién rechazó, a quién se le venció el
// tiempo y quién la aceptó — con horas y ronda. LÓGICA PURA (sin Firestore).
//
//   intento = { choferId, choferNombre, ronda, ofrecidoEn, respondidoEn, estado, motivo? }
//   estado ∈ 'ofrecida' | 'aceptada' | 'rechazada' | 'expirada' | 'cancelada'
// ============================================================================

// Tope para que el arreglo no crezca sin límite en órdenes muy rebotadas.
export const INTENTO_MAX = 80

// Registra una NUEVA oferta a un chofer (estado 'ofrecida'). La `ronda` es cuántas
// veces se le ha ofrecido a ESE chofer (1ª, 2ª… si vuelve tras una ronda completa).
export function agregarOferta(intentos, { choferId, choferNombre, ts }) {
  const prev = Array.isArray(intentos) ? intentos : []
  const ronda = prev.filter((i) => i.choferId === choferId).length + 1
  return [...prev, { choferId: choferId || null, choferNombre: choferNombre || '', ronda, ofrecidoEn: ts || null, respondidoEn: null, estado: 'ofrecida' }].slice(-INTENTO_MAX)
}

// Cierra la ÚLTIMA oferta abierta (una orden tiene como máximo UNA oferta viva a la
// vez) con el desenlace: 'aceptada' | 'rechazada' | 'expirada' | 'cancelada'.
export function cerrarOferta(intentos, estado, ts, extra = {}) {
  const prev = Array.isArray(intentos) ? intentos : []
  const out = [...prev]
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].estado === 'ofrecida') {
      out[i] = { ...out[i], estado, respondidoEn: ts || null, ...(extra.motivo ? { motivo: extra.motivo } : {}) }
      break
    }
  }
  return out
}

// Resumen para el panel del admin: intentos, rechazos, expiraciones y quién aceptó.
export function resumenIntentos(intentos) {
  const arr = Array.isArray(intentos) ? intentos : []
  const aceptado = arr.find((i) => i.estado === 'aceptada') || null
  const cerrados = arr.filter((i) => i.respondidoEn && i.ofrecidoEn)
  const primero = arr.find((i) => i.ofrecidoEn)
  const finMs = aceptado?.respondidoEn ? Date.parse(aceptado.respondidoEn) : null
  const iniMs = primero?.ofrecidoEn ? Date.parse(primero.ofrecidoEn) : null
  return {
    total: arr.length,
    rechazados: arr.filter((i) => i.estado === 'rechazada').length,
    expirados: arr.filter((i) => i.estado === 'expirada').length,
    aceptado,
    tiempoTotalMs: (iniMs && finMs && finMs >= iniMs) ? finMs - iniMs : null,
    _cerrados: cerrados.length,
  }
}

export const INTENTO_LABEL = { ofrecida: 'Ofrecida (esperando)', aceptada: 'Aceptó', rechazada: 'Rechazó', expirada: 'Tiempo expirado', cancelada: 'Cancelada' }
export const INTENTO_COLOR = { ofrecida: 'gold', aceptada: 'green', rechazada: 'red', expirada: 'slate', cancelada: 'slate' }
