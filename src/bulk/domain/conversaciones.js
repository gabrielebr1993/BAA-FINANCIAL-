// BULK · Dominio · Categorización de conversaciones para el panel del ADMIN.
// Lógica PURA: a partir de los mensajes + órdenes + transportistas + clientes +
// trabajos(jobs), clasifica cada conversación en 4 secciones:
//   CLIENTES · TRANSPORTISTAS · CONDUCTORES · OPERACIONES
// y arma las filas ricas (foto real cuando existe, nombre, rol, material, carga,
// viaje, operación, último mensaje, no leídos). No consulta Firebase ni usa React.
//
// Datos reales usados (no se inventa nada):
//   - foto del conductor: carrier.choferes[].foto (roster) — único rol con foto.
//   - viaje = order.numero · material = order.material · carga = order.tipoEquipo
//   - operación = job.nombre (por order.jobId)
import { resumenPorConversacion, esConvClienteOrden, orderIdDeConv, slugChofer } from '../data/chatKeys'

const nombreDe = (m, id, campo = 'nombre') => (m[id] ? (m[id][campo] || '') : '')

export function conversacionesAdmin({ mensajes = [], ordenes = [], carriers = [], clientes = [], jobs = [], usuarios = [], avatares = {}, uid } = {}) {
  const resumen = resumenPorConversacion(mensajes, uid)
  const ordenPorId = Object.fromEntries(ordenes.map((o) => [o.id, o]))
  const carrierPorId = Object.fromEntries(carriers.map((c) => [c.id, c]))
  const clientePorId = Object.fromEntries(clientes.map((c) => [c.id, c]))
  const jobPorId = Object.fromEntries(jobs.map((j) => [j.id, j]))
  // Cuenta de usuario (uid) por empresa cliente / transportista → para su foto (avatar).
  const uidPorCliente = {}, uidPorCarrier = {}
  for (const u of usuarios) {
    if (u.rol === 'cliente' && u.clienteId && !uidPorCliente[u.clienteId]) uidPorCliente[u.clienteId] = u.id
    if (u.rol === 'transportista' && u.carrierId && !uidPorCarrier[u.carrierId]) uidPorCarrier[u.carrierId] = u.id
  }
  const fotoCliente = (clienteId) => avatares[uidPorCliente[clienteId]] || null
  const fotoCarrier = (carrierId) => avatares[uidPorCarrier[carrierId]] || null
  // Foto e info del conductor por slug de su nombre (clave del dm_d_ y del choferNombre).
  // Foto = la del roster o, si no, la del avatar de su cuenta (bulk_avatars por uid).
  const choferPorSlug = {}
  for (const c of carriers) for (const d of (c.choferes || [])) {
    if (d?.nombre) choferPorSlug[slugChofer(d.nombre)] = { nombre: d.nombre, carrierNombre: c.nombre, foto: d.foto || (d.uid && avatares[d.uid]) || null }
  }
  const operacionDe = (o) => (o?.jobId && jobPorId[o.jobId]?.nombre) || ''
  const usuarioPorId = Object.fromEntries((usuarios || []).map((u) => [u.id, u]))

  const out = { clientes: [], transportistas: [], conductores: [], operaciones: [] }

  for (const key of Object.keys(resumen)) {
    const r = resumen[key]
    const base = { key, chatId: key, lastText: r.lastText, lastTs: r.lastTs, noLeidos: r.noLeidos }

    if (esConvClienteOrden(key)) {
      const o = ordenPorId[orderIdDeConv(key)] || {}
      const cliNombre = o.clienteNombre || nombreDe(clientePorId, o.clienteId) || 'Cliente'
      out.clientes.push({ ...base, icon: 'cliente', foto: fotoCliente(o.clienteId), titulo: cliNombre, rolLabel: 'Cliente', rolColor: 'green', viaje: o.numero || '', material: o.material || '', carga: o.tipoEquipo || '', operacion: operacionDe(o), participantes: [o.clienteId].filter(Boolean) })
      continue
    }
    if (key.startsWith('dm_c_')) {
      const cid = key.slice(5)
      const c = carrierPorId[cid]
      out.transportistas.push({ ...base, icon: 'transportista', foto: fotoCarrier(cid), titulo: c?.nombre || 'Transportista', rolLabel: 'Transportista', rolColor: 'gold' })
      continue
    }
    if (key.startsWith('dm_d_')) {
      const info = choferPorSlug[key.slice(5)]
      out.conductores.push({ ...base, icon: 'chofer', foto: info?.foto || null, titulo: info?.nombre || 'Conductor', rolLabel: 'Conductor', rolColor: 'navy', carrierNombre: info?.carrierNombre || '' })
      continue
    }
    // Chat INTERNO del staff (operaciones) → sección OPERACIONES.
    if (key.startsWith('st_')) {
      const uids = key.slice(3).split('__')
      const otroId = uids.find((u) => u !== uid) || uids[0]
      const u = usuarioPorId[otroId]
      out.operaciones.push({ ...base, icon: 'operacion', foto: avatares[otroId] || null, titulo: u?.nombre || r.lastAutor || 'Staff', rolLabel: 'Staff', rolColor: 'slate', participantes: uids })
      continue
    }
    // Chat OPERATIVO de una orden (viaje/material/carga) → sección CONDUCTORES, porque
    // es el chat CON EL CONDUCTOR sobre su carga/viaje. Muestra el ESTADO de la orden
    // (aceptada / en proceso / liberada) según cómo esté al momento del chat.
    const o = ordenPorId[key]
    if (o) {
      const info = choferPorSlug[slugChofer(o.choferNombre || '')]
      const est = estadoBadge(o.estado)
      out.conductores.push({
        ...base, icon: 'chofer', foto: info?.foto || null,
        titulo: o.choferNombre || o.numero || 'Conductor',
        rolLabel: est.label, rolColor: est.color,
        viaje: o.numero || '', material: o.material || '', carga: o.tipoEquipo || '', operacion: operacionDe(o),
        carrierNombre: nombreDe(carrierPorId, o.transportistaId) || '',
        participantes: [o.choferId, o.transportistaId, o.clienteId].filter(Boolean),
      })
      continue
    }
    // Cualquier otra conversación (interna / de oficina, sin conductor/cliente/transporte)
    // → sección OPERACIONES: solo chats del equipo del staff.
    out.operaciones.push({ ...base, icon: 'operacion', titulo: r.lastAutor || 'Equipo', rolLabel: 'Staff', rolColor: 'slate' })
  }
  return out
}

// Estado simplificado de la orden para el badge del chat del conductor.
function estadoBadge(estado) {
  if (estado === 'aceptada') return { label: 'Aceptada', color: 'gold' }
  if (['en_planta', 'cargando', 'en_ruta', 'en_destino', 'entregada'].includes(estado)) return { label: 'En proceso', color: 'blue' }
  if (['liberada', 'cerrada'].includes(estado)) return { label: 'Liberada', color: 'green' }
  if (estado === 'rechazada') return { label: 'Rechazada', color: 'slate' }
  if (estado === 'cancelada') return { label: 'Cancelada', color: 'slate' }
  return { label: 'Pendiente', color: 'slate' }
}
