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
  collection, getDocs, doc, setDoc, addDoc, deleteDoc, onSnapshot, query, orderBy, where,
  serverTimestamp, writeBatch, arrayUnion,
} from 'firebase/firestore'
import { db, auth } from '../firebase'
// Núcleo de cálculo PURO (sin Firebase) — se re-exporta para el resto de la app.
import {
  money2, hoyISO, inicioSemana, finSemana, lunesDe, domingoDe,
  otIngresoRuta, otPagoRuta, ingresoRuta, gananciaDriver,
  METODOS_PAGO, ESTADOS_FP, ESTADO_FP_LABEL, ESTADO_FP_COLOR,
  estadoFP, fpLiquida, fpBloquea, rutaBloqueadaFP, fpDeRuta, liquidadoFPruta,
  resumenSemana, conciliacionSemana, calcularFastPay, utilidadFinanciamiento,
} from './wmcalc'
export * from './wmcalc'

// ── Media: foto/documentos como dataURL (sin Storage; reglas wal_* los cubren) ─
// Lee una imagen y la redimensiona/comprime a JPEG para que pese poco.
export function leerImagenRedimensionada(file, max = 512, calidad = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Sin archivo'))
    if (!/^image\//.test(file.type)) return reject(new Error('Debe ser una imagen'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const esc = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * esc)), h = Math.max(1, Math.round(img.height * esc))
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(cv.toDataURL('image/jpeg', calidad))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}
export function leerArchivoComoDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('No se pudo leer el archivo'))
    r.readAsDataURL(file)
  })
}
// Documentos de UN driver (suscripción en vivo).
export function suscribirDocs(driverId, cb) {
  if (!driverId) { cb([]); return () => {} }
  const q = query(collection(db, COL.docs), where('driverId', '==', driverId))
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))), () => cb([]))
}

export const COL = {
  candidatos: 'wal_candidatos', // personas: candidatos + drivers (estado los distingue)
  almacenes: 'wal_almacenes',
  config: 'wal_config',
  rutas: 'wal_rutas',
  cierres: 'wal_cierres',
  pagos: 'wal_pagos',
  gastos: 'wal_gastos',
  gastosFijos: 'wal_gastos_fijos', // plantillas de gastos recurrentes (semanal/mensual)
  cobros: 'wal_cobros', // dinero que Walmart paga a la compañía
  contratos: 'wal_contratos',
  plantillas: 'wal_plantillas',
  agenda: 'wal_agenda', // asignación semanal de drivers por almacén y turno
  docs: 'wal_docs', // documentos del driver (foto/licencia/etc.) como dataURL
  facturas: 'wal_facturas', // facturas mensuales para cobrar a Walmart
  usuarios: 'wal_usuarios', // roles/permisos de usuarios de Walmart (aislado)
  solicitudes: 'wal_solicitudes', // solicitudes de Fast Pay enviadas por los choferes
  audit: 'wal_audit',
}

// ── Solicitudes de Fast Pay (el chofer las pide desde su portal) ──────────────
// El chofer CREA una solicitud de su propia ruta; el dueño/staff la ve, la
// atiende (hace el Fast Pay) o la rechaza. estado: solicitada | atendida | rechazada.
export async function solicitarFastPay(ruta, driver, nota) {
  const id = `sol_${ruta.id}`.replace(/[^a-zA-Z0-9_]/g, '') // una por ruta (evita duplicar)
  return guardar(COL.solicitudes, id, {
    tipo: 'fastpay', estado: 'solicitada', rutaId: ruta.id, fecha: ruta.fecha, almacenId: ruta.almacenId || '',
    driverId: driver?.id || ruta.driverId || '', driverNombre: nombreCompleto(driver) || ruta.driverNombre || '',
    bruto: Number(ruta.bruto) || 0, nota: String(nota || '').slice(0, 300), creadoEn: serverTimestamp(),
  })
}
export function suscribirSolicitudes(cb) {
  return onSnapshot(collection(db, COL.solicitudes), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]))
}
export function suscribirMisSolicitudes(driverId, cb) {
  if (!driverId) { cb([]); return () => {} }
  const q = query(collection(db, COL.solicitudes), where('driverId', '==', driverId))
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]))
}
export async function atenderSolicitud(id, estado, extra = {}) {
  return guardar(COL.solicitudes, id, { estado, atendidaEn: serverTimestamp(), ...extra })
}

