// ============================================================================
// Acceso a datos del submódulo Warehouse / Staffing (colecciones wh_staff_*).
// Toda escritura pasa por lotes (writeBatch) y deja rastro en wh_audit.
// ============================================================================
import {
  collection, getDocs, doc, setDoc, writeBatch, query, where,
  serverTimestamp, addDoc, arrayUnion, deleteField,
} from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { hashContenido, normalizarNombre } from './parserGofo'

export const COL = {
  periodos: 'wh_staff_periodos',
  registros: 'wh_staff_registros',
  ajustes: 'wh_staff_ajustes',
  tarifas: 'wh_staff_tarifas',
  gastos: 'wh_staff_gastos',
  cobros: 'wh_staff_cobros',
  workers: 'wh_workers',
  cheques: 'wh_cheques',
  bancoPend: 'wh_cheques_banco',
  config: 'wh_staff_config',
}

export async function auditarStaff(accion, detalle) {
  try {
    await addDoc(collection(db, 'wh_audit'), { modulo: 'staffing', accion, detalle: detalle || '', correo: auth.currentUser?.email || '', fecha: serverTimestamp() })
  } catch { /* la auditoría nunca bloquea la operación */ }
}

export async function cargar(col) {
  const snap = await getDocs(collection(db, col))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
export async function cargarPor(col, campo, valor) {
  const snap = await getDocs(query(collection(db, col), where(campo, '==', valor)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// id determinista de trabajador y de registro: reintentar una importación
// NUNCA duplica (sobrescribe el mismo documento).
export function idWorker(nombreNorm) { return 'w_' + hashContenido(nombreNorm) }
export function idRegistro(idPeriodo, fila) {
  return `${idPeriodo}__${hashContenido([fila.nombreNorm, fila.posicionRaw, fila.agencia, fila.warehouse, fila.fila])}`
}

// Base del nombre para detectar POSIBLES duplicados (no se unen solos:
// "Pedro FLD 3" vs "Pedro" se marca para revisión del dueño).
export function baseNombre(nombreNorm) {
  return String(nombreNorm || '')
    .replace(/\b(FLD|WH|TEMP)\b/gi, ' ')
    .replace(/[\d]+/g, ' ')
    .replace(/[^\p{L} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Resuelve el trabajador de un nombre: id existente (nombre o alias) o uno
// nuevo determinista. Devuelve { id, nuevo, posibleDuplicadoDe }.
export function resolverWorker(nombreRaw, workers) {
  const norm = normalizarNombre(nombreRaw)
  const existente = workers.find((w) => w.nombreNorm === norm || (w.alias || []).includes(norm))
  if (existente) return { id: existente.id, nuevo: false }
  const base = baseNombre(norm)
  const similar = base ? workers.find((w) => baseNombre(w.nombreNorm) === base) : null
  return { id: idWorker(norm), nuevo: true, posibleDuplicadoDe: similar ? similar.id : null }
}

// Escribe una lista de operaciones {ref, data, merge} en lotes de 400.
// El llamador pone el documento "confirmación" AL FINAL: si algo falla antes,
// el período no queda marcado como importado y el reintento sobrescribe
// exactamente los mismos ids (sin parciales ni duplicados).
export async function escribirEnLotes(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const lote = writeBatch(db)
    for (const op of ops.slice(i, i + 400)) {
      if (op.borrar) lote.delete(op.ref)
      else lote.set(op.ref, op.data, op.merge ? { merge: true } : {})
    }
    await lote.commit()
  }
}

export const refDoc = (col, id) => doc(db, col, id)
export { setDoc, arrayUnion, serverTimestamp, deleteField }
