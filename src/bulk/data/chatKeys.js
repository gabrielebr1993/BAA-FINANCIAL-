// BULK · Claves y utilidades PURAS de mensajería (sin dependencias de Firebase).
// Se separa de chat.js para poder testearlo en Node y reutilizarlo sin arrastrar
// el SDK. chat.js re-exporta todo esto.

// ── Conversaciones DIRECTAS (no ligadas a una orden) ────────────────────────
// `orderId` sintético:
//   dm_c_<carrierId>    → chat con un transporte
//   dm_d_<slug(nombre)> → chat con un chofer (por NOMBRE, único en la plantilla;
//   así coinciden el lado oficina y el portal del chofer, que se identifican por
//   ids distintos).
export const slugChofer = (s) => (s || '')
  .trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
export const convChofer = (nombre) => `dm_d_${slugChofer(nombre)}`
export const convCarrier = (carrierId) => `dm_c_${carrierId}`
export const esConvDirecta = (id) => typeof id === 'string' && id.startsWith('dm_')

// Chat INTERNO entre personal del STAFF (operaciones): dos uids ordenados.
//   st_<uidA>__<uidB>
export const convStaff = (a, b) => `st_${[a, b].filter(Boolean).sort().join('__')}`
export const esConvStaff = (id) => typeof id === 'string' && id.startsWith('st_')

// Chat PRIVADO 1-a-1 entre DOS personas cualesquiera (según la matriz de
// comunicación por roles): dos uids ORDENADOS, de modo que Juan→Carlos y
// Carlos→Juan resuelven a la MISMA clave (no se duplican conversaciones).
//   pv_<uidA>__<uidB>
export const convPrivada = (a, b) => `pv_${[a, b].filter(Boolean).sort().join('__')}`
export const esConvPrivada = (id) => typeof id === 'string' && id.startsWith('pv_')
// Los dos uids que participan en una conversación privada (o []).
export const uidsDePrivada = (id) => (esConvPrivada(id) ? id.slice(3).split('__').filter(Boolean) : [])

// Chat CLIENTE ↔ OFICINA por orden/viaje. Es un canal APARTE del chat operativo de
// la orden: aquí solo participan el cliente y el staff (el chofer/transportista NO),
// para que el cliente se comunique ÚNICAMENTE con el administrador, por viaje.
//   co_<orderId>
export const convClienteOrden = (orderId) => `co_${orderId}`
export const esConvClienteOrden = (id) => typeof id === 'string' && id.startsWith('co_')
// Orden subyacente de una conversación (co_<id> → <id>; en chats de orden, el propio id).
export const orderIdDeConv = (id) => (esConvClienteOrden(id) ? id.slice(3) : id)

// Normaliza cualquier marca de tiempo (string ISO, número, Firestore Timestamp,
// Date) a milisegundos, para ordenar sin depender de `.localeCompare`.
export const tsMillis = (v) => {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isNaN(n) ? 0 : n }
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  if (v instanceof Date) return v.getTime()
  return 0
}

// Cuenta mensajes NO leídos por `uid` (no los propios) agrupados por conversación.
export const noLeidosPorConv = (mensajes, uid) => {
  const m = {}
  for (const msg of mensajes || []) {
    if (msg.autorId !== uid && !(msg.leidoPor || []).includes(uid)) m[msg.orderId] = (m[msg.orderId] || 0) + 1
  }
  return m
}

// Resumen por conversación: último mensaje (ts/texto/autor/rol), no leídos y total.
// Se usa para pintar cada fila de la lista (vista previa + hora + indicador) sin
// abrir el chat. `uid` = usuario actual (para contar no leídos ajenos).
export const resumenPorConversacion = (mensajes, uid) => {
  const r = {}
  for (const m of mensajes || []) {
    const k = m.orderId
    if (!k) continue
    const cur = r[k] || { lastTs: '', lastText: '', lastRol: '', lastAutor: '', noLeidos: 0, total: 0 }
    cur.total += 1
    if (tsMillis(m.ts) >= tsMillis(cur.lastTs)) {
      cur.lastTs = m.ts
      cur.lastAutor = m.autorNombre || ''
      cur.lastRol = m.autorRol || ''
      cur.lastText = m.tipo === 'foto' ? '📷' : m.tipo === 'ubicacion' ? '📍' : m.tipo === 'archivo' ? ('📎 ' + (m.nombreArchivo || '')) : m.tipo === 'llamada' ? (m.texto || '📞') : (m.texto || '')
    }
    if (m.autorId !== uid && !(m.leidoPor || []).includes(uid)) cur.noLeidos += 1
    r[k] = cur
  }
  return r
}