// ── Usuarios de Walmart (roles/permisos) — colección aislada wal_usuarios ─────
// Documento por correo (en minúsculas) para que el cliente Y las reglas de
// Firestore puedan localizarlo por request.auth.token.email.
export const idUsuarioWal = (email) => String(email || '').trim().toLowerCase()
// Suscripción EN VIVO al propio documento de usuario Walmart: así, si el dueño
// retira un permiso, el cambio llega a la sesión activa sin cerrar sesión.
export function suscribirMiUsuarioWal(email, cb) {
  const id = idUsuarioWal(email)
  if (!id) { cb(null); return () => {} }
  return onSnapshot(refDoc(COL.usuarios, id), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), () => cb(null))
}
// Suscripción a TODOS los usuarios de Walmart (para el panel de administración).
export function suscribirUsuariosWal(cb) {
  return onSnapshot(collection(db, COL.usuarios), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]))
}
// Guarda/actualiza un usuario Walmart (merge). El id es el correo en minúsculas.
export async function guardarUsuarioWal(email, data) {
  const id = idUsuarioWal(email)
  if (!id) throw new Error('Correo requerido')
  return guardar(COL.usuarios, id, { email: id, ...data })
}
export async function borrarUsuarioWal(email) { return borrar(COL.usuarios, idUsuarioWal(email)) }

// ── Portal del chofer: consultas limitadas a SUS propios datos ────────────────
// Suscribe a los documentos de una colección donde driverId == el del chofer.
export function suscribirPorDriver(col, driverId, cb) {
  if (!driverId) { cb([]); return () => {} }
  const q = query(collection(db, col), where('driverId', '==', driverId))
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]))
}
// Suscribe al documento del propio chofer (su ficha en wal_candidatos).
export function suscribirMiFicha(driverId, cb) {
  if (!driverId) { cb(null); return () => {} }
  return onSnapshot(refDoc(COL.candidatos, driverId), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), () => cb(null))
}
// Suscribe a los documentos de agenda de una o varias semanas (sáb→vie). El
// portal del chofer lo usa para armar "Mi horario" leyendo el plan por semana.
// Si no hay permiso (reglas aún sin desplegar) el onSnapshot falla y devuelve []
// sin romper el portal: el chofer simplemente verá "aún sin turnos".
export function suscribirAgendaSemanas(semanas, cb) {
  const ws = [...new Set((semanas || []).filter(Boolean))].slice(0, 10)
  if (!ws.length) { cb([]); return () => {} }
  const q = query(collection(db, COL.agenda), where('semana', 'in', ws))
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]))
}

