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

export function conversacionesAdmin({ mensajes = [], ordenes = [], carriers = [], clientes = [], jobs = [], uid } = {}) {
  const resumen = resumenPorConversacion(mensajes, uid)
  const ordenPorId = Object.fromEntries(ordenes.map((o) => [o.id, o]))
  const carrierPorId = Object.fromEntries(carriers.map((c) => [c.id, c]))
  const clientePorId = Object.fromEntries(clientes.map((c) => [c.id, c]))
  const jobPorId = Object.fromEntries(jobs.map((j) => [j.id, j]))
  // Foto e info del conductor por slug de su nombre (clave del dm_d_ y del choferNombre).
  const choferPorSlug = {}
  for (const c of carriers) for (const d of (c.choferes || [])) {
    if (d?.nombre) choferPorSlug[slugChofer(d.nombre)] = { nombre: d.nombre, carrierNombre: c.nombre, foto: d.foto || null }
  }
  const operacionDe = (o) => (o?.jobId && jobPorId[o.jobId]?.nombre) || ''

  const out = { clientes: [], transportistas: [], conductores: [], operaciones: [] }

  for (const key of Object.keys(resumen)) {
    const r = resumen[key]
    const base = { key, chatId: key, lastText: r.lastText, lastTs: r.lastTs, noLeidos: r.noLeidos }

    if (esConvClienteOrden(key)) {
      const o = ordenPorId[orderIdDeConv(key)] || {}
      const cliNombre = o.clienteNombre || nombreDe(clientePorId, o.clienteId) || 'Cliente'
      out.clientes.push({ ...base, icon: 'cliente', titulo: cliNombre, rolLabel: 'Cliente', rolColor: 'green', viaje: o.numero || '', material: o.material || '', carga: o.tipoEquipo || '', operacion: operacionDe(o), participantes: [o.clienteId].filter(Boolean) })
      continue
    }
    if (key.startsWith('dm_c_')) {
      const c = carrierPorId[key.slice(5)]
      out.transportistas.push({ ...base, icon: 'transportista', titulo: c?.nombre || 'Transportista', rolLabel: 'Transportista', rolColor: 'gold' })
      continue
    }
    if (key.startsWith('dm_d_')) {
      const info = choferPorSlug[key.slice(5)]
      out.conductores.push({ ...base, icon: 'chofer', foto: info?.foto || null, titulo: info?.nombre || 'Conductor', rolLabel: 'Conductor', rolColor: 'navy', carrierNombre: info?.carrierNombre || '' })
      continue
    }
    // Chat OPERATIVO de una orden (viaje/material/orden) → sección OPERACIONES.
    const o = ordenPorId[key]
    if (!o) continue
    const info = choferPorSlug[slugChofer(o.choferNombre || '')]
    out.operaciones.push({
      ...base, icon: 'operacion', foto: info?.foto || null,
      titulo: o.choferNombre || o.numero || 'Operación', rolLabel: 'Operación', rolColor: 'blue',
      viaje: o.numero || '', material: o.material || '', carga: o.tipoEquipo || '', operacion: operacionDe(o),
      carrierNombre: nombreDe(carrierPorId, o.transportistaId) || '',
      participantes: [o.choferId, o.transportistaId, o.clienteId].filter(Boolean),
    })
  }
  return out
}
