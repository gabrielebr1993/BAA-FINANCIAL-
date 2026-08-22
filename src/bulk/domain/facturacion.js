// ============================================================================
// BULK · Dominio · Facturación y vencimiento de documentos (lógica pura).
// ============================================================================
import { ORDEN_ESTADO as E } from './constants'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fEntrega = (o) => (o?.hitos?.entrega ? new Date(o.hitos.entrega) : null)

// Arma una factura con las órdenes ENTREGADAS del periodo [desde, hasta] (YYYY-MM-DD).
export function armarFactura(ordenes, { desde, hasta } = {}) {
  const dd = desde ? new Date(desde + 'T00:00:00') : null
  const hh = hasta ? new Date(hasta + 'T23:59:59') : null
  const lineas = (ordenes || [])
    .filter((o) => ENTREGADAS.includes(o.estado))
    .filter((o) => { const f = fEntrega(o); if (dd && (!f || f < dd)) return false; if (hh && (!f || f > hh)) return false; return true })
    .map((o) => ({
      orderId: o.id, numero: o.numero, material: o.material || '',
      ton: r2(o.pesoReal ?? o.pesoEstimado), precio: r2(o.precioCliente),
      fecha: fEntrega(o) ? fEntrega(o).toISOString() : null,
      jobId: o.jobId || null, plantaId: o.plantaId || null, tipoEquipo: o.tipoEquipo || '',
    }))
    .sort((a, b) => (a.numero || '').localeCompare(b.numero || ''))
  const subtotal = r2(lineas.reduce((a, l) => a + l.precio, 0))
  const toneladas = r2(lineas.reduce((a, l) => a + l.ton, 0))
  return { lineas, subtotal, total: subtotal, toneladas, n: lineas.length }
}

// Arma el AVISO DE PAGO a un transportista: sus órdenes ENTREGADAS del periodo,
// sumando lo que se le paga a él (precioTransportista) por cada carga.
export function armarAvisoPago(ordenes, { desde, hasta } = {}) {
  const dd = desde ? new Date(desde + 'T00:00:00') : null
  const hh = hasta ? new Date(hasta + 'T23:59:59') : null
  const lineas = (ordenes || [])
    .filter((o) => ENTREGADAS.includes(o.estado))
    .filter((o) => { const f = fEntrega(o); if (dd && (!f || f < dd)) return false; if (hh && (!f || f > hh)) return false; return true })
    .map((o) => ({
      orderId: o.id, numero: o.numero, material: o.material || '',
      ton: r2(o.pesoReal ?? o.pesoEstimado), precio: r2(o.precioTransportista),
      fecha: fEntrega(o) ? fEntrega(o).toISOString() : null,
      jobId: o.jobId || null, plantaId: o.plantaId || null, tipoEquipo: o.tipoEquipo || '',
    }))
    .sort((a, b) => (a.numero || '').localeCompare(b.numero || ''))
  const subtotal = r2(lineas.reduce((a, l) => a + l.precio, 0))
  const toneladas = r2(lineas.reduce((a, l) => a + l.ton, 0))
  return { lineas, subtotal, total: subtotal, toneladas, n: lineas.length }
}

// Días para vencer (negativo = vencido). null si no hay fecha.
export function diasParaVencer(fechaISO) {
  if (!fechaISO) return null
  const d = new Date(fechaISO + (fechaISO.length <= 10 ? 'T00:00:00' : ''))
  return Math.ceil((d - new Date()) / 86400000)
}

// Estado de un documento según su vencimiento.
export function estadoDocumento(fechaISO, avisoDias = 30) {
  const dias = diasParaVencer(fechaISO)
  if (dias == null) return { estado: 'sin_fecha', dias }
  if (dias < 0) return { estado: 'vencido', dias }
  if (dias <= avisoDias) return { estado: 'proximo', dias }
  return { estado: 'ok', dias }
}

// Tiempo promedio de entrega (minutos) desde que el chofer toma la orden hasta la
// entrega, sobre las órdenes que tienen ambos hitos.
export function tiempoPromedioEntregaMin(ordenes) {
  const difs = (ordenes || [])
    .map((o) => (o?.hitos?.tomada && o?.hitos?.entrega) ? (new Date(o.hitos.entrega) - new Date(o.hitos.tomada)) / 60000 : null)
    .filter((v) => v != null && v >= 0)
  if (!difs.length) return 0
  return Math.round(difs.reduce((a, b) => a + b, 0) / difs.length)
}