// Estados operativos del candidato/driver (independientes de otros módulos).
export const ESTADOS = [
  { id: 'candidato', label: 'Candidato', color: 'slate' },
  { id: 'pendiente_doc', label: 'Pendiente de documentación', color: 'amber' },
  { id: 'standby', label: 'Stand-by', color: 'blue' },
  { id: 'activo', label: 'Activo', color: 'green' },
  { id: 'inactivo', label: 'Inactivo', color: 'red' },
  { id: 'archivado', label: 'Archivado', color: 'slate' },
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
  otIngreso: 30, // USD que Walmart paga por cada OT (overtime)
  otPago: 15, // USD que pagamos al driver por cada OT
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

// Pago por ruta de un driver: su tarifa personalizada (rateDriver) si la tiene,
// o la tarifa por defecto según el propietario del vehículo.
export const tarifaDeDriver = (driver, tarifas) => {
  const r = driver?.rateDriver
  if (r != null && r !== '' && !isNaN(Number(r))) return money2(r)
  return money2(driver?.propietarioVehiculo === 'compania' ? tarifas?.pagoDriverCompania : tarifas?.pagoDriverPropio)
}
export const tieneRatePropio = (driver) => driver?.rateDriver != null && driver.rateDriver !== '' && !isNaN(Number(driver.rateDriver))

// Ingreso por ruta que paga Walmart: lo define el ALMACÉN (con tarifa propia),
// o la tarifa por defecto si el almacén no la tiene configurada.
export const ingresoDeAlmacen = (alm, tarifas) => money2(alm?.tarifaWalmart != null && alm.tarifaWalmart !== '' && !isNaN(Number(alm.tarifaWalmart)) ? Number(alm.tarifaWalmart) : tarifas?.ingresoWalmart)

// ── Semana operativa de Walmart: SÁBADO (Día 1) → VIERNES (Día 7) ────────────
// `inicioSemana`/`finSemana`/`lunesDe`/`domingoDe`/`hoyISO` viven en wmcalc.js
// (núcleo puro) y se re-exportan arriba.

export const BLOQUES = [{ id: 'manana', label: 'Mañana' }, { id: 'tarde', label: 'Tarde' }]

// ── AGENDA semanal (asignación de drivers por almacén, día y turno) ──────────
// Turnos con color: mañana = verde, tarde = azul (igual que pidió la operación).
export const AGENDA_TURNOS = [
  { id: 'manana', label: 'Mañana', color: 'green', hex: '#2E9E6B', bg: '#e3f4ec', br: '#bfe4d1', tx: '#1f7a52' },
  { id: 'tarde', label: 'Tarde', color: 'blue', hex: '#2B4C8C', bg: '#eef6ff', br: '#cfe3ff', tx: '#2B4C8C' },
]
export const agendaTurnoInfo = (id) => AGENDA_TURNOS.find((t) => t.id === id) || AGENDA_TURNOS[0]
// Necesidad por turno por defecto (configurable por almacén): 3 mañana, 2 tarde.
export const NECESITA_MANANA_DEF = 3
export const NECESITA_TARDE_DEF = 2
export const necesitaDeAlmacen = (alm) => ({
  manana: alm?.necesitaManana != null ? Number(alm.necesitaManana) : NECESITA_MANANA_DEF,
  tarde: alm?.necesitaTarde != null ? Number(alm.necesitaTarde) : NECESITA_TARDE_DEF,
})
// id determinista del documento de agenda (un doc por almacén y semana).
export const idAgenda = (almacenId, semana) => `ag_${almacenId}_${semana}`.replace(/[^a-zA-Z0-9_]/g, '')
// Plan vacío: para cada día, una lista de driverIds por turno.
export const planAgendaVacio = () => DIAS.reduce((o, d) => { o[d] = { manana: [], tarde: [] }; return o }, {})
// Normaliza un plan (por si falta algún día/turno).
export function planNormalizado(plan) {
  const base = planAgendaVacio()
  if (!plan) return base
  for (const d of DIAS) {
    base[d] = {
      manana: Array.isArray(plan[d]?.manana) ? [...plan[d].manana] : [],
      tarde: Array.isArray(plan[d]?.tarde) ? [...plan[d].tarde] : [],
    }
  }
  return base
}
// Cobertura de un día: cuántos en cada turno y total de drivers únicos.
export function coberturaDia(plan, dia) {
  const p = planNormalizado(plan)[dia]
  const unicos = new Set([...p.manana, ...p.tarde])
  return { manana: p.manana.length, tarde: p.tarde.length, total: unicos.size }
}
// Huecos por turno de un día. `necesita` = { manana, tarde }.
// Devuelve el conteo por turno y cuántos faltan en cada uno.
export function huecosAgenda(plan, dia, necesita) {
  const cob = coberturaDia(plan, dia)
  const nM = Number(necesita?.manana) || 0
  const nT = Number(necesita?.tarde) || 0
  const faltanM = Math.max(0, nM - cob.manana)
  const faltanT = Math.max(0, nT - cob.tarde)
  return { ...cob, faltanM, faltanT, faltan: faltanM + faltanT }
}
export const ESTADOS_RUTA = [
  { id: 'pendiente', label: 'Pendiente', color: 'slate' },
  { id: 'en_progreso', label: 'En progreso', color: 'blue' },
  { id: 'completada', label: 'Completada', color: 'green' },
  { id: 'cancelada', label: 'Cancelada', color: 'red' },
]
export const estadoRutaInfo = (id) => ESTADOS_RUTA.find((e) => e.id === id) || ESTADOS_RUTA[0]

// `money2` vive en wmcalc.js (núcleo puro) y se re-exporta arriba.

// id determinista de ruta (evita duplicar misma almacén+fecha+bloque+driver).
export function idRuta(almacenId, fecha, bloque, driverId) {
  return `r_${almacenId}_${fecha}_${bloque}_${driverId}`.replace(/[^a-zA-Z0-9_]/g, '')
}

// `otIngresoRuta`/`otPagoRuta`/`ingresoRuta`/`gananciaDriver` (y `ajustes`
// interno) viven en wmcalc.js (núcleo puro) y se re-exportan arriba.

// ── Dashboard: series semanales y cuentas por cobrar (net-30) ───────────────
// Devuelve las claves (lunes) de las últimas n semanas que terminan en la
// semana de `fechaRef`.
export function ultimasSemanas(n, fechaRef) {
  const base = new Date(`${lunesDe(fechaRef || hoyISO())}T00:00:00`)
  const out = []
  for (let i = n - 1; i >= 0; i--) { const d = new Date(base); d.setDate(base.getDate() - i * 7); out.push(d.toISOString().slice(0, 10)) }
  return out
}

// Walmart paga NET 30: cada semana se cobra ~30 días después del fin de semana.
// Calcula lo por cobrar por semana, lo vencido (pasó net-30 sin cobrar) y el
// próximo cobro estimado.
export function receivableNet30(rutas, cobros, almId) {
  const enAlm = (a) => !almId || a === almId
  const ingresoPorSemana = {}
  for (const r of rutas || []) { if (r.estado !== 'completada' || !enAlm(r.almacenId)) continue; ingresoPorSemana[r.semana] = money2((ingresoPorSemana[r.semana] || 0) + ingresoRuta(r)) }
  const hoy = new Date()
  let totalPorCobrar = 0, vencido = 0, proximo = null
  const detalle = []
  for (const [sem, ing] of Object.entries(ingresoPorSemana)) {
    const cobrado = money2((cobros || []).filter((c) => c.semana === sem && enAlm(c.almacenId)).reduce((a, c) => a + (Number(c.monto) || 0), 0))
    const pend = money2(ing - cobrado)
    if (pend <= 0.005) continue
    const vence = new Date(`${domingoDe(sem)}T00:00:00`); vence.setDate(vence.getDate() + 30)
    const venceISO = vence.toISOString().slice(0, 10)
    const esVencido = vence < hoy
    totalPorCobrar += pend; if (esVencido) vencido += pend
    if (!esVencido && (!proximo || venceISO < proximo.venceEl)) proximo = { semana: sem, pend, venceEl: venceISO }
    detalle.push({ semana: sem, ingreso: ing, cobrado, pend, venceEl: venceISO, vencido: esVencido })
  }
  return { totalPorCobrar: money2(totalPorCobrar), vencido: money2(vencido), proximo, detalle: detalle.sort((a, b) => a.semana.localeCompare(b.semana)) }
}

// Acumulados históricos de un driver (todas las semanas): ganado, pagado, saldo.
export function acumuladoDriver(rutas, pagos, driverId) {
  const rs = (rutas || []).filter((r) => r.driverId === driverId && r.estado === 'completada')
  const ganado = money2(rs.reduce((a, r) => a + gananciaDriver(r), 0))
  const ps = (pagos || []).filter((p) => p.driverId === driverId)
  const efectivoFP = money2(ps.filter((p) => p.tipo === 'fastpay').reduce((a, p) => a + (Number(p.efectivo) || 0), 0))
  const liquidadoFP = money2(ps.filter((p) => p.tipo === 'fastpay').reduce((a, p) => a + (Number(p.bruto) || 0), 0))
  const pagadoNormal = money2(ps.filter((p) => p.tipo === 'pago').reduce((a, p) => a + (Number(p.monto) || 0), 0))
  const comisiones = money2(ps.filter((p) => p.tipo === 'fastpay').reduce((a, p) => a + (Number(p.comision) || 0), 0))
  return { ganado, liquidadoFP, efectivoFP, pagadoNormal, comisiones, saldo: money2(ganado - liquidadoFP - pagadoNormal), nRutas: rs.length, rutas: rs }
}

// ── Contratos y plantillas ──────────────────────────────────────────────────
export const ESTADOS_CONTRATO = [
  { id: 'borrador', label: 'Borrador', color: 'slate' },
  { id: 'pendiente_firma', label: 'Pendiente de firma', color: 'gold' },
  { id: 'firmado', label: 'Firmado', color: 'green' },
  { id: 'vencido', label: 'Vencido', color: 'red' },
  { id: 'anulado', label: 'Anulado', color: 'slate' },
]
export const estadoContratoInfo = (id) => ESTADOS_CONTRATO.find((e) => e.id === id) || ESTADOS_CONTRATO[0]
// Campos que una plantilla puede autocompletar desde el perfil (NO bancarios).
export const CAMPOS_CONTRATO = [
  { k: 'nombre', l: 'Nombre completo' }, { k: 'direccion', l: 'Dirección' }, { k: 'telefono', l: 'Teléfono' },
  { k: 'correo', l: 'Correo' }, { k: 'almacen', l: 'Almacén' }, { k: 'vehiculo', l: 'Vehículo' },
  { k: 'tarifa', l: 'Tarifa acordada' }, { k: 'fecha', l: 'Fecha del contrato' }, { k: 'fechaInicio', l: 'Fecha de inicio' },
  { k: 'empresa', l: 'Datos de la compañía' },
]
// Reemplaza {{campo}} por su valor; deja {{campo}} si falta (campo obligatorio).
export function renderPlantilla(texto, datos) {
  return String(texto || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (datos[k] != null && datos[k] !== '' ? String(datos[k]) : `{{${k}}}`))
}
export function faltantesPlantilla(texto, datos) {
  const req = [...String(texto || '').matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(req)].filter((k) => datos[k] == null || datos[k] === '')
}
// Token aleatorio para el enlace de firma (no adivinable).
export function tokenAleatorio(n = 28) {
  const a = new Uint8Array(n)
  ;(globalThis.crypto || {}).getRandomValues?.(a)
  return Array.from(a, (b) => (b % 36).toString(36)).join('')
}
// Datos del driver listos para autocompletar una plantilla.
export function datosDeDriver(driver, almacenNombre, empresa, tarifa) {
  return {
    nombre: nombreCompleto(driver), direccion: driver?.direccion || '', telefono: driver?.telefono || '',
    correo: driver?.correo || '', almacen: almacenNombre || '', vehiculo: [driver?.marca, driver?.modelo, driver?.anio].filter(Boolean).join(' ') || driver?.tipoVehiculo || '',
    tarifa: tarifa != null ? `$${money2(tarifa)}` : '', fecha: hoyISO(), fechaInicio: hoyISO(), empresa: empresa || 'Blue Box Logistic LLC',
  }
}

// ── Pagos y Fast Pay ────────────────────────────────────────────────────────
// `METODOS_PAGO`, los estados Fast Pay (ESTADOS_FP, estadoFP, fpLiquida,
// fpBloquea, rutaBloqueadaFP, fpDeRuta, liquidadoFPruta), `resumenSemana`,
// `conciliacionSemana`, `calcularFastPay` y `utilidadFinanciamiento` viven en
// wmcalc.js (núcleo puro, probado con Node) y se re-exportan arriba.

// ── Gastos ──────────────────────────────────────────────────────────────────
export const CATEGORIAS_GASTO = ['Cargo Van (financiamiento)', 'Seguro', 'Gasolina', 'Reparación', 'Mantenimiento', 'Renta', 'Nómina', 'Suministros', 'Otro']

// Gastos FIJOS recurrentes: a partir de cada plantilla (semanal/mensual) calcula
// qué INSTANCIAS de gasto faltan por crear, desde su `desde` hasta HOY (o `hasta`).
// Id determinista `gf_<plantilla>_<período>` → idempotente (no duplica, y si
// editas una instancia generada no se sobreescribe porque solo se crea si falta).
export function pendientesGastosFijos(fijos, gastos, hoy = hoyISO()) {
  const existentes = new Set((gastos || []).map((g) => g.id))
  const out = []
  for (const f of (fijos || [])) {
    if (f.activo === false) continue
    const monto = money2(f.monto)
    if (monto <= 0 || !f.desde) continue
    const fin = f.hasta && f.hasta < hoy ? f.hasta : hoy
    if (fin < f.desde) continue
    const comun = { categoria: f.categoria || 'Otro', concepto: f.concepto || '', monto, tipo: 'fijo', esFinanciamiento: !!f.esFinanciamiento, almacenId: f.almacenId || '', driverId: f.driverId || '', fijoId: f.id, auto: true }
    if (f.frecuencia === 'semanal') {
      let w = lunesDe(f.desde); const wFin = lunesDe(fin); let guard = 0
      while (w <= wFin && guard++ < 520) {
        const id = `gf_${f.id}_${w}`
        if (!existentes.has(id)) out.push({ id, data: { ...comun, fecha: w, semana: w } })
        w = lunesDe(sumarDias(w, 7))
      }
    } else {
      const dia = Math.min(Math.max(1, Number(f.diaMes) || 1), 28)
      let ym = mesDe(f.desde); const ymFin = mesDe(fin); let guard = 0
      while (ym <= ymFin && guard++ < 240) {
        if (f.repartirSemanas) {
          // Reparte el monto del mes entre sus semanas (suma exacta = monto/mes).
          for (const parte of distribuirMensual(monto, primerDiaMes(ym), ultimoDiaMes(ym))) {
            if (!(parte.monto > 0)) continue
            const id = `gf_${f.id}_${ym}_${parte.semana}`
            if (!existentes.has(id)) out.push({ id, data: { ...comun, fecha: parte.semana, semana: parte.semana, monto: parte.monto } })
          }
        } else {
          const id = `gf_${f.id}_${ym}`
          if (!existentes.has(id)) out.push({ id, data: { ...comun, fecha: `${ym}-${String(dia).padStart(2, '0')}` } })
        }
        const [y, m] = ym.split('-').map(Number); const nd = new Date(y, m, 1)
        ym = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`
      }
    }
  }
  return out
}

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
  return lunesDe(g.fecha) === semana ? money2(g.monto) : 0
}

// ── Resumen financiero de una semana (opcionalmente filtrado por almacén) ────
// Fast Pay: la ganancia del driver ANTES de FP es el costo; la comisión es
// ingreso SEPARADO (no se reduce el costo por la comisión).
export function financieroSemana(rutas, pagos, gastos, cobros, semana, almacenId) {
  const enAlm = (aId) => !almacenId || aId === almacenId
  const rs = (rutas || []).filter((r) => lunesDe(r.fecha) === semana && r.estado === 'completada' && enAlm(r.almacenId))
  const ingresoRutas = money2(rs.reduce((a, r) => a + ingresoRuta(r), 0))
  const costoDrivers = money2(rs.reduce((a, r) => a + gananciaDriver(r), 0))
  const margen = money2(ingresoRutas - costoDrivers)
  const driversAlm = new Set(rs.map((r) => r.driverId))
  const ps = (pagos || []).filter((p) => p.semana === semana && (!almacenId || driversAlm.has(p.driverId)))
  const comisionesFP = money2(ps.filter(fpLiquida).reduce((a, p) => a + (Number(p.comision) || 0), 0))
  const efectivoFP = money2(ps.filter(fpLiquida).reduce((a, p) => a + (Number(p.efectivo) || 0), 0))
  const pagosNormales = money2(ps.filter((p) => p.tipo === 'pago').reduce((a, p) => a + (Number(p.monto) || 0), 0))
  const gs = (gastos || []).filter((g) => enAlm(g.almacenId) || !g.almacenId)
  let gastosOper = 0, gastoFinanc = 0, gastosPagados = 0
  for (const g of gs) {
    const m = gastoEnSemana(g, semana)
    if (m) { if (g.esFinanciamiento) gastoFinanc += m; else gastosOper += m }
    if (g.estadoPago === 'pagado' && lunesDe(g.fechaPago || g.fecha) === semana) gastosPagados += Number(g.monto) || 0
  }
  gastosOper = money2(gastosOper); gastoFinanc = money2(gastoFinanc); gastosPagados = money2(gastosPagados)
  const resultadoOperativo = money2(margen - gastosOper + comisionesFP)
  const cobrado = money2((cobros || []).filter((c) => lunesDe(c.fecha) === semana && enAlm(c.almacenId)).reduce((a, c) => a + (Number(c.monto) || 0), 0))
  const porCobrar = money2(ingresoRutas - cobrado)
  const efectivoADrivers = money2(efectivoFP + pagosNormales)
  // Bonos agregados a las rutas (extra al driver/ruta) del período.
  const bonosTotal = money2(rs.reduce((a, r) => a + (Array.isArray(r.bonos) ? r.bonos.reduce((x, b) => x + (Number(b.monto) || 0), 0) : 0), 0))
  // Flujo de caja = SOLO los gastos del período + los bonos. No incluye Fast Pay
  // ni los pagos regulares a choferes.
  const flujoCaja = money2(gastosOper + gastoFinanc + bonosTotal)
  // Utilidad neta = resultado operativo MENOS lo que también sale (financiamiento
  // de las Cargo Vans + bonos a choferes). Es "lo que realmente te queda".
  const utilidadNeta = money2(resultadoOperativo - gastoFinanc - bonosTotal)
  return { ingresoRutas, costoDrivers, margen, gastosOper, gastoFinanc, comisionesFP, efectivoFP, pagosNormales, resultadoOperativo, utilidadNeta, cobrado, porCobrar, efectivoADrivers, gastosPagados, bonosTotal, flujoCaja, nRutas: rs.length }
}

// Financiero de un RANGO de fechas: suma las semanas (lunes) que lo cruzan.
export function financieroRango(rutas, pagos, gastos, cobros, desde, hasta, almacenId) {
  const campos = ['ingresoRutas', 'costoDrivers', 'margen', 'gastosOper', 'gastoFinanc', 'comisionesFP', 'efectivoFP', 'pagosNormales', 'resultadoOperativo', 'utilidadNeta', 'cobrado', 'porCobrar', 'efectivoADrivers', 'gastosPagados', 'bonosTotal', 'flujoCaja', 'nRutas']
  const acc = Object.fromEntries(campos.map((k) => [k, 0]))
  let w = lunesDe(desde); const fin = lunesDe(hasta); let guard = 0
  while (w <= fin && guard < 400) {
    const f = financieroSemana(rutas, pagos, gastos, cobros, w, almacenId)
    for (const k of campos) acc[k] = money2(acc[k] + (f[k] || 0))
    const d = new Date(`${w}T00:00:00`); d.setDate(d.getDate() + 7); w = d.toISOString().slice(0, 10); guard++
  }
  return acc
}

// `utilidadFinanciamiento` vive en wmcalc.js (núcleo puro) y se re-exporta arriba.

// ── Fechas de mes / rango y facturación ──────────────────────────────────────
export const mesDe = (fechaISO) => (fechaISO || hoyISO()).slice(0, 7) // 'YYYY-MM'
export const primerDiaMes = (ym) => `${ym}-01`
export function ultimoDiaMes(ym) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m, 0); return `${ym}-${String(d.getDate()).padStart(2, '0')}` }
export function sumarDias(fechaISO, n) { const d = new Date(`${fechaISO}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
export const nombreMes = (ym) => { try { return new Date(`${ym}-01T00:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) } catch { return ym } }
export const idFactura = (periodo) => `WM-${String(periodo || '').replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

// Factura del período: líneas por almacén (rutas completadas × tarifa Walmart).
export function facturaDelPeriodo(rutas, desde, hasta, almacenId, almacenes) {
  const rs = (rutas || []).filter((r) => r.estado === 'completada' && r.fecha >= desde && r.fecha <= hasta && (!almacenId || r.almacenId === almacenId))
  const alm = (id) => (almacenes || []).find((a) => a.id === id)
  const nombre = (id) => alm(id)?.nombre || 'General'
  // Desglose por ALMACÉN (con su número de DC si está configurado).
  const porAlm = {}
  for (const r of rs) { const k = r.almacenId || '—'; if (!porAlm[k]) porAlm[k] = { rutas: 0, importe: 0 }; porAlm[k].rutas += 1; porAlm[k].importe += ingresoRuta(r) }
  const lineas = Object.entries(porAlm).map(([id, v]) => ({ almacenId: id, nombre: nombre(id), numeroDC: String(alm(id)?.numeroDC || '').trim(), rutas: v.rutas, importe: money2(v.importe), tarifaProm: v.rutas ? money2(v.importe / v.rutas) : 0 })).sort((a, b) => b.importe - a.importe)
  // Resumen por CHOFER (nombre, almacén, rutas, importe).
  const porDrv = {}
  for (const r of rs) {
    const k = r.driverId || r.driverNombre || '—'
    if (!porDrv[k]) porDrv[k] = { nombre: r.driverNombre || '—', almacenId: r.almacenId || '', rutas: 0, importe: 0 }
    porDrv[k].rutas += 1; porDrv[k].importe += ingresoRuta(r)
  }
  const porDriver = Object.values(porDrv).map((d) => ({ nombre: d.nombre, almacen: nombre(d.almacenId), rutas: d.rutas, importe: money2(d.importe) })).sort((a, b) => b.importe - a.importe)
  const total = money2(lineas.reduce((a, l) => a + l.importe, 0))
  return { lineas, porDriver, total, totalRutas: rs.length }
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

// Borra una ruta y, si su día estaba cerrado, recalcula el resumen del cierre
// con las rutas que quedan (no reabre el día; solo lo actualiza).
export async function borrarRutaActualizandoCierre(ruta, rutasDelDia) {
  await deleteDoc(refDoc(COL.rutas, ruta.id))
  if (ruta.cerrada && ruta.cierreId) {
    const rest = (rutasDelDia || []).filter((r) => r.id !== ruta.id)
    const completadas = rest.filter((r) => r.estado === 'completada')
    const canceladas = rest.filter((r) => r.estado === 'cancelada')
    const pendientes = rest.filter((r) => r.estado === 'pendiente' || r.estado === 'en_progreso')
    const resumen = {
      registradas: rest.length, completadas: completadas.length, canceladas: canceladas.length, pendientes: pendientes.length,
      drivers: new Set(rest.map((r) => r.driverId)).size,
      ingresoWM: money2(rest.reduce((a, r) => a + ingresoRuta(r), 0)),
      gananciaDrv: money2(rest.reduce((a, r) => a + gananciaDriver(r), 0)),
    }
    await setDoc(refDoc(COL.cierres, ruta.cierreId), { resumen, actualizadoEn: serverTimestamp() }, { merge: true })
  }
  await auditar('ruta_borrada', `${ruta.id}${ruta.cerrada ? ' (día cerrado · cierre actualizado)' : ''}`)
}
