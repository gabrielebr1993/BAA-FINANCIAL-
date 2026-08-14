// BULK · Mensajería en tiempo real por orden (`bulk_messages`).
// Realtime vía onSnapshot de Firestore. Lectura por usuario (leidoPor) y urgentes.
import { crear, suscribir, where, ref } from './repo'
import { updateDoc, arrayUnion } from 'firebase/firestore'

// Claves/utilidades puras (sin Firebase). Se re-exportan para no cambiar imports.
export { slugChofer, convChofer, convCarrier, esConvDirecta, tsMillis, noLeidosPorConv } from './chatKeys'

// `participantes`: identificadores (uid del chofer, id del carrier, id del cliente,
// autor) que pueden leer este chat de orden. Si se pasa, las reglas acotan la
// lectura a ellos + staff. En chats de oficina (sin esos ids) queda vacío y no se
// guarda el campo (comportamiento previo: staff y el interlocutor).
export async function enviarMensaje(tenantId, orderId, autor, { tipo = 'texto', texto, foto, ubicacion, urgente } = {}, participantes = []) {
  const parts = [...new Set([autor.id, ...(participantes || [])].filter(Boolean))]
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
    // Solo se guarda en chats de orden (con participantes reales). Los de oficina
    // no lo llevan y siguen con la regla anterior.
    ...(participantes && participantes.length ? { participantes: parts } : {}),
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
