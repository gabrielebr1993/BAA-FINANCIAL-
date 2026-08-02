// ============================================================================
// BULK · Inc.2 — Documentos de PAGO por audiencia (separación de márgenes).
// Cada orden proyecta su precio a 3 documentos con el MISMO id que la orden,
// para que las reglas de Firestore den a cada rol SOLO su número, sin exponer
// los márgenes ajenos (que hoy viven todos en el doc de la orden):
//   bulk_orderPay_cliente  { clienteId,       precioCliente }        → staff + cliente
//   bulk_orderPay_carrier  { transportistaId, precioTransportista }  → staff + transportista
//   bulk_orderPay_chofer   { choferId,        pagoChofer }           → staff + chofer
//
// FASE 1 (aditiva): se escriben ADEMÁS de los campos en bulk_orders, así nada
// se rompe. Todo va envuelto en try/catch: si fallara, el flujo principal sigue.
// Fase 2 cambiará las lecturas; Fase 3 quitará los precios de bulk_orders.
// ============================================================================
import { crearConId, eliminar } from './repo'

// Proyecta el precio del CLIENTE (lo que se le cobra). Se conoce al crear la orden.
export async function sincronizarPagoCliente(tenantId, orden) {
  if (!orden?.id || orden.clienteId == null) return
  try {
    await crearConId('orderPay_cliente', orden.id, tenantId, {
      orderId: orden.id, numero: orden.numero || null,
      clienteId: orden.clienteId, precioCliente: orden.precioCliente ?? null,
    })
  } catch { /* aditivo: nunca romper el flujo */ }
}

// Proyecta los pagos de TRANSPORTISTA y CHOFER (se conocen al asignar). Cada
// escritura va en su propio try/catch: el pago del transportista (precioTransportista)
// solo lo escribe el staff (las reglas lo bloquean para el transportista, que NO
// puede inflar lo que se le paga); el pago del chofer sí lo fija su transportista.
export async function sincronizarPagoAsignacion(tenantId, orden) {
  if (!orden?.id) return
  if (orden.transportistaId != null) {
    try {
      await crearConId('orderPay_carrier', orden.id, tenantId, {
        orderId: orden.id, numero: orden.numero || null,
        transportistaId: orden.transportistaId, precioTransportista: orden.precioTransportista ?? null,
      })
    } catch { /* el transportista no puede escribir este doc: ok */ }
  }
  if (orden.choferId != null) {
    try {
      await crearConId('orderPay_chofer', orden.id, tenantId, {
        orderId: orden.id, numero: orden.numero || null,
        choferId: orden.choferId, transportistaId: orden.transportistaId ?? null,
        pagoChofer: orden.pagoChofer ?? null,
      })
    } catch { /* aditivo */ }
  }
}

// Al reencolar/cancelar una asignación: quita los docs de pago de carrier/chofer
// para que un transportista/chofer ya liberado no siga viendo esa orden.
export async function limpiarPagoAsignacion(orden) {
  if (!orden?.id) return
  try { await eliminar('orderPay_carrier', orden.id) } catch { /* noop */ }
  try { await eliminar('orderPay_chofer', orden.id) } catch { /* noop */ }
}
