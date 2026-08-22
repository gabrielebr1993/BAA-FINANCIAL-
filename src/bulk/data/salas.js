// BULK · Señalización de LLAMADAS GRUPALES (3+ personas) por WebRTC en malla (mesh).
// Cada participante abre una conexión P2P con CADA otro participante (mesh): el
// audio/video viaja navegador↔navegador; Firestore solo transporta la señalización
// (oferta/respuesta SDP + candidatos ICE) por PAREJAS. La malla es ideal para grupos
// pequeños (≈3–5 personas), que es el caso de uso: administrador + transportista +
// choferes de una operación. No requiere servidor de medios (SFU) ni coste extra;
// reutiliza el mismo STUN/TURN que la llamada 1-a-1.
//
// Estructura en Firestore:
//   bulk_salas/{salaId} = {
//     tenantId, creadaPor, tipo:'audio'|'video', nombre, estado:'activa',
//     participantes: { <uid>: { nombre, rol, ts } },   // quién está DENTRO ahora
//     invitados: [ <uid>, ... ],                        // a quién le suena (ring)
//     ctx: { chatId, participantes } | null             // origen (para historial)
//   }
//   bulk_salas/{salaId}/senales/{auto} = { de, deNombre, deRol, para, kind, data, ts }
//     kind: 'offer' | 'answer' | 'ice'  (dirigida de UN uid a OTRO uid)
//
// Aislamiento: las reglas solo dejan leer/escribir la sala y sus señales a los
// participantes/invitados (o al admin). Las consultas usan un solo array-contains
// (índice de campo único, automático) para NO exigir índices compuestos.
import { dbBulk as db } from '../firebaseBulk'
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, deleteField,
  onSnapshot, getDoc, getDocs, query, where,
} from 'firebase/firestore'

export const salasCol = () => collection(db, 'bulk_salas')
export const salaRef = (id) => doc(db, 'bulk_salas', id)
export const senalesCol = (id) => collection(db, 'bulk_salas', id, 'senales')

// Crea la sala. El creador entra como primer participante; los demás quedan como
// "invitados" (les suena). Devuelve el id de la sala.
export async function crearSala({ tenantId, de, tipo, nombre, invitados, ctx }) {
  const uids = Array.from(new Set((invitados || []).map((p) => p.uid).filter((u) => u && u !== de.uid)))
  const ref = await addDoc(salasCol(), {
    tenantId,
    creadaPor: de.uid,
    creadaPorNombre: de.nombre || '',
    tipo: tipo || 'audio',
    nombre: nombre || '',
    estado: 'activa',
    participantes: { [de.uid]: { nombre: de.nombre || '', rol: de.rol || '', ts: new Date().toISOString() } },
    invitados: uids,
    ctx: ctx || null,
    creadoEn: new Date().toISOString(),
  })
  return ref.id
}

// Añade uid a la sala como participante y lo quita de "invitados" (dejó de sonarle).
export async function unirseSala(salaId, { uid, nombre, rol }) {
  await updateDoc(salaRef(salaId), {
    [`participantes.${uid}`]: { nombre: nombre || '', rol: rol || '', ts: new Date().toISOString() },
    invitados: await sinInvitado(salaId, uid),
  }).catch(async () => {
    // Si falla el cálculo de invitados (carrera), al menos marca la entrada.
    await updateDoc(salaRef(salaId), { [`participantes.${uid}`]: { nombre: nombre || '', rol: rol || '', ts: new Date().toISOString() } })
  })
}

// Añade MÁS invitados a una sala en curso ("agregar personas").
export async function invitarASala(salaId, nuevos) {
  const s = await getDoc(salaRef(salaId)); if (!s.exists()) return
  const data = s.data()
  const yaDentro = Object.keys(data.participantes || {})
  const set = new Set([...(data.invitados || [])])
  for (const p of nuevos || []) { if (p.uid && !yaDentro.includes(p.uid)) set.add(p.uid) }
  await updateDoc(salaRef(salaId), { invitados: Array.from(set) })
}

// Sale de la sala. Si no queda nadie dentro, marca la sala como terminada.
export async function salirSala(salaId, uid) {
  try {
    const s = await getDoc(salaRef(salaId)); if (!s.exists()) return
    const parts = { ...(s.data().participantes || {}) }
    delete parts[uid]
    if (Object.keys(parts).length === 0) {
      await updateDoc(salaRef(salaId), { estado: 'terminada', participantes: {} }).catch(() => {})
      // Limpieza best-effort de señales.
      const sn = await getDocs(senalesCol(salaId))
      await Promise.all(sn.docs.map((d) => deleteDoc(d.ref).catch(() => {})))
      await deleteDoc(salaRef(salaId)).catch(() => {})
    } else {
      await updateDoc(salaRef(salaId), { [`participantes.${uid}`]: deleteField() }).catch(() => {})
    }
  } catch { /* noop */ }
}

async function sinInvitado(salaId, uid) {
  const s = await getDoc(salaRef(salaId))
  return (s.exists() ? (s.data().invitados || []) : []).filter((u) => u !== uid)
}

export const escucharSala = (salaId, cb) => onSnapshot(salaRef(salaId), (d) => cb(d.exists() ? { id: d.id, ...d.data() } : null), () => cb(null))

// Envía una señal dirigida (offer/answer/ice) a OTRO participante de la sala.
export const enviarSenal = (salaId, senal) => addDoc(senalesCol(salaId), { ...senal, ts: new Date().toISOString() })

// Escucha las señales dirigidas a MÍ. Consume (borra) cada una tras entregarla para
// no reprocesarla. Consulta de un solo campo (para) → índice automático.
export function escucharSenales(salaId, uid, cb) {
  const q = query(senalesCol(salaId), where('para', '==', uid))
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type !== 'added') return
      const s = { id: ch.doc.id, ...ch.doc.data() }
      cb(s)
      deleteDoc(ch.doc.ref).catch(() => {})
    })
  }, () => {})
}

// Escucha las salas ENTRANTES para `uid` (donde está invitado y sigue 'activa').
// Acota a MI empresa (tenantId) + donde estoy invitado, IGUAL que el listener 1-a-1:
// sin el filtro de tenantId, un solo doc de sala mal formado o de otra empresa que
// coincidiera hacía fallar TODA la consulta con permission-denied → el invitado no
// recibía NINGUNA llamada (timbre mudo). Requiere el índice compuesto
// (tenantId ASC, invitados CONTAINS) en firestore.indexes.json.
export function escucharSalasEntrantes(tenantId, uid, cb) {
  const q = query(salasCol(), where('tenantId', '==', tenantId), where('invitados', 'array-contains', uid))
  return onSnapshot(q, (snap) => {
    // Solo salas RECIENTES: si una quedó 'activa' sin limpiar (el creador cerró la app
    // a media llamada), NO debe repicar para siempre. Se ignora si tiene más de 90 s.
    const ahora = Date.now()
    const fresca = (iso) => { const ts = Date.parse(iso); return Number.isFinite(ts) && (ahora - ts) < 90000 }
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.estado === 'activa' && fresca(s.creadoEn))
    console.log('[sala] entrantes:', snap.size, '→ activas para mí:', docs.length)
    cb(docs)
  }, (err) => { console.warn('[sala] error listener entrantes:', err && err.code, err && err.message); cb([]) })
}

export { onSnapshot }
