// ============================================================================
// BULK · Dominio · Niveles de pago y utilidades (lógica pura)
// Cliente paga → Transportista recibe → Chofer recibe. Cada nivel ve solo lo suyo.
// ============================================================================
import { BULK_ROLES } from './constants'
import { camposFinancierosVisibles } from './permisos'

const n = (v) => Number(v) || 0

// Desglose financiero de UNA orden.
//   precioCliente        = lo que se le cobra al cliente
//   precioTransportista  = lo que recibe el transportista
//   pagoChofer           = lo que recibe el chofer
// Utilidad del transportista = precioTransportista − pagoChofer
// Utilidad del dueño (software) = precioCliente − precioTransportista
export function desgloseOrden(orden) {
  const precioCliente = n(orden?.precioCliente)
  const precioTransportista = n(orden?.precioTransportista)
  const pagoChofer = n(orden?.pagoChofer)
  return {
    precioCliente,
    precioTransportista,
    pagoChofer,
    utilidadTransportista: precioTransportista - pagoChofer,
    utilidadDueno: precioCliente - precioTransportista,
  }
}

// Qué campos financieros puede VER cada rol de una orden. Es la base para no
// filtrar información de un nivel a otro (el chofer nunca ve lo que paga el cliente).
export function camposVisiblesPorRol(rol) {
  switch (rol) {
    case BULK_ROLES.SUPER_ADMIN:
    case BULK_ROLES.ADMIN:
      return ['precioCliente', 'precioTransportista', 'pagoChofer', 'utilidadTransportista', 'utilidadDueno']
    case BULK_ROLES.DISPATCHER:
      // opera pero no ve utilidades del dueño
      return ['precioTransportista', 'pagoChofer']
    case BULK_ROLES.CLIENTE:
      return ['precioCliente']
    case BULK_ROLES.TRANSPORTISTA:
      return ['precioTransportista', 'pagoChofer', 'utilidadTransportista']
    case BULK_ROLES.CHOFER:
      return ['pagoChofer']
    default:
      return []
  }
}

// Devuelve el desglose YA filtrado a lo que el usuario puede ver.
//   - Si se pasa un conjunto de PERMISOS (RBAC granular), manda ese conjunto
//     (permite ocultar campos por permiso, no solo por rol).
//   - Si no, cae al mapa por rol (comportamiento histórico, sin regresión).
export function desgloseVisible(orden, rol, permisos) {
  const full = desgloseOrden(orden)
  const permitidos = permisos
    ? new Set(camposFinancierosVisibles(permisos))
    : new Set(camposVisiblesPorRol(rol))
  const out = {}
  for (const k of Object.keys(full)) if (permitidos.has(k)) out[k] = full[k]
  return out
}
