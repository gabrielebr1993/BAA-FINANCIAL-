// BULK · Señalización de LLAMADAS 1-a-1 (voz/video) por WebRTC usando Firestore.
// El audio/video viaja P2P (navegador ↔ navegador); Firestore solo intercambia la
// "oferta/respuesta" (SDP) y los candidatos ICE. STUN gratis de Google resuelve la
// mayoría de las redes; en redes muy restringidas (algunas móviles) haría falta un
// servidor TURN (se puede añadir luego en ICE_SERVERS). Aislamiento: las reglas de
// Firestore solo dejan leer/escribir la llamada a sus 2 participantes.
import { dbBulk as db } from '../firebaseBulk'
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, getDoc, getDocs, query, where, orderBy } from 'firebase/firestore'

// Servidores ICE. Para llamadas fiables en cualquier red, añade aquí un TURN:
//   { urls: 'turn:tu-servidor:3478', username: '...', credential: '...' }
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

export const nuevaConexion = () => new RTCPeerConnection({ iceServers: ICE_SERVERS })

export const callsCol = () => collection(db, 'bulk_calls')
export const callRef = (id) => doc(db, 'bulk_calls', id)
export const candCol = (id, lado) => collection(db, 'bulk_calls', id, lado) // 'caller' | 'callee'

// Crea el documento de llamada (estado 'llamando'). Devuelve su id.
export async function crearLlamada({ tenantId, de, para, tipo }) {
  const ref = await addDoc(callsCol(), {
    tenantId, de, para, tipo: tipo || 'audio', estado: 'llamando',
    creadoEn: new Date().toISOString(),
  })
  return ref.id
}

export const actualizarLlamada = (id, datos) => updateDoc(callRef(id), datos)
export const agregarCandidato = (id, lado, cand) => addDoc(candCol(id, lado), cand)
export const obtenerLlamada = async (id) => { const s = await getDoc(callRef(id)); return s.exists() ? { id: s.id, ...s.data() } : null }

// Escucha las llamadas ENTRANTES para `uid`. Consulta mínima (solo `para`, que ya
// es único por usuario y las reglas restringen a los participantes); el estado y la
// oferta se filtran en el cliente. Así evitamos cualquier requisito de índice.
export function escucharEntrantes(tenantId, uid, cb) {
  const q = query(callsCol(), where('para', '==', uid))
  return onSnapshot(q, (snap) => {
    // Timbra en cuanto la llamada está 'llamando' (la oferta puede llegar 1 instante
    // después; se re-lee al aceptar). No exige `offer` para no perder el timbre.
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.tenantId === tenantId && c.estado === 'llamando')
    console.log('[llamada] entrantes:', snap.size, '→ para mí:', docs.length)
    cb(docs)
  }, (err) => { console.warn('[llamada] error listener entrantes:', err && err.code, err && err.message); cb([]) })
}

// Borra la llamada y sus candidatos (limpieza al colgar). Best-effort.
export async function limpiarLlamada(id) {
  try {
    for (const lado of ['caller', 'callee']) {
      const s = await getDocs(candCol(id, lado))
      await Promise.all(s.docs.map((d) => deleteDoc(d.ref).catch(() => {})))
    }
    await deleteDoc(callRef(id)).catch(() => {})
  } catch { /* noop */ }
}

export { onSnapshot, query, orderBy }
