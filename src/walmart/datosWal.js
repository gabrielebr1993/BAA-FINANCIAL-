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
  serverTimestamp, writeBatch, arrayUnion,
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
  cobros: 'wal_cobros', // dinero que Walmart paga a la compañía
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

// ── Semana de pago (lunes a domingo, por fecha local de servicio) ───────────
// Devuelve la fecha ISO del LUNES de la semana de `fechaISO` (clave de semana).
export function lunesDe(fechaISO) {
  const d = new Date(`${fechaISO || hoyISO()}T00:00:00`)
  const dow = (d.getDay() + 6) % 7 // 0 = lunes
  d.setDate(d.getDate() - dow)
  return d.toISOString().slice(0, 10)
}
export function domingoDe(fechaISO) {
  const d = new Date(`${lunesDe(fechaISO)}T00:00:00`); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10)
}
export const hoyISO = () => new Date().toISOString().slice(0, 10)

export const BLOQUES = [{ id: 'manana', label: 'Mañana' }, { id: 'tarde', label: 'Tarde' }]
export const ESTADOS_RUTA = [
  { id: 'pendiente', label: 'Pendiente', color: 'slate' },
  { id: 'en_progreso', label: 'En progreso', color: 'blue' },
  { id: 'completada', label: 'Completada', color: 'green' },
  { id: 'cancelada', label: 'Cancelada', color: 'red' },
]
export const estadoRutaInfo = (id) => ESTADOS_RUTA.find((e) => e.id === id) || ESTADOS_RUTA[0]

// Redondeo monetario a centavos.
export const money2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// id determinista de ruta (evita duplicar misma almacén+fecha+bloque+driver).
export function idRuta(almacenId, fecha, bloque, driverId) {
  return `r_${almacenId}_${fecha}_${bloque}_${driverId}`.replace(/[^a-zA-Z0-9_]/g, '')
}

// Suma de bonos/deducciones de una ruta por destino ('walmart' | 'driver').
function ajustes(r, destino) {
  const b = (r.bonos || []).filter((x) => x.aplicaA === destino).reduce((a, x) => a + (Number(x.monto) || 0), 0)
  const d = (r.deducciones || []).filter((x) => x.aplicaA === destino).reduce((a, x) => a + (Number(x.monto) || 0), 0)
  return money2(b - d)
}
// Ingreso que corresponde recibir de Walmart por la ruta (0 si no completada).
export function ingresoRuta(r) {
  if (r.estado !== 'completada') return 0
  return money2((Number(r.tarifaWalmart) || 0) + ajustes(r, 'walmart'))
}
// Ganancia bruta del driver por la ruta, antes de Fast Pay (0 si no completada).
export function gananciaDriver(r) {
  if (r.estado !== 'completada') return 0
  return money2((Number(r.tarifaDriver) || 0) + ajustes(r, 'driver'))
}

// ── Pagos y Fast Pay ────────────────────────────────────────────────────────
export const METODOS_PAGO = ['Efectivo', 'Zelle', 'Transferencia', 'Cheque', 'Otro']

// Importe bruto de una ruta ya liquidado mediante Fast Pay (suma de sus FP).
export function liquidadoFPruta(pagos, rutaId) {
  return money2((pagos || []).filter((p) => p.tipo === 'fastpay' && p.rutaId === rutaId).reduce((a, p) => a + (Number(p.bruto) || 0), 0))
}

// Resumen de una semana para un driver (lunes–domingo por fecha de servicio).
// Regla Fast Pay: el bruto ya liquidado NO se vuelve a pagar ni a comisionar;
// la comisión retenida es ingreso de la compañía (aparte), no un saldo.
export function resumenSemana(rutas, pagos, driverId, semana) {
  const rs = (rutas || []).filter((r) => r.driverId === driverId && r.semana === semana && r.estado === 'completada')
  const totalGanado = money2(rs.reduce((a, r) => a + gananciaDriver(r), 0))
  const ps = (pagos || []).filter((p) => p.driverId === driverId && p.semana === semana)
  const fp = ps.filter((p) => p.tipo === 'fastpay')
  const liquidadoFP = money2(fp.reduce((a, p) => a + (Number(p.bruto) || 0), 0))
  const comisiones = money2(fp.reduce((a, p) => a + (Number(p.comision) || 0), 0))
  const efectivoFP = money2(fp.reduce((a, p) => a + (Number(p.efectivo) || 0), 0))
  const pagadoNormal = money2(ps.filter((p) => p.tipo === 'pago').reduce((a, p) => a + (Number(p.monto) || 0), 0))
  const saldo = money2(totalGanado - liquidadoFP - pagadoNormal)
  const estado = saldo <= 0.005 ? 'pagado' : (liquidadoFP + pagadoNormal > 0 ? 'parcial' : 'pendiente')
  return { rutasSemana: rs, totalGanado, liquidadoFP, comisiones, efectivoFP, pagadoNormal, saldo, estado, pagos: ps }
}

// Calcula los montos de un Fast Pay (comisión del % sobre el BRUTO liquidado).
export function calcularFastPay(bruto, comisionPct) {
  const b = money2(bruto)
  const comision = money2(b * (Number(comisionPct) || 0) / 100)
  return { bruto: b, comision, efectivo: money2(b - comision) }
}

// ── Gastos ──────────────────────────────────────────────────────────────────
export const CATEGORIAS_GASTO = ['Cargo Van (financiamiento)', 'Seguro', 'Gasolina', 'Reparación', 'Mantenimiento', 'Renta', 'Nómina', 'Suministros', 'Otro']

