// ============================================================================
// BULK · Modo test — generador de datos ficticios coherentes.
// Crea un catálogo completo (materiales, equipos, transportistas, clientes,
// plantas, geocercas, tarifas, jobs), ~50 órdenes en TODAS las etapas del ciclo
// de vida (cola → activas → entregadas/liberadas/cerradas) con hitos y horas
// realistas, recorridos GPS, facturas, documentos por vencer e incidencias.
//
// Cada documento lleva `demo: true`. `borrarDemo` solo elimina esos documentos,
// así que NUNCA toca datos reales del tenant.
// ============================================================================
import { crear, crearConId, crearLote, listar, eliminar, guardar, where } from './repo'
import { ORDEN_ESTADO as E } from '../domain/constants'
import { escribirPreciosBase, asignarPagos } from './ordenPagos'

// ---- utilidades -----------------------------------------------------------
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1))
const iso = (d) => d.toISOString()
const lerp = (a, b, t) => a + (b - a) * t
const jitter = () => (Math.random() - 0.5) * 0.0018
const minsAfter = (base, mins) => new Date(base.getTime() + mins * 60000)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d }
const atHour = (d, h) => { const x = new Date(d); x.setHours(h, randInt(0, 59), 0, 0); return x }
const fechaEnDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

// Precio según material (motor de tarifas coherente: cliente → transportista → chofer)
const RATE = { Arena: 19, Piedra: 21, Grava: 22, Tierra: 16, Concreto: 34, Asfalto: 40, 'Material reciclado': 14 }
const precioDe = (ton, material) => {
  const precioCliente = r2(ton * (RATE[material] || 20))
  const precioTransportista = r2(precioCliente * 0.72)
  return { precioCliente, precioTransportista, pagoChofer: r2(precioTransportista * 0.8) }
}

// Hitos (con hora automática) según hasta qué etapa llegó la orden.
const HITO_SEQ = ['tomada', 'llegadaPlanta', 'carga', 'salidaPlanta', 'llegadaDestino', 'entrega', 'liberacion', 'cierre']
const HITO_OFFSET = [0, 25, 42, 55, 105, 120, 140, 165] // minutos desde que la tomó
const ETAPA_HASTA = {
  [E.CREADA]: -1, [E.EN_COLA]: -1, [E.NOTIFICANDO]: -1, [E.ACEPTADA]: 0,
  [E.EN_PLANTA]: 1, [E.CARGANDO]: 2, [E.EN_RUTA]: 3, [E.EN_DESTINO]: 4,
  [E.ENTREGADA]: 5, [E.LIBERADA]: 6, [E.CERRADA]: 7,
}
const hitosPara = (estado, base) => {
  const hasta = ETAPA_HASTA[estado] ?? -1
  const h = {}
  for (let i = 0; i <= hasta; i++) h[HITO_SEQ[i]] = iso(minsAfter(base, HITO_OFFSET[i]))
  return h
}
const geoEventosDe = (hitos, plantaNombre, destNombre) => {
  const ev = []
  if (hitos.llegadaPlanta) ev.push({ evento: 'entrada', geocerca: plantaNombre, ts: hitos.llegadaPlanta })
  if (hitos.salidaPlanta) ev.push({ evento: 'salida', geocerca: plantaNombre, ts: hitos.salidaPlanta })
  if (hitos.llegadaDestino) ev.push({ evento: 'entrada', geocerca: destNombre, ts: hitos.llegadaDestino })
  return ev
}

const CHOFERES = ['Juan Pérez', 'Miguel Torres', 'Carlos Ruiz', 'Luis Gómez', 'Pedro Sánchez', 'José Martínez']

// Destinos (obras) para recorridos y eventos de geocerca.
const DESTINOS = [
  { nombre: 'Obra Downtown Dallas', direccion: '1500 Main St, Dallas, TX', lat: 32.7810, lng: -96.7970 },
  { nombre: 'Proyecto Grand Pkwy', direccion: '9000 Grand Pkwy, Katy, TX', lat: 29.8000, lng: -95.6000 },
  { nombre: 'Autopista Denton FM', direccion: 'FM 1173 & I-35, Denton, TX', lat: 33.1900, lng: -97.0900 },
  { nombre: 'Puerto Houston Fase 2', direccion: '2000 Port Rd, Houston, TX', lat: 29.7200, lng: -95.2300 },
]

