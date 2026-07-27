// BULK · Mensajería en tiempo real por orden (`bulk_messages`).
// Realtime vía onSnapshot de Firestore. Lectura por usuario (leidoPor) y urgentes.
import { crear, suscribir, where, ref } from './repo'
import { updateDoc, arrayUnion } from 'firebase/firestore'

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
