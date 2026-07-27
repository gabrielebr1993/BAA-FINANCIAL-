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
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { dbBulk as db } from '../firebaseBulk'

const PREFIJO = 'bulk_'
export const col = (nombre) => collection(db, PREFIJO + nombre)
export const ref = (nombre, id) => doc(db, PREFIJO + nombre, id)

// Lista documentos de una colección para un tenant (con filtros opcionales).
export async function listar(nombre, tenantId, filtros = []) {
  const clausulas = [where('tenantId', '==', tenantId), ...filtros]
  const snap = await getDocs(query(col(nombre), ...clausulas))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

// Suscripción en tiempo real (WebSocket de Firestore) a una colección del tenant.
// Devuelve la función para cancelar la suscripción.
export function suscribir(nombre, tenantId, cb, filtros = []) {
  const clausulas = [where('tenantId', '==', tenantId), ...filtros]
  return onSnapshot(query(col(nombre), ...clausulas), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }, () => cb([]))
}

export async function obtener(nombre, id) {
  const s = await getDoc(ref(nombre, id))
  return s.exists() ? { id: s.id, ...s.data() } : null
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

export { serverTimestamp, where, orderBy }
