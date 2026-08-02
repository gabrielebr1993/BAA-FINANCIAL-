// ============================================================================
// BULK · Inc.2 — Documentos de PAGO por audiencia (separación de márgenes).
// Cada orden proyecta su precio a 3 documentos con el MISMO id que la orden,
// para que las reglas den a cada rol SOLO su número, sin exponer los márgenes:
//   bulk_orderPay_cliente  { clienteId,       precioCliente }        → staff + cliente
//   bulk_orderPay_carrier  { transportistaId, precioTransportista }  → staff + transportista
//   bulk_orderPay_chofer   { choferId,        pagoChofer }           → staff + chofer
//
// Separamos dos operaciones para no perder nunca el VALOR del precio:
//   · escribirPreciosBase → guarda los importes (al crear la orden, desde tarifa).
//   · asignarPagos        → fija SOLO el dueño (transportistaId/choferId) al asignar,
//                           por merge, sin tocar los importes ya guardados.
// Tras el corte (Fase 3b-ii) los precios YA NO viven en bulk_orders.
// ============================================================================
import { deleteField, doc, updateDoc } from 'firebase/firestore'
import { dbBulk } from '../firebaseBulk'
import { crearConId } from './repo'

// Guarda los IMPORTES de los 3 niveles (al crear la orden). El doc de cliente ya
// lleva clienteId (se conoce al crear); carrier/chofer se marcan al asignar.
export async function escribirPreciosBase(tenantId, orden) {
  if (!orden?.id) return
  const base = { orderId: orden.id, numero: orden.numero || null }
  if (orden.clienteId != null) {
    try { await crearConId('orderPay_cliente', orden.id, tenantId, { ...base, clienteId: orden.clienteId, precioCliente: orden.precioCliente ?? null }) } catch { /* aditivo */ }
  }
  try { await crearConId('orderPay_carrier', orden.id, tenantId, { ...base, precioTransportista: orden.precioTransportista ?? null }) } catch { /* aditivo */ }
  try { await crearConId('orderPay_chofer', orden.id, tenantId, { ...base, pagoChofer: orden.pagoChofer ?? null }) } catch { /* aditivo */ }
}

// Fija el DUEÑO al asignar (merge): no toca los importes ya guardados. Si el
// transportista recalcula el pago del chofer, se pasa en `pagoChofer`.
export async function asignarPagos(tenantId, orderId, { transportistaId, choferId, pagoChofer, numero } = {}) {
  if (!orderId) return
  const base = numero != null ? { orderId, numero } : { orderId }
  if (transportistaId != null) {
    try { await crearConId('orderPay_carrier', orderId, tenantId, { ...base, transportistaId }) } catch { /* reglas */ }
  }
  if (choferId != null) {
    const d = { ...base, choferId, transportistaId: transportistaId ?? null }
    if (pagoChofer != null) d.pagoChofer = pagoChofer
    try { await crearConId('orderPay_chofer', orderId, tenantId, d) } catch { /* reglas */ }
  }
}

// Al reencolar/liberar: quita SOLO al dueño (merge), conservando los importes,
// para que un transportista/chofer ya liberado deje de ver la orden.
export async function liberarPagosAsignacion(tenantId, orderId) {
  if (!orderId) return
  try { await crearConId('orderPay_carrier', orderId, tenantId, { transportistaId: null }) } catch { /* noop */ }
  try { await crearConId('orderPay_chofer', orderId, tenantId, { choferId: null }) } catch { /* noop */ }
}

// Corte 3b-ii: borra los campos de precio de la ORDEN (ya viven en los docs de pago).
export async function quitarPreciosDeOrden(orderId) {
  if (!orderId) return
  await updateDoc(doc(dbBulk, 'bulk_orders', orderId), {
    precioCliente: deleteField(), precioTransportista: deleteField(), pagoChofer: deleteField(),
  })
}
