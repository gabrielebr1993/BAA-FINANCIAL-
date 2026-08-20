// BULK · Dominio · Categorización de conversaciones para el panel del ADMIN.
// Lógica PURA: a partir de los mensajes + órdenes + transportistas + clientes,
// clasifica cada conversación en CLIENTES · TRANSPORTISTAS · CONDUCTORES y arma
// las filas ricas (nombre, viaje, material, transporte, último mensaje, no leídos).
// No consulta Firebase ni conoce React.
import { resumenPorConversacion, esConvClienteOrden, orderIdDeConv, slugChofer } from '../data/chatKeys'

const nombreDe = (m, id, campo = 'nombre') => (m[id] ? (m[id][campo] || '') : '')

// mensajes, ordenes, carriers, clientes: arrays. uid: usuario actual.
// Devuelve { clientes, transportistas, choferes } — cada uno lista de filas.
export function conversacionesAdmin({ mensajes = [], ordenes = [], carriers = [], clientes = [], uid } = {}) {
  const resumen = resumenPorConversacion(mensajes, uid)
  const ordenPorId = Object.fromEntries(ordenes.map((o) => [o.id, o]))
  const carrierPorId = Object.fromEntries(carriers.map((c) => [c.id, c]))
  const clientePorId = Object.fromEntries(clientes.map((c) => [c.id, c]))
  // Choferes de toda la plantilla, indexados por slug de su nombre (clave del dm_d_).
  const choferPorSlug = {}
  for (const c of carriers) for (const d of (c.choferes || [])) {
    if (d?.nombre) choferPorSlug[slugChofer(d.nombre)] = { nombre: d.nombre, carrierNombre: c.nombre }
  }

  const out = { clientes: [], transportistas: [], choferes: [] }

  for (const key of Object.keys(resumen)) {
    const r = resumen[key]
    const base = { key, chatId: key, lastText: r.lastText, lastTs: r.lastTs, noLeidos: r.noLeidos }

    if (esConvClienteOrden(key)) {
      // Canal cliente ↔ oficina, por viaje.
      const oid = orderIdDeConv(key)
      const o = ordenPorId[oid] || {}
      const cliNombre = o.clienteNombre || nombreDe(clientePorId, o.clienteId) || 'Cliente'
      out.clientes.push({ ...base, icon: 'cliente', titulo: cliNombre, rolLabel: 'Cliente', rolColor: 'green', viaje: o.numero || '', material: o.material || '', participantes: [o.clienteId].filter(Boolean) })
      continue
    }
    if (key.startsWith('dm_c_')) {
      const cid = key.slice(5)
      const c = carrierPorId[cid]
      out.transportistas.push({ ...base, icon: 'transportista', titulo: c?.nombre || 'Transportista', rolLabel: 'Transportista', rolColor: 'gold' })
      continue
    }
    if (key.startsWith('dm_d_')) {
      const info = choferPorSlug[key.slice(5)]
      out.choferes.push({ ...base, icon: 'chofer', titulo: info?.nombre || 'Chofer', rolLabel: 'Chofer', rolColor: 'navy', carrierNombre: info?.carrierNombre || '' })
      continue
    }
    // Chat OPERATIVO de una orden (chofer + transporte + oficina). Va a CONDUCTORES,
    // con todo el contexto del viaje visible sin abrir el chat.
    const o = ordenPorId[key]
    if (!o) continue
    out.choferes.push({
      ...base, icon: 'chofer',
      titulo: o.choferNombre || 'Sin chofer', rolLabel: 'Chofer', rolColor: 'navy',
      viaje: o.numero || '', material: o.material || '',
      carrierNombre: nombreDe(carrierPorId, o.transportistaId) || '',
      participantes: [o.choferId, o.transportistaId, o.clienteId].filter(Boolean),
    })
  }
  return out
}
