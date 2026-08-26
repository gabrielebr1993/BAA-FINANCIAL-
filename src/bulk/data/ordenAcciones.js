// BULK · Acciones sobre órdenes: CANCELAR (conserva en historial) y ELIMINAR
// (borrado permanente, solo admin/owner, bloqueado si está facturada).
import { guardar, eliminar, crearConId } from './repo'
import { auditar } from './auditoria'
import { liberar } from './presencia'
import { enviarPush } from '../integraciones/notificaciones'
import { ORDEN_ESTADO as E } from '../domain/constants'

const iso = () => new Date().toISOString()

// Motivos comunes para el desplegable de cancelación.
export const MOTIVOS_CANCELACION = ['Cliente canceló', 'Error de captura', 'Sin chofer', 'Duplicada', 'Otro']

// Estados en los que una orden aún puede cancelarse (no ya finalizada/cancelada).
const NO_CANCELABLES = [E.ENTREGADA, E.LIBERADA, E.CERRADA, E.CANCELADA]
export const puedeCancelar = (orden) => !!orden && !NO_CANCELABLES.includes(orden.estado)

// ¿La orden está en alguna factura? (bloquea la eliminación para no romper contabilidad).
export function ordenFacturada(orden, facturas) {
  if (!orden) return false
  return (facturas || []).some((f) => (f.lineas || []).some((l) => l.orderId === orden.id))
}

// CANCELAR: marca 'cancelada' pero conserva la orden. Libera y notifica al chofer si tenía.
export async function cancelarOrden(orden, { tenantId, usuario, rol, motivo }) {
  // Al cancelar NO se cobra al cliente ni se paga a transporte/chofer: los
  // montos quedan en CERO (los previos se guardan en `anulado` para el rastro).
  // Los reportes ya excluyen canceladas por estado; esto lo hace explícito.
  const anulado = {
    precioCliente: orden.precioCliente ?? null,
    precioTransportista: orden.precioTransportista ?? null,
    pagoChofer: orden.pagoChofer ?? null,
    ts: iso(),
  }
  // En la ORDEN los precios van en null (las reglas prohíben valores de precio en
  // el doc de la orden tras la migración: null = sin cobro/pago). Los ceros
  // explícitos quedan en los docs de pago por audiencia.
  await guardar('orders', orden.id, {
    estado: E.CANCELADA,
    cancelacion: { por: usuario?.nombre || usuario?.email || '', motivo: motivo || 'Sin motivo', ts: iso() },
    asignacionExpira: null,
    precioCliente: null, precioTransportista: null, pagoChofer: null,
    anulado,
  })
  // Docs de pago por audiencia: mismos ceros (si existen; aditivo y tolerante).
  try { await crearConId('orderPay_cliente', orden.id, tenantId, { precioCliente: 0, anulado }) } catch { /* sin doc/permiso */ }
  try { await crearConId('orderPay_carrier', orden.id, tenantId, { precioTransportista: 0, anulado }) } catch { /* sin doc/permiso */ }
  try { await crearConId('orderPay_chofer', orden.id, tenantId, { pagoChofer: 0, anulado }) } catch { /* sin doc/permiso */ }
  if (orden.choferId) {
    await liberar(orden.choferId) // vuelve a "en línea"
    enviarPush(tenantId, `chofer:${orden.choferId}`, 'Orden cancelada', `La orden ${orden.numero} fue cancelada.`)
  }
  await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'cancelar_orden', entidad: 'orden', entidadId: orden.id, detalle: `${orden.numero} · ${motivo || 'Sin motivo'}` })
}

// ELIMINAR: borrado permanente. Lanza 'FACTURADA' si está en una factura. Deja rastro
// en auditoría ANTES de borrar (con los datos clave), para trazabilidad.
export async function eliminarOrden(orden, { tenantId, usuario, rol, facturas }) {
  if (ordenFacturada(orden, facturas)) { const e = new Error('FACTURADA'); e.code = 'FACTURADA'; throw e }
  await auditar(tenantId, {
    usuario: usuario?.email, rol, accion: 'eliminar_orden', entidad: 'orden', entidadId: orden.id,
    detalle: `${orden.numero} · ${orden.material || ''} · ${orden.pesoEstimado} ton · estado ${orden.estado}`,
    cambios: { numero: orden.numero, estado: orden.estado, clienteId: orden.clienteId || null, transportistaId: orden.transportistaId || null, choferId: orden.choferId || null, precioCliente: orden.precioCliente ?? null },
  })
  if (orden.choferId) {
    await liberar(orden.choferId)
    enviarPush(tenantId, `chofer:${orden.choferId}`, 'Orden eliminada', `La orden ${orden.numero} fue eliminada.`)
  }
  await eliminar('orders', orden.id)
}