// ============================================================================
export async function sembrarDemo(tenantId, onProgress = () => {}) {
  const log = (m) => onProgress(m)
  const conteo = {}

  // 1) Catálogos base ---------------------------------------------------------
  log('Materiales y tipos de equipo…')
  const materiales = [
    { nombre: 'Arena', unidad: 'ton', equipos: ['End Dump', 'Side Dump'] }, { nombre: 'Piedra', unidad: 'ton', equipos: ['Belly Dump'] }, { nombre: 'Grava', unidad: 'ton', equipos: ['End Dump', 'Dump Truck'] },
    { nombre: 'Tierra', unidad: 'ton', equipos: ['Dump Truck'] }, { nombre: 'Concreto', unidad: 'ton', equipos: ['Concrete Mixer'] }, { nombre: 'Asfalto', unidad: 'ton', equipos: ['End Dump'] },
    { nombre: 'Material reciclado', unidad: 'ton', equipos: ['Dump Truck', 'End Dump'] },
    // El equipo (espejo `equipo`) queda con el primero para compatibilidad con lectores antiguos.
  ].map((m) => ({ ...m, equipo: m.equipos[0], precio: RATE[m.nombre] || 20, activo: true, demo: true }))
  await crearLote('materials', tenantId, materiales)
  const equipos = ['End Dump', 'Belly Dump', 'Dump Truck', 'Concrete Mixer', 'Flatbed', 'Lowboy', 'Side Dump']
    .map((nombre) => ({ nombre, activo: true, demo: true }))
  await crearLote('equipment', tenantId, equipos)
  conteo.materiales = materiales.length; conteo.equipos = equipos.length

  // 2) Transportistas ---------------------------------------------------------
  log('Transportistas…')
  const carriersDef = [
    { nombre: 'Transportes Rápidos LLC', contacto: '214-555-0110', equipos: ['End Dump', 'Dump Truck'], calificacion: 4.6 },
    { nombre: 'Fletes del Golfo', contacto: '713-555-0143', equipos: ['Belly Dump', 'End Dump'], calificacion: 4.2 },
    { nombre: 'Aguilar Hauling', contacto: '469-555-0177', equipos: ['Dump Truck', 'Side Dump'], calificacion: 4.8 },
    { nombre: 'TX Heavy Move', contacto: '832-555-0190', equipos: ['Lowboy', 'Flatbed'], calificacion: 4.0 },
    { nombre: 'Concretos Express', contacto: '214-555-0200', equipos: ['Concrete Mixer'], calificacion: 4.5 },
  ]
  const carriers = []
  for (let i = 0; i < carriersDef.length; i++) {
    const c = carriersDef[i]
    // 2 choferes por transporte (guardados en el propio documento del transporte).
    const choferes = [CHOFERES[(i * 2) % CHOFERES.length], CHOFERES[(i * 2 + 1) % CHOFERES.length]]
      .map((nombre, k) => { const eq = c.equipos[k % c.equipos.length]; return { id: `d_${i}${k}`, nombre, telefono: `214-555-0${100 + i * 2 + k}`, licencia: `TX-${10000 + i * 2 + k}`, equipo: eq, equipos: [eq], activo: true } })
    carriers.push(await crear('carriers', tenantId, { ...c, choferes, activo: true, demo: true }))
  }
  conteo.transportistas = carriers.length
  const compatCarriers = (tipo) => carriers.filter((c) => c.equipos.map((e) => e.toLowerCase()).includes(tipo.toLowerCase())).map((c) => c.id)

  // 3) Clientes y plantas -----------------------------------------------------
  log('Clientes y plantas…')
  const clientesDef = [
    { nombre: 'Constructora Álamo', rfc: 'CAL120345', contacto: 'compras@alamo.com', facturacion: 'Net 30' },
    { nombre: 'Grupo Terracon', rfc: 'GTE980112', contacto: 'ap@terracon.mx', facturacion: 'Net 15' },
    { nombre: 'Obras del Norte', rfc: 'ODN450987', contacto: 'admin@obrasnorte.com', facturacion: 'Net 30' },
    { nombre: 'Cemex Regional', rfc: 'CEM770654', contacto: 'pagos@cemexreg.com', facturacion: 'Net 45' },
  ]
  const clientes = []
  for (const c of clientesDef) clientes.push(await crear('clients', tenantId, { ...c, activo: true, demo: true }))
  conteo.clientes = clientes.length

  const plantasDef = [
    { ci: 0, nombre: 'Planta Trinity', direccion: '1200 Riverfront Blvd, Dallas, TX', gps: { lat: 32.7720, lng: -96.8090 }, horario: '6am–5pm', materiales: ['Arena', 'Grava'] },
    { ci: 0, nombre: 'Patio Irving', direccion: '500 W Irving Blvd, Irving, TX', gps: { lat: 32.8140, lng: -96.9489 }, horario: '7am–4pm', materiales: ['Asfalto', 'Material reciclado'] },
    { ci: 1, nombre: 'Planta Ship Channel', direccion: '8600 Clinton Dr, Houston, TX', gps: { lat: 29.7460, lng: -95.2670 }, horario: '6am–6pm', materiales: ['Piedra'] },
    { ci: 2, nombre: 'Cantera Denton', direccion: '3900 N I-35, Denton, TX', gps: { lat: 33.2148, lng: -97.1331 }, horario: '6am–4pm', materiales: ['Grava', 'Tierra'] },
    { ci: 3, nombre: 'Planta Baytown', direccion: '4500 Bayway Dr, Baytown, TX', gps: { lat: 29.7355, lng: -94.9774 }, horario: '24 h', materiales: ['Concreto'] },
    { ci: 3, nombre: 'Planta Katy', direccion: '2100 Katy Fwy, Katy, TX', gps: { lat: 29.7858, lng: -95.8245 }, horario: '6am–5pm', materiales: ['Concreto', 'Arena'] },
  ]
  const plantas = []
  for (let pi = 0; pi < plantasDef.length; pi++) {
    const p = plantasDef[pi]
    const ofertas = p.materiales.map((m, k) => ({ material: m, precio: RATE[m] || 20, po: `PO-P${pi}${k}` }))
    plantas.push(await crear('plants', tenantId, {
      clienteId: clientes[p.ci].id, nombre: p.nombre, direccion: p.direccion, gps: p.gps,
      horario: p.horario, materiales: p.materiales, ofertas, activo: true, demo: true,
    }))
  }
  conteo.plantas = plantas.length

  // 4) Geocercas (de plantas + destinos) -------------------------------------
  log('Geocercas…')
  const geoPlantas = plantas.map((p, i) => ({ nombre: p.nombre, tipo: 'planta', lat: plantasDef[i].gps.lat, lng: plantasDef[i].gps.lng, radio: 200, plantaId: p.id, demo: true }))
  const geoDest = DESTINOS.map((d) => ({ nombre: d.nombre, tipo: 'destino', lat: d.lat, lng: d.lng, radio: 250, demo: true }))
  await crearLote('geofences', tenantId, [...geoPlantas, ...geoDest])
  conteo.geocercas = geoPlantas.length + geoDest.length

  // 5) Motor de tarifas -------------------------------------------------------
  log('Reglas de tarifa…')
  const tarifasDef = [
    { nombre: 'General por tonelada', tipo: 'por_tonelada', valor: 20, condiciones: {}, prioridad: 0 },
    { nombre: 'Concreto premium', tipo: 'por_tonelada', valor: 34, condiciones: { material: 'Concreto' }, prioridad: 5 },
    { nombre: 'Asfalto', tipo: 'por_tonelada', valor: 40, condiciones: { material: 'Asfalto' }, prioridad: 5 },
    { nombre: 'Cliente Cemex (por viaje)', tipo: 'por_viaje', valor: 520, condiciones: { clienteId: clientes[3].id }, prioridad: 8, recargoUrgencia: 0.15 },
    { nombre: 'Grava Álamo', tipo: 'por_tonelada', valor: 22, condiciones: { material: 'Grava', clienteId: clientes[0].id }, prioridad: 10 },
  ]
  for (const t of tarifasDef) {
    await crear('tariffs', tenantId, {
      nombre: t.nombre, tipo: t.tipo, valor: t.valor, condiciones: t.condiciones,
      pctTransportista: 0.72, pctChofer: 0.8, recargoUrgencia: t.recargoUrgencia ?? null,
      prioridad: t.prioridad, activo: true, demo: true,
    })
  }
  conteo.tarifas = tarifasDef.length

  // 6) Jobs -------------------------------------------------------------------
  log('Trabajos (jobs)…')
  const jobsDef = [
    { nombre: 'Relleno Trinity Fase 1', ci: 0, pi: 0, tipoEquipo: 'End Dump', materiales: ['Arena', 'Grava'], dest: 0 },
    { nombre: 'Base Ship Channel', ci: 1, pi: 2, tipoEquipo: 'Belly Dump', materiales: ['Piedra'], dest: 3 },
    { nombre: 'Terracería Denton', ci: 2, pi: 3, tipoEquipo: 'Dump Truck', materiales: ['Grava', 'Tierra'], dest: 2 },
    { nombre: 'Colado Baytown', ci: 3, pi: 4, tipoEquipo: 'Concrete Mixer', materiales: ['Concreto'], dest: 1 },
    { nombre: 'Repavimentación Irving', ci: 0, pi: 1, tipoEquipo: 'Dump Truck', materiales: ['Asfalto', 'Material reciclado'], dest: 0 },
  ]
  const jobs = []
  for (let i = 0; i < jobsDef.length; i++) {
    const j = jobsDef[i]
    const codigo = 'J' + (1001 + i).toString(36).toUpperCase()
    jobs.push(await crear('jobs', tenantId, {
      codigo, nombre: j.nombre, clienteId: clientes[j.ci].id, plantaId: plantas[j.pi].id,
      tipoEquipo: j.tipoEquipo, materiales: j.materiales, destino: DESTINOS[j.dest].direccion, po: `PO-${2500 + i}`,
      transportistasAutorizados: compatCarriers(j.tipoEquipo), activo: true, demo: true,
    }))
  }
  conteo.jobs = jobs.length

  // 7) Órdenes en todas las etapas -------------------------------------------
  log('Órdenes (cola, activas, entregadas)…')
  const buildOrder = (jIdx, seq, estado, urgente = false, tie = null) => {
    const job = jobs[jIdx], jd = jobsDef[jIdx]
    const material = pick(jd.materiales)
    const ton = r2(randInt(180, 250) / 10) // 18.0–25.0
    const compatibles = compatCarriers(jd.tipoEquipo)
    const carrierId = tie ? tie.carrierId : (compatibles.length ? pick(compatibles) : null)
    const chofer = tie ? tie.choferNombre : pick(CHOFERES)
    const asignado = ![E.CREADA, E.EN_COLA].includes(estado)
    const activo = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO].includes(estado)
    const terminado = [E.ENTREGADA, E.LIBERADA, E.CERRADA].includes(estado)
    const base = terminado ? atHour(daysAgo(randInt(1, 14)), 7) : new Date(Date.now() - 3 * 3600000)
    const hitos = (activo || terminado) ? hitosPara(estado, base) : {}
    const plantGps = plantasDef[jd.pi].gps
    const dest = DESTINOS[jd.dest]
    const o = {
      numero: `${job.codigo}-${String(seq).padStart(4, '0')}`,
      jobId: job.id, clienteId: job.clienteId, plantaId: job.plantaId,
      direccionEntrega: dest.direccion, po: `PO-${2500 + jIdx}`,
      material, tipoEquipo: tie?.equipo || jd.tipoEquipo,
      pesoEstimado: Math.min(25, ton), pesoReal: terminado ? ton : null,
      transportistaId: asignado ? carrierId : null,
      choferId: tie?.choferId ?? null, choferNombre: (activo || terminado) ? chofer : null,
      estado, urgente, hitos, demo: true,
      ...precioDe(ton, material),
    }
    if (activo || terminado) o.geoEventos = geoEventosDe(hitos, plantasDef[jd.pi].nombre, dest.nombre)
    // Una orden ENTREGADA espera liberación: debe traer su código (el supervisor
    // lo muestra y el chofer lo teclea). Sin él, la demo quedaba atascada.
    if (estado === E.ENTREGADA) o.codigoLiberacion = String(randInt(1000, 9999))
    if (activo) {
      const t = estado === E.EN_RUTA ? 0.6 : estado === E.EN_DESTINO ? 0.95 : 0.05
      o.ultimaPos = { lat: lerp(plantGps.lat, dest.lat, t), lng: lerp(plantGps.lng, dest.lng, t), speed: estado === E.EN_RUTA ? 58 : 0, ts: iso(new Date()) }
    }
    return o
  }

  const orders = []
  for (let j = 0; j < jobs.length; j++) {
    let seq = 1
    orders.push(buildOrder(j, seq++, E.CREADA))
    orders.push(buildOrder(j, seq++, E.NOTIFICANDO, Math.random() < 0.3))
    orders.push(buildOrder(j, seq++, E.EN_PLANTA))
    orders.push(buildOrder(j, seq++, E.EN_RUTA))
    const nFin = randInt(5, 7)
    const finales = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
    for (let k = 0; k < nFin; k++) orders.push(buildOrder(j, seq++, pick(finales)))
  }
  // Dos órdenes LIGADAS a choferes concretos (los que quedan en línea abajo):
  //   · una EN RUTA (chofer ocupado, aparece en "En proceso")
  //   · una ENTREGADA (el chofer acaba de entregar y vuelve a "en línea")
  const dOcup = carriers[0]?.choferes?.[0]
  const dEntreg = carriers[0]?.choferes?.[1]
  if (dOcup) orders.push(buildOrder(0, 90, E.EN_RUTA, false, { carrierId: carriers[0].id, choferId: dOcup.id, choferNombre: dOcup.nombre, equipo: carriers[0].equipos[0] }))
  if (dEntreg) orders.push(buildOrder(0, 91, E.ENTREGADA, false, { carrierId: carriers[0].id, choferId: dEntreg.id, choferNombre: dEntreg.nombre, equipo: carriers[0].equipos[0] }))
  // Una orden en cola cuyo equipo (Concrete Mixer) NO tiene chofer en línea →
  // se queda "esperando chofer en línea compatible" (sin emparejar).
  orders.push(buildOrder(0, 92, E.CREADA, false, { equipo: 'Concrete Mixer' }))
  // Una orden CANCELADA (para poblar el historial de canceladas).
  orders.push({ ...buildOrder(0, 93, E.CANCELADA), cancelacion: { por: 'Dispatch', motivo: 'Cliente canceló', ts: iso(daysAgo(1)) } })
  // Aislamiento financiero: la orden se guarda SIN precios (igual que en producción,
  // Jobs.jsx). Los importes van a los docs de pago por audiencia (bulk_orderPay_*),
  // así un transportista/chofer/cliente demo nunca lee un margen ajeno del doc de la
  // orden. Los precios se reatan EN MEMORIA para la lógica demo (facturas), no al doc.
  const sinPrecio = orders.map(({ precioCliente, precioTransportista, pagoChofer, ...rest }) => rest)
  const ordersCreados = await crearLote('orders', tenantId, sinPrecio)
  ordersCreados.forEach((o, i) => { o.precioCliente = orders[i].precioCliente; o.precioTransportista = orders[i].precioTransportista; o.pagoChofer = orders[i].pagoChofer })
  // Proyecta importes a los 3 pay-docs y fija el dueño de las órdenes ya asignadas.
  await Promise.all(ordersCreados.map((o) => escribirPreciosBase(tenantId, o)))
  await Promise.all(ordersCreados
    .filter((o) => o.transportistaId || o.choferId)
    .map((o) => asignarPagos(tenantId, o.id, { transportistaId: o.transportistaId, choferId: o.choferId, pagoChofer: o.pagoChofer, numero: o.numero })))
  conteo.ordenes = ordersCreados.length

  // 8) Recorridos GPS de las órdenes en ruta ---------------------------------
  log('Recorridos GPS…')
  const enRuta = ordersCreados.filter((o) => o.estado === E.EN_RUTA).slice(0, 3)
  const tps = []
  for (const o of enRuta) {
    const jIdx = jobs.findIndex((j) => j.id === o.jobId)
    const pg = plantasDef[jobsDef[jIdx].pi].gps
    const dest = DESTINOS[jobsDef[jIdx].dest]
    const n = 14
    const start = Date.now() - 42 * 60000
    for (let i = 0; i <= n; i++) {
      const t = i / n
      tps.push({
        orderId: o.id, lat: lerp(pg.lat, dest.lat, t) + jitter(), lng: lerp(pg.lng, dest.lng, t) + jitter(),
        speed: (i === 0 || i === n) ? 0 : randInt(45, 65), ts: iso(new Date(start + i * 3 * 60000)), demo: true,
      })
    }
  }
  if (tps.length) await crearLote('trackpoints', tenantId, tps)
  conteo.puntosGps = tps.length

  // 9) Facturas (de órdenes entregadas por cliente) --------------------------
  log('Facturas…')
  const entregadas = ordersCreados.filter((o) => [E.ENTREGADA, E.LIBERADA, E.CERRADA].includes(o.estado))
  const porCliente = {}
  for (const o of entregadas) (porCliente[o.clienteId] = porCliente[o.clienteId] || []).push(o)
  const idsFactura = Object.keys(porCliente).slice(0, 3)
  let nf = 0
  for (const cid of idsFactura) {
    const os = porCliente[cid]
    const lineas = os.map((o) => ({ orderId: o.id, numero: o.numero, material: o.material, ton: r2(o.pesoReal ?? o.pesoEstimado), precio: r2(o.precioCliente), fecha: o.hitos?.entrega || null }))
    const total = r2(lineas.reduce((a, l) => a + l.precio, 0))
    const toneladas = r2(lineas.reduce((a, l) => a + l.ton, 0))
    const cliente = clientes.find((c) => c.id === cid)
    await crear('invoices', tenantId, {
      numero: `FAC-DEMO-${1001 + nf}`, clienteId: cid, clienteNombre: cliente.nombre,
      desde: fechaEnDias(-30), hasta: fechaEnDias(0), lineas, total, toneladas,
      estado: pick(['enviada', 'firmada', 'pagada']), ts: iso(new Date()), demo: true,
    })
    nf++
  }
  conteo.facturas = nf

  // 10) Documentos (algunos vencidos / por vencer / vigentes) ----------------
  log('Documentos y vencimientos…')
  const docs = []
  carriers.forEach((c, i) => {
    docs.push({ carrierId: c.id, tipo: 'Seguro', numero: 'INS-' + (1000 + i), vence: fechaEnDias(i % 2 ? -12 : 220), demo: true })
    docs.push({ carrierId: c.id, tipo: 'DOT', numero: 'DOT-' + (2000 + i), vence: fechaEnDias(12 + i), demo: true })
    docs.push({ carrierId: c.id, tipo: 'Licencia', numero: 'LIC-' + (3000 + i), vence: fechaEnDias(400), demo: true })
  })
  await crearLote('documents', tenantId, docs)
  conteo.documentos = docs.length

  // 11) Incidencias -----------------------------------------------------------
  log('Incidencias…')
  const num = (i) => ordersCreados[i]?.numero || ''
  const incs = [
    { tipo: 'retraso', orden: num(2), descripcion: 'Tráfico en I-45 retrasó la entrega ~40 min.', responsable: 'Miguel Torres', estado: 'resuelta', seguimiento: [{ nota: 'Se avisó al cliente y se reprogramó.', por: 'Dispatch', ts: iso(daysAgo(2)) }] },
    { tipo: 'daño', orden: num(5), descripcion: 'Daño menor en la lona del End Dump.', responsable: 'Taller', estado: 'en_proceso', seguimiento: [] },
    { tipo: 'accidente', orden: '', descripcion: 'Ponchadura en llanta trasera, sin lesionados.', responsable: 'Carlos Ruiz', estado: 'abierta', seguimiento: [] },
    { tipo: 'otro', orden: '', descripcion: 'Cliente pidió cambiar el horario de descarga.', responsable: 'Ventas', estado: 'resuelta', seguimiento: [] },
    { tipo: 'retraso', orden: num(12), descripcion: 'Báscula de planta fuera de servicio 1 h.', responsable: 'Planta Trinity', estado: 'en_proceso', seguimiento: [] },
  ]
  for (const it of incs) {
    await crear('incidents', tenantId, { ...it, fotos: [], ts: iso(daysAgo(randInt(0, 5))), creadaPor: 'Modo test', demo: true })
  }
  conteo.incidencias = incs.length

  // 12) Choferes EN LÍNEA (presencia) — para ver el emparejamiento automático
  // sin abrir una segunda sesión. Se les ofrece una orden en cola compatible y
  // titilan con el contador de 2:00 en la pantalla "Órdenes / Cola".
  log('Choferes en línea…')
  const ahoraD = new Date()
  const minsAtras = (m) => iso(new Date(ahoraD.getTime() - m * 60000))
  // Latido muy adelantado para que la presencia demo no caduque durante la sesión.
  const latidoDemo = iso(new Date(ahoraD.getTime() + 365 * 24 * 3600000))
  const ordenEnRuta = ordersCreados.find((o) => dOcup && o.choferId === dOcup.id && o.estado === E.EN_RUTA)
  const enLineaDef = [
    { ci: 0, di: 0, mins: 15, estado: 'ocupado', ordenId: ordenEnRuta?.id || null }, // en una orden EN RUTA
    { ci: 1, di: 0, mins: 7, estado: 'libre' },  // Fletes del Golfo (Belly Dump)
    { ci: 2, di: 0, mins: 3, estado: 'libre' },  // Aguilar Hauling (Dump Truck)
    { ci: 0, di: 1, mins: 1, estado: 'libre' },  // Transportes Rápidos · 2º chofer (acaba de entregar → en línea)
  ]
  let nPres = 0
  for (const p of enLineaDef) {
    const c = carriers[p.ci]; const d = c?.choferes?.[p.di]
    if (!c || !d) continue
    // El id del doc DEBE ser el uid del chofer (así reservar/liberar lo encuentran).
    await crearConId('presence', d.id, tenantId, {
      uid: d.id, nombre: d.nombre, carrierId: c.id, carrierNombre: c.nombre,
      equipo: d.equipo || c.equipos[0], equipos: d.equipos || [d.equipo || c.equipos[0]], enLinea: true, estado: p.estado, ordenId: p.ordenId || null,
      desde: minsAtras(p.mins), heartbeat: latidoDemo, demo: true,
    })
    nPres++
  }
  conteo.choferesEnLinea = nPres

  log('¡Listo!')
  return conteo
}

