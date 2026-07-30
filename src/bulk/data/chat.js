// BULK · Mensajería en tiempo real por orden (`bulk_messages`).
// Realtime vía onSnapshot de Firestore. Lectura por usuario (leidoPor) y urgentes.
import { crear, suscribir, where, ref } from './repo'
import { updateDoc, arrayUnion } from 'firebase/firestore'

// ── Conversaciones DIRECTAS (no ligadas a una orden) ────────────────────────
// Se guardan en la misma colección de mensajes usando un `orderId` sintético:
//   dm_c_<carrierId>   → chat con un transporte
//   dm_d_<slug(nombre)> → chat con un chofer (por NOMBRE, que es único en la
//   plantilla; así coinciden el lado oficina y el portal del chofer, que se
//   identifican por ids distintos).
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

export async function enviarMensaje(tenantId, orderId, autor, { tipo = 'texto', texto, foto, ubicacion, urgente } = {}) {
  await crear('messages', tenantId, {
    orderId,
    autorId: autor.id,
    autorNombre: autor.nombre || autor.email || 'usuario',
    autorRol: autor.rol || '',
    tipo,
    texto: texto || '',
    foto: foto || null,
    ubicacion: ubicacion || null,
    urgente: !!urgente,
    ts: new Date().toISOString(),
    leidoPor: [autor.id],
  })
}

export function suscribirChat(tenantId, orderId, cb) {
  return suscribir('messages', tenantId, (d) => cb(d.slice().sort((a, b) => (a.ts < b.ts ? -1 : 1))), [where('orderId', '==', orderId)])
}

export async function marcarLeidos(mensajes, uid) {
  for (const m of mensajes || []) {
    if (!(m.leidoPor || []).includes(uid)) {
      try { await updateDoc(ref('messages', m.id), { leidoPor: arrayUnion(uid) }) } catch { /* noop */ }
    }
  }
}
