// ============================================================================
// BULK · Capa de datos (desacoplada de Package)
// Usa el mismo proyecto Firebase pero en un NAMESPACE totalmente separado:
// todas las colecciones llevan el prefijo `bulk_` y todos los documentos están
// aislados por `tenantId` (multi-tenant). Package nunca lee ni escribe aquí, y
// este módulo nunca toca las colecciones de Package (invoices, users, etc.).
//
// Diseñado para poder migrarse a su propio proyecto/servicio en el futuro sin
// cambiar las pantallas: solo cambia esta capa.
// ============================================================================
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch, runTransaction, documentId,
} from 'firebase/firestore'
import { dbBulk as db } from '../firebaseBulk'

const PREFIJO = 'bulk_'
export const col = (nombre) => collection(db, PREFIJO + nombre)
export const ref = (nombre, id) => doc(db, PREFIJO + nombre, id)

// Construye las cláusulas comunes: aislamiento por tenant + filtros + orden + límite.
// opts: { orden?: campo, dir?: 'asc'|'desc', limite?: número }. Combinar `orden` con
// el where de tenantId requiere un índice compuesto (ver firestore.indexes.json).
function clausulasDe(tenantId, filtros = [], opts = {}) {
  const c = [where('tenantId', '==', tenantId), ...filtros]
  if (opts.orden) c.push(orderBy(opts.orden, opts.dir || 'asc'))
  if (opts.limite) c.push(limit(opts.limite))
  return c
}

// Lista documentos de una colección para un tenant (con filtros/orden/límite opcionales).
export async function listar(nombre, tenantId, filtros = [], opts = {}) {
  const snap = await getDocs(query(col(nombre), ...clausulasDe(tenantId, filtros, opts)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Suscripción en tiempo real (WebSocket de Firestore) a una colección del tenant.
// Devuelve la función para cancelar la suscripción.
export function suscribir(nombre, tenantId, cb, filtros = [], opts = {}) {
  return onSnapshot(query(col(nombre), ...clausulasDe(tenantId, filtros, opts)), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, () => cb([]))
}

export async function obtener(nombre, id) {
  const s = await getDoc(ref(nombre, id))
  return s.exists() ? { id: s.id, ...s.data() } : null
}

// Suscripción en tiempo real a UN documento por id. A diferencia de una consulta de
// colección, un `get` por id cumple reglas del tipo `request.auth.uid == id` sin
// necesitar que la consulta lo garantice (evita el bloqueo de listas por reglas).
export function suscribirDoc(nombre, id, cb) {
  return onSnapshot(ref(nombre, id), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null), () => cb(null))
}

export async function crear(nombre, tenantId, datos) {
  const payload = { ...datos, tenantId, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }
  const r = await addDoc(col(nombre), payload)
  return { id: r.id, ...datos, tenantId }
}

export async function guardar(nombre, id, datos) {
  await updateDoc(ref(nombre, id), { ...datos, actualizadoEn: serverTimestamp() })
}

export async function crearConId(nombre, id, tenantId, datos) {
  await setDoc(ref(nombre, id), { ...datos, tenantId, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() }, { merge: true })
}

export async function eliminar(nombre, id) {
  await deleteDoc(ref(nombre, id))
}

// Crea muchos documentos de una sola vez (p. ej. las órdenes de un job).
export async function crearLote(nombre, tenantId, lista) {
  const batch = writeBatch(db)
  const creados = []
  for (const datos of lista) {
    const r = doc(col(nombre))
    batch.set(r, { ...datos, tenantId, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() })
    creados.push({ id: r.id, ...datos, tenantId })
  }
  await batch.commit()
  return creados
}

// Contador secuencial atómico por tenant (doc id = tenantId en bulk_counters).
// Devuelve el siguiente número para `clave` (p. ej. 'factura', 'pago'). Único e
// incremental gracias a la transacción — apto para numeración fiscal.
export async function siguienteSecuencia(tenantId, clave) {
  const r = ref('counters', tenantId)
  return runTransaction(db, async (tx) => {
    const s = await tx.get(r)
    const data = s.exists() ? s.data() : {}
    const next = (Number(data[clave]) || 0) + 1
    tx.set(r, { tenantId, [clave]: next, actualizadoEn: serverTimestamp() }, { merge: true })
    return next
  })
}

export { serverTimestamp, where, orderBy, documentId }