// ============================================================================
// Borra SOLO los documentos demo (demo === true) del tenant. No toca datos reales.
// Borra los docs de una colección UNO POR UNO sin abortar el proceso completo:
// si una colección está protegida por reglas (p.ej. historial técnico), se salta
// y se sigue con las demás. Devuelve { borrados, fallidos }.
async function _borrarLote(col, docs, onProgress) {
  if (!docs.length) return { borrados: 0, fallidos: 0 }
  // Sonda: borra el PRIMER doc solo. Si falla, la colección está protegida por
  // reglas y no insistimos doc por doc (evita cientos de errores).
  let borrados = 0
  let fallidos = 0
  try { await eliminar(col, docs[0].id); borrados = 1 } catch { return { borrados: 0, fallidos: docs.length } }
  // El resto en tandas paralelas (25×) para que miles de puntos GPS no tarden
  // una eternidad; cada doc con su propio catch para no abortar la tanda.
  const resto = docs.slice(1)
  const CHUNK = 25
  for (let i = 0; i < resto.length; i += CHUNK) {
    const trozo = resto.slice(i, i + CHUNK)
    const rs = await Promise.all(trozo.map((d) => eliminar(col, d.id).then(() => true).catch(() => false)))
    for (const ok of rs) { if (ok) borrados++; else fallidos++ }
    onProgress(col, borrados, docs.length)
  }
  onProgress(col, borrados, docs.length)
  return { borrados, fallidos }
}

