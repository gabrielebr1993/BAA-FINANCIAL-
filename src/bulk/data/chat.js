// BULK · Mensajería en tiempo real por orden (`bulk_messages`).
// Realtime vía onSnapshot de Firestore. Lectura por usuario (leidoPor) y urgentes.
import { crear, suscribir, where, ref, listar, eliminar } from './repo'
import { updateDoc, arrayUnion } from 'firebase/firestore'

// Claves/utilidades puras (sin Firebase). Se re-exportan para no cambiar imports.
export { slugChofer, convChofer, convCarrier, esConvDirecta, convClienteOrden, esConvClienteOrden, orderIdDeConv, tsMillis, noLeidosPorConv, noLeidosVisibles, resumenPorConversacion, convStaff, esConvStaff, convPrivada, esConvPrivada, uidsDePrivada } from './chatKeys'

// `participantes`: identificadores (uid del chofer, id del carrier, id del cliente,
// autor) que pueden leer este chat de orden. Si se pasa, las reglas acotan la
// lectura a ellos + staff. En chats de oficina (sin esos ids) queda vacío y no se
// guarda el campo (comportamiento previo: staff y el interlocutor).
export async function enviarMensaje(tenantId, orderId, autor, { tipo = 'texto', texto, foto, ubicacion, urgente, archivo, nombreArchivo, mime } = {}, participantes = []) {
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
    // Archivo adjunto (pequeño) guardado en línea como data URI, con su nombre y tipo.
    ...(archivo ? { archivo, nombreArchivo: nombreArchivo || 'archivo', mime: mime || '' } : {}),
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

// Elimina UN mensaje de forma permanente ("sin respaldo"). Las reglas de Firestore
// solo permiten borrarlo a su AUTOR o al administrador (no se confía en el frontend).
export async function eliminarMensaje(id) {
  await eliminar('messages', id)
}

// Elimina TODA una conversación (todos los mensajes con ese orderId) de forma
// permanente. Uso previsto: administrador. Las reglas validan cada borrado.
export async function eliminarConversacion(tenantId, orderId) {
  const docs = await listar('messages', tenantId, [where('orderId', '==', orderId)])
  for (const d of docs) {
    try { await eliminar('messages', d.id) } catch { /* noop: sin permiso sobre ese mensaje */ }
  }
  return docs.length
}
