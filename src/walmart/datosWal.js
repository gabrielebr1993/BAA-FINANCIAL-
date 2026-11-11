// ============================================================================
// WALMART (submódulo de Package) · capa de datos y constantes.
//
// Operación 100% MANUAL (sin importar archivos). Colecciones wal_* aisladas de
// Gofo/Speedx y del resto. Todo registro lleva origen 'walmart' implícito por su
// colección; las integraciones con Financial identifican el origen Walmart.
//
// Fase 1: candidatos/drivers, almacenes y configuración (tarifas). Las demás
// colecciones (rutas, cierres, pagos, gastos, contratos…) llegan en sus fases.
// ============================================================================
import {
  collection, getDocs, doc, setDoc, addDoc, deleteDoc, onSnapshot, query, orderBy,
  serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db, auth } from '../firebase'

export const COL = {
  candidatos: 'wal_candidatos', // personas: candidatos + drivers (estado los distingue)
  almacenes: 'wal_almacenes',
  config: 'wal_config',
  rutas: 'wal_rutas',
  cierres: 'wal_cierres',
  pagos: 'wal_pagos',
  gastos: 'wal_gastos',
  contratos: 'wal_contratos',
  plantillas: 'wal_plantillas',
  audit: 'wal_audit',
}

// Estados operativos del candidato/driver (independientes de otros módulos).
export const ESTADOS = [
  { id: 'candidato', label: 'Candidato', color: 'slate' },
  { id: 'pendiente_doc', label: 'Pendiente de documentación', color: 'amber' },
  { id: 'standby', label: 'Stand-by', color: 'blue' },
  { id: 'activo', label: 'Activo', color: 'green' },
  { id: 'inactivo', label: 'Inactivo', color: 'red' },
]
export const estadoInfo = (id) => ESTADOS.find((e) => e.id === id) || ESTADOS[0]

export const DISPONIBILIDAD = [
  { id: 'manana', label: 'Mañana' },
  { id: 'tarde', label: 'Tarde' },
  { id: 'ambas', label: 'Ambas' },
]
export const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const TIPOS_VEHICULO = ['SUV', 'Cargo Van', 'Sedan', 'Pickup', 'Otro']
export const SI_NO_PEND = [
  { id: 'si', label: 'Sí' },
  { id: 'no', label: 'No' },
  { id: 'pendiente', label: 'Pendiente de confirmar' },
]
export const PROPIETARIO = [
  { id: 'driver', label: 'Driver' },
  { id: 'compania', label: 'Compañía' },
]

// Tarifas por defecto (configurables; se guardan en wal_config/tarifas).
export const TARIFAS_DEFAULT = {
  ingresoWalmart: 340, // USD que Walmart paga a la compañía por ruta
  pagoDriverPropio: 250, // USD al driver con vehículo propio
  pagoDriverCompania: 150, // USD al driver con vehículo de la compañía (configurable)
  comisionFastPay: 5, // % del importe bruto liquidado por Fast Pay
}

// ── helpers ─────────────────────────────────────────────────────────────────
export const refDoc = (col, id) => doc(db, col, id)
export function suscribir(col, cb, ordenarPor) {
  const q = ordenarPor ? query(collection(db, col), orderBy(ordenarPor)) : collection(db, col)
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]))
}
export async function cargar(col) {
  const s = await getDocs(collection(db, col))
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
}
export async function guardar(col, id, data) {
  const base = { ...data, actualizadoEn: serverTimestamp(), actualizadoPor: auth.currentUser?.email || '' }
  if (id) { await setDoc(refDoc(col, id), base, { merge: true }); return id }
  const ref = await addDoc(collection(db, col), { ...base, creadoEn: serverTimestamp(), creadoPor: auth.currentUser?.email || '' })
  return ref.id
}
export async function borrar(col, id) { await deleteDoc(refDoc(col, id)) }

export async function auditar(accion, detalle) {
  try { await addDoc(collection(db, COL.audit), { accion, detalle: detalle || '', correo: auth.currentUser?.email || '', fecha: serverTimestamp() }) } catch { /* nunca bloquea */ }
}

// Nombre para mostrar de una persona.
export const nombreCompleto = (p) => `${p?.nombre || ''} ${p?.apellido || ''}`.trim() || '(sin nombre)'

// Siembra inicial de almacenes (Salt Lake y Frisco) — solo si no existen.
export async function sembrarAlmacenes() {
  const existentes = await cargar(COL.almacenes)
  const tengo = new Set(existentes.map((a) => (a.nombre || '').toLowerCase()))
  const base = [
    { nombre: 'Salt Lake', ciudad: 'Salt Lake City', estado: 'UT', zonaHoraria: 'America/Denver', activo: true },
    { nombre: 'Frisco', ciudad: 'Frisco', estado: 'TX', zonaHoraria: 'America/Chicago', activo: true },
  ].filter((a) => !tengo.has(a.nombre.toLowerCase()))
  if (!base.length) return 0
  const batch = writeBatch(db)
  for (const a of base) batch.set(doc(collection(db, COL.almacenes)), { ...a, responsable: '', creadoEn: serverTimestamp(), creadoPor: auth.currentUser?.email || '' })
  await batch.commit()
  return base.length
}