export async function borrarDemo(tenantId, onProgress = () => {}) {
  const cols = ['presence', 'trackpoints', 'orders', 'invoices', 'incidents', 'documents', 'jobs', 'geofences', 'tariffs', 'plants', 'clients', 'carriers', 'equipment', 'materials']
  let borrados = 0
  let fallidos = 0
  for (const c of cols) {
    let docs = []
    try { docs = await listar(c, tenantId, [where('demo', '==', true)]) } catch { continue }
    const r = await _borrarLote(c, docs, onProgress)
    borrados += r.borrados
    fallidos += r.fallidos
  }
  return { borrados, fallidos }
}

// BORRA TODO lo operativo del tenant (con y sin marca demo): órdenes, pagos,
// facturas, trabajos, catálogo (plantas/clientes/transportistas/equipos/
// materiales/tarifas/geocercas), chats, notificaciones e historial GPS.
// CONSERVA: cuentas de usuario, configuración, códigos de supervisor y la
// auditoría/registros financieros (esos son inmutables a propósito).
export async function borrarTodo(tenantId, onProgress = () => {}) {
  const cols = [
    'presence', 'trackpoints', 'geoeventos',
    'orders', 'orderPay_cliente', 'orderPay_carrier', 'orderPay_chofer',
    'invoices', 'recurrentes', 'incidents', 'documents',
    'jobs', 'geofences', 'tariffs', 'plants', 'clients',
    'carriers', 'carrierConfig', 'carrierStatements', 'equipment', 'materials',
    'messages', 'conversaciones', 'notificaciones',
  ]
  let borrados = 0
  let fallidos = 0
  for (const c of cols) {
    let docs = []
    try { docs = await listar(c, tenantId) } catch { continue }
    const r = await _borrarLote(c, docs, onProgress)
    borrados += r.borrados
    fallidos += r.fallidos
  }
  return { borrados, fallidos }
}

