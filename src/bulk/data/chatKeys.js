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
