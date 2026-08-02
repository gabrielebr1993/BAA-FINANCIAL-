// ============================================================================
// BULK · Dominio · Centro de notificaciones (lógica pura, testeable).
// Deriva notificaciones ACCIONABLES del estado en vivo (no requiere escribir nada):
// órdenes fuera de SLA / en riesgo, facturas disputadas, incidencias abiertas y
// documentos por vencer. Cada una trae severidad, texto y enlace.
// ============================================================================
import { alertaOrden, LIMITE_ALERTA_MS, LIMITE_RIESGO_MS } from './alertas'
import { estadoDocumento } from './facturacion'

const PESO_SEV = { critico: 0, warn: 1, info: 2 }

// Cada notificación incluye una ACCIÓN recomendada (§14): contexto + qué hacer.
export function construirNotificaciones({ ordenes = [], facturas = [], incidencias = [], documentos = [], mensajesNuevos = 0, ahoraMs }) {
  const out = []
  if (mensajesNuevos > 0) {
    out.push({ id: 'mensajes', sev: 'info', tipo: 'mensaje', titulo: `${mensajesNuevos} mensaje(s) sin leer`, detalle: '', accion: 'Abre el chat y responde', link: '/bulk/mensajes' })
  }
  for (const o of ordenes) {
    const sla = alertaOrden(o, ahoraMs, LIMITE_ALERTA_MS)
    if (sla) {
      out.push({ id: `sla:${o.id}`, sev: 'critico', tipo: 'sla', titulo: `Orden ${o.numero} fuera de SLA`, detalle: sla.tipo === 'recogida' ? `Sin recoger · ${sla.horas}h` : `Sin entregar · ${sla.horas}h`, accion: sla.tipo === 'recogida' ? 'Contacta al chofer o reasigna' : 'Confirma el avance de la entrega', link: `/bulk/ordenes/${o.id}` })
      continue
    }
    const r = alertaOrden(o, ahoraMs, LIMITE_RIESGO_MS)
    if (r) out.push({ id: `riesgo:${o.id}`, sev: 'warn', tipo: 'riesgo', titulo: `Orden ${o.numero} en riesgo`, detalle: r.tipo === 'recogida' ? 'Sin recoger (2–3 h)' : 'Sin entregar (2–3 h)', accion: 'Confirma avance con el chofer antes de las 3 h', link: `/bulk/ordenes/${o.id}` })
  }
  for (const f of facturas) {
    if (f.estado === 'rechazada') out.push({ id: `disputa:${f.id}`, sev: 'warn', tipo: 'factura', titulo: `Factura ${f.numero} disputada`, detalle: f.motivoRechazo || '', accion: 'Revisa la disputa y corrige o responde', link: '/bulk/facturacion' })
  }
  for (const i of incidencias) {
    if (i.estado !== 'resuelta') out.push({ id: `inc:${i.id}`, sev: 'warn', tipo: 'incidencia', titulo: i.titulo || 'Incidencia abierta', detalle: i.descripcion || '', accion: 'Atiende y marca como resuelta', link: '/bulk/incidencias' })
  }
  for (const d of documentos) {
    const e = estadoDocumento(d.vence)
    if (e.estado === 'vencido' || e.estado === 'proximo') {
      out.push({ id: `doc:${d.id}`, sev: e.estado === 'vencido' ? 'critico' : 'info', tipo: 'documento', titulo: `Documento ${e.estado === 'vencido' ? 'vencido' : 'por vencer'}`, detalle: d.nombre || d.tipo || '', accion: e.estado === 'vencido' ? 'Solicita el documento actualizado' : 'Recuérdalo antes de que venza', link: '/bulk/documentos' })
    }
  }
  return out.sort((a, b) => (PESO_SEV[a.sev] - PESO_SEV[b.sev]))
}

// TRANSPORTISTA: sus órdenes en riesgo/SLA (por asignar o en curso) + sus avisos de
// pago + mensajes. No ve nada de otros roles.
export function notificacionesTransportista({ ordenes = [], statements = [], mensajesNuevos = 0, ahoraMs }) {
  const out = []
  if (mensajesNuevos > 0) out.push({ id: 'mensajes', sev: 'info', tipo: 'mensaje', titulo: `${mensajesNuevos} mensaje(s) sin leer`, accion: 'Abre el chat y responde', link: '/bulk' })
  for (const o of ordenes) {
    const sla = alertaOrden(o, ahoraMs, LIMITE_ALERTA_MS)
    if (sla) { out.push({ id: `sla:${o.id}`, sev: 'critico', tipo: 'sla', titulo: `Orden ${o.numero} fuera de SLA`, detalle: sla.tipo === 'recogida' ? `Sin recoger · ${sla.horas}h` : `Sin entregar · ${sla.horas}h`, accion: 'Asigna o contacta a tu chofer', link: '/bulk' }); continue }
    const r = alertaOrden(o, ahoraMs, LIMITE_RIESGO_MS)
    if (r) out.push({ id: `riesgo:${o.id}`, sev: 'warn', tipo: 'riesgo', titulo: `Orden ${o.numero} en riesgo`, accion: 'Confirma avance con tu chofer', link: '/bulk' })
  }
  for (const s of statements) {
    if (s.estado === 'pagado') out.push({ id: `pago:${s.id}`, sev: 'info', tipo: 'pago', titulo: `Pago ${s.numero} realizado`, detalle: '', accion: 'Revisa tu comprobante', link: '/bulk' })
    else out.push({ id: `pagopend:${s.id}`, sev: 'info', tipo: 'pago', titulo: `Aviso de pago ${s.numero}`, detalle: s.fechaPago ? `Te pagan el ${s.fechaPago}` : '', accion: 'Revisa el detalle', link: '/bulk' })
  }
  return out.sort((a, b) => (PESO_SEV[a.sev] - PESO_SEV[b.sev]))
}

// CLIENTE: sus facturas (por firmar / disputadas) + mensajes. No ve costos internos.
export function notificacionesCliente({ facturas = [], mensajesNuevos = 0 }) {
  const out = []
  if (mensajesNuevos > 0) out.push({ id: 'mensajes', sev: 'info', tipo: 'mensaje', titulo: `${mensajesNuevos} mensaje(s) sin leer`, accion: 'Abre el chat y responde', link: '/bulk' })
  for (const f of facturas) {
    if (f.estado === 'enviada') out.push({ id: `firmar:${f.id}`, sev: 'warn', tipo: 'factura', titulo: `Factura ${f.numero} por revisar`, detalle: '', accion: 'Revísala y fírmala o disputa', link: '/bulk' })
    else if (f.estado === 'rechazada') out.push({ id: `disputa:${f.id}`, sev: 'info', tipo: 'factura', titulo: `Factura ${f.numero} en disputa`, detalle: f.motivoRechazo || '', accion: 'En revisión por la oficina', link: '/bulk' })
  }
  return out.sort((a, b) => (PESO_SEV[a.sev] - PESO_SEV[b.sev]))
}
