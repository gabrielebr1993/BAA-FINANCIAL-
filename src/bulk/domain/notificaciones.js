// ============================================================================
// BULK · Dominio · Centro de notificaciones (lógica pura, testeable).
// Deriva notificaciones ACCIONABLES del estado en vivo (no requiere escribir nada):
// órdenes fuera de SLA / en riesgo, facturas disputadas, incidencias abiertas y
// documentos por vencer. Cada una trae severidad, texto y enlace.
// ============================================================================
import { alertaOrden, LIMITE_ALERTA_MS, LIMITE_RIESGO_MS } from './alertas'
import { estadoDocumento } from './facturacion'

const PESO_SEV = { critico: 0, warn: 1, info: 2 }

export function construirNotificaciones({ ordenes = [], facturas = [], incidencias = [], documentos = [], ahoraMs }) {
  const out = []
  for (const o of ordenes) {
    const sla = alertaOrden(o, ahoraMs, LIMITE_ALERTA_MS)
    if (sla) {
      out.push({ id: `sla:${o.id}`, sev: 'critico', tipo: 'sla', titulo: `Orden ${o.numero} fuera de SLA`, detalle: sla.tipo === 'recogida' ? `Sin recoger · ${sla.horas}h` : `Sin entregar · ${sla.horas}h`, link: `/bulk/ordenes/${o.id}` })
      continue
    }
    const r = alertaOrden(o, ahoraMs, LIMITE_RIESGO_MS)
    if (r) out.push({ id: `riesgo:${o.id}`, sev: 'warn', tipo: 'riesgo', titulo: `Orden ${o.numero} en riesgo`, detalle: r.tipo === 'recogida' ? 'Sin recoger (2–3 h)' : 'Sin entregar (2–3 h)', link: `/bulk/ordenes/${o.id}` })
  }
  for (const f of facturas) {
    if (f.estado === 'rechazada') out.push({ id: `disputa:${f.id}`, sev: 'warn', tipo: 'factura', titulo: `Factura ${f.numero} disputada`, detalle: f.motivoRechazo || '', link: '/bulk/facturacion' })
  }
  for (const i of incidencias) {
    if (i.estado !== 'resuelta') out.push({ id: `inc:${i.id}`, sev: 'warn', tipo: 'incidencia', titulo: i.titulo || 'Incidencia abierta', detalle: i.descripcion || '', link: '/bulk/incidencias' })
  }
  for (const d of documentos) {
    const e = estadoDocumento(d.vence)
    if (e.estado === 'vencido' || e.estado === 'proximo') {
      out.push({ id: `doc:${d.id}`, sev: e.estado === 'vencido' ? 'critico' : 'info', tipo: 'documento', titulo: `Documento ${e.estado === 'vencido' ? 'vencido' : 'por vencer'}`, detalle: d.nombre || d.tipo || '', link: '/bulk/documentos' })
    }
  }
  return out.sort((a, b) => (PESO_SEV[a.sev] - PESO_SEV[b.sev]))
}