// Distribuye un gasto MENSUAL (desde..hasta) entre semanas por días.
export function distribuirMensual(monto, desde, hasta) {
  const m = money2(monto)
  const d0 = new Date(`${desde}T00:00:00`), d1 = new Date(`${hasta}T00:00:00`)
  if (isNaN(d0) || isNaN(d1) || d1 < d0) return []
  const dias = Math.round((d1 - d0) / 86400000) + 1
  const porDia = m / dias
  const acc = {}
  for (let i = 0; i < dias; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); const s = lunesDe(d.toISOString().slice(0, 10)); acc[s] = (acc[s] || 0) + porDia }
  return Object.entries(acc).map(([semana, v]) => ({ semana, monto: money2(v) }))
}
// Monto de un gasto que corresponde a una semana (distribuido si es mensual).
export function gastoEnSemana(g, semana) {
  if (g.periodoDesde && g.periodoHasta) { const p = distribuirMensual(g.monto, g.periodoDesde, g.periodoHasta).find((x) => x.semana === semana); return money2(p ? p.monto : 0) }
  return (g.semana || lunesDe(g.fecha)) === semana ? money2(g.monto) : 0
}

// ── Resumen financiero de una semana (opcionalmente filtrado por almacén) ────
// Fast Pay: la ganancia del driver ANTES de FP es el costo; la comisión es
// ingreso SEPARADO (no se reduce el costo por la comisión).
export function financieroSemana(rutas, pagos, gastos, cobros, semana, almacenId) {
  const enAlm = (aId) => !almacenId || aId === almacenId
  const rs = (rutas || []).filter((r) => r.semana === semana && r.estado === 'completada' && enAlm(r.almacenId))
  const ingresoRutas = money2(rs.reduce((a, r) => a + ingresoRuta(r), 0))
  const costoDrivers = money2(rs.reduce((a, r) => a + gananciaDriver(r), 0))
  const margen = money2(ingresoRutas - costoDrivers)
  const driversAlm = new Set(rs.map((r) => r.driverId))
  const ps = (pagos || []).filter((p) => p.semana === semana && (!almacenId || driversAlm.has(p.driverId)))
  const comisionesFP = money2(ps.filter((p) => p.tipo === 'fastpay').reduce((a, p) => a + (Number(p.comision) || 0), 0))
  const efectivoFP = money2(ps.filter((p) => p.tipo === 'fastpay').reduce((a, p) => a + (Number(p.efectivo) || 0), 0))
  const pagosNormales = money2(ps.filter((p) => p.tipo === 'pago').reduce((a, p) => a + (Number(p.monto) || 0), 0))
  const gs = (gastos || []).filter((g) => enAlm(g.almacenId) || !g.almacenId)
  let gastosOper = 0, gastoFinanc = 0, gastosPagados = 0
  for (const g of gs) {
    const m = gastoEnSemana(g, semana)
    if (m) { if (g.esFinanciamiento) gastoFinanc += m; else gastosOper += m }
    if (g.estadoPago === 'pagado' && (g.semana || lunesDe(g.fechaPago || g.fecha)) === semana) gastosPagados += Number(g.monto) || 0
  }
  gastosOper = money2(gastosOper); gastoFinanc = money2(gastoFinanc); gastosPagados = money2(gastosPagados)
  const resultadoOperativo = money2(margen - gastosOper + comisionesFP)
  const cobrado = money2((cobros || []).filter((c) => c.semana === semana && enAlm(c.almacenId)).reduce((a, c) => a + (Number(c.monto) || 0), 0))
  const porCobrar = money2(ingresoRutas - cobrado)
  const efectivoADrivers = money2(efectivoFP + pagosNormales)
  const flujoCaja = money2(cobrado - efectivoADrivers - gastosPagados)
  return { ingresoRutas, costoDrivers, margen, gastosOper, gastoFinanc, comisionesFP, efectivoFP, pagosNormales, resultadoOperativo, cobrado, porCobrar, efectivoADrivers, gastosPagados, flujoCaja, nRutas: rs.length }
}

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

// Cierre del día (transaccional): marca las rutas como cerradas y guarda el
// resumen. No vuelve a generar movimientos; solo consolida y bloquea edición.
export async function cerrarDia(almacenId, fecha, rutas, resumen) {
  const cierreId = `c_${almacenId}_${fecha}`
  const batch = writeBatch(db)
  for (const r of rutas) batch.set(refDoc(COL.rutas, r.id), { cerrada: true, cierreId }, { merge: true })
  batch.set(refDoc(COL.cierres, cierreId), { almacenId, fecha, resumen, estado: 'cerrado', cerradoEn: serverTimestamp(), cerradoPor: auth.currentUser?.email || '' }, { merge: true })
  await batch.commit()
  await auditar('dia_cerrado', `${almacenId} ${fecha}: ${rutas.length} rutas`)
  return cierreId
}
// Reabrir un día cerrado (solo dueño), con motivo y rastro de auditoría. No
// borra pagos ni comprobantes; solo permite corregir con nuevos ajustes.
export async function reabrirDia(cierreId, rutas, motivo) {
  const batch = writeBatch(db)
  for (const r of rutas) batch.set(refDoc(COL.rutas, r.id), { cerrada: false, cierreId: null }, { merge: true })
  batch.set(refDoc(COL.cierres, cierreId), {
    estado: 'reabierto',
    reaperturas: arrayUnion({ fecha: new Date().toISOString(), por: auth.currentUser?.email || '', motivo: motivo || '' }),
  }, { merge: true })
  await batch.commit()
  await auditar('dia_reabierto', `${cierreId}: ${motivo || 'sin motivo'}`)
}
