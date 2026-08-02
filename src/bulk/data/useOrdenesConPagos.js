// ============================================================================
// BULK · Inc.2 — Hook para el STAFF: órdenes enriquecidas con sus precios desde
// los documentos de pago por audiencia (bulk_orderPay_cliente/carrier/chofer).
// El staff puede leer las tres colecciones, así que las une aquí y devuelve las
// órdenes con precioCliente/precioTransportista/pagoChofer resueltos.
//
// Fallback al campo de la propia orden mientras exista (Fase 2/3a); tras el corte
// (Fase 3b-ii) los precios ya solo viven en los docs de pago.
// ============================================================================
import { useMemo } from 'react'
import { useColeccion } from './useColeccion'

export function useOrdenesConPagos(filtros = []) {
  const { datos: ordenes, cargando } = useColeccion('orders', filtros)
  const { datos: pagosCliente } = useColeccion('orderPay_cliente')
  const { datos: pagosCarrier } = useColeccion('orderPay_carrier')
  const { datos: pagosChofer } = useColeccion('orderPay_chofer')

  const datos = useMemo(() => {
    const mc = {}, mt = {}, md = {}
    for (const p of pagosCliente || []) mc[p.orderId || p.id] = p.precioCliente
    for (const p of pagosCarrier || []) mt[p.orderId || p.id] = p.precioTransportista
    for (const p of pagosChofer || []) md[p.orderId || p.id] = p.pagoChofer
    return (ordenes || []).map((o) => ({
      ...o,
      precioCliente: mc[o.id] != null ? mc[o.id] : o.precioCliente,
      precioTransportista: mt[o.id] != null ? mt[o.id] : o.precioTransportista,
      pagoChofer: md[o.id] != null ? md[o.id] : o.pagoChofer,
    }))
  }, [ordenes, pagosCliente, pagosCarrier, pagosChofer])

  return { datos, cargando }
}