// ¿Ya hay datos demo cargados? (mira las órdenes)
export async function hayDemo(tenantId) {
  const docs = await listar('orders', tenantId, [where('demo', '==', true)])
  return docs.length
}

// Vínculo demo para un usuario de prueba según su rol (para que su portal tenga datos).
export async function datosVinculoDemo(tenantId, rol) {
  if (rol === 'cliente') {
    const cs = await listar('clients', tenantId, [where('demo', '==', true)])
    return cs.length ? { clienteId: cs[0].id } : {}
  }
  if (rol === 'transportista' || rol === 'chofer') {
    const cs = await listar('carriers', tenantId, [where('demo', '==', true)])
    return cs.length ? { carrierId: cs[0].id } : {}
  }
  return {}
}

// Prepara el portal del chofer de prueba: le deja UNA orden activa (para avanzar los
// hitos, ticket y POD) y UNA por aceptar de su transportista.
export async function prepararChoferDemo(tenantId, uid, nombre, carrierId) {
  if (!carrierId) return
  const orders = await listar('orders', tenantId, [where('demo', '==', true)])
  const activos = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
  let activa = orders.find((o) => o.transportistaId === carrierId && activos.includes(o.estado)) || orders.find((o) => activos.includes(o.estado))
  if (activa) await guardar('orders', activa.id, { transportistaId: carrierId, choferId: uid, choferNombre: nombre })
  const porAceptar = orders.find((o) => o.estado === E.NOTIFICANDO && o.id !== activa?.id)
  if (porAceptar) await guardar('orders', porAceptar.id, { transportistaId: carrierId, choferId: null })
}
