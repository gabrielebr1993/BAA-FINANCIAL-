// ---------------------------------------------------------------------------
// Rango de fechas: parseo del periodo de una factura, atajos y filtrado,
// y combinación de varias facturas (resúmenes ya guardados) en una sola.
// ---------------------------------------------------------------------------
import { nombreCiudad } from '../constants'

// "22_06_2026-28_06_2026" -> { fechaInicio: Date, fechaFin: Date }
export function parsearPeriodo(semana) {
  if (!semana) return { fechaInicio: null, fechaFin: null }
  const tokens = String(semana).match(/\d{1,2}[._/-]\d{1,2}[._/-]\d{2,4}/g)
  const aDate = (t) => {
    if (!t) return null
    const [d, m, y] = t.split(/[._/-]/).map((x) => parseInt(x, 10))
    const anio = y < 100 ? 2000 + y : y
    const dt = new Date(anio, (m || 1) - 1, d || 1)
    return isNaN(dt.getTime()) ? null : dt
  }
  if (!tokens || tokens.length === 0) return { fechaInicio: null, fechaFin: null }
  const fechaInicio = aDate(tokens[0])
  const fechaFin = tokens[1] ? aDate(tokens[1]) : fechaInicio
  return { fechaInicio, fechaFin }
}

// Asegura que una factura tenga fechaInicio/fechaFin como Date (calculadas si faltan).
export function conFechas(inv) {
  if (!inv) return inv
  let fi = inv.fechaInicio
  let ff = inv.fechaFin
  if (fi && fi.toDate) fi = fi.toDate()
  if (ff && ff.toDate) ff = ff.toDate()
  if (fi instanceof Date && ff instanceof Date) return { ...inv, fechaInicio: fi, fechaFin: ff }
  const p = parsearPeriodo(inv.semana)
  return { ...inv, fechaInicio: fi instanceof Date ? fi : p.fechaInicio, fechaFin: ff instanceof Date ? ff : p.fechaFin }
}

// ---- atajos de rango --------------------------------------------------------

export const PRESETS = [
  { key: 'ultima', label: 'Última semana' },
  { key: 'ultimas4', label: 'Últimas 4 semanas' },
  { key: 'esteMes', label: 'Este mes' },
  { key: 'mesPasado', label: 'Mes pasado' },
  { key: 'esteTrimestre', label: 'Este trimestre' },
  { key: 'esteAno', label: 'Este año' },
  { key: 'todo', label: 'Todo' },
  { key: 'personalizado', label: 'Personalizado' },
]

function inicioMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function finMes(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) }

// Todas las facturas de las N SEMANAS más recientes (por `semana`), no las N
// facturas más recientes. `lista` viene ordenada desc por fechaInicio.
function invoicesDeUltimasSemanas(lista, n) {
  const orden = []
  const vistas = new Set()
  for (const i of lista) {
    const wk = i.semana || i.id
    if (!vistas.has(wk)) { vistas.add(wk); orden.push(wk) }
  }
  const top = new Set(orden.slice(0, n))
  return lista.filter((i) => top.has(i.semana || i.id))
}

// Devuelve las facturas (ya con fechas) que caen dentro del rango.
// `invoices` debe venir ordenado desc por fechaInicio.
export function invoicesEnRango(invoices, rango) {
  const lista = (invoices || []).filter((i) => i.fechaInicio instanceof Date)
  if (lista.length === 0) return []
  const { preset } = rango || { preset: 'ultima' }

  // Por factura: una sola factura elegida a mano (por id).
  if (preset === 'factura') {
    const sel = lista.find((i) => i.id === rango.invoiceId)
    return sel ? [sel] : []
  }
  if (preset === 'todo') return lista
  // "Última semana" / "Últimas 4 semanas" cuentan SEMANAS distintas (por `semana`),
  // no facturas: con una factura por ciudad, una semana = varias facturas.
  if (preset === 'ultima') return invoicesDeUltimasSemanas(lista, 1)
  if (preset === 'ultimas4') return invoicesDeUltimasSemanas(lista, 4)

  const hoy = new Date()
  let desde, hasta
  if (preset === 'esteMes') { desde = inicioMes(hoy); hasta = finMes(hoy) }
  else if (preset === 'mesPasado') { const m = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); desde = inicioMes(m); hasta = finMes(m) }
  else if (preset === 'esteTrimestre') { const q = Math.floor(hoy.getMonth() / 3); desde = new Date(hoy.getFullYear(), q * 3, 1); hasta = new Date(hoy.getFullYear(), q * 3 + 3, 0, 23, 59, 59) }
  else if (preset === 'esteAno') { desde = new Date(hoy.getFullYear(), 0, 1); hasta = new Date(hoy.getFullYear(), 11, 31, 23, 59, 59) }
  else if (preset === 'personalizado') {
    // Se parsea como fecha LOCAL (con hora) para no correr un día por la zona horaria
    // (new Date('YYYY-MM-DD') se interpreta como UTC).
    desde = rango.desde ? new Date(rango.desde + 'T00:00:00') : null
    hasta = rango.hasta ? new Date(rango.hasta + 'T23:59:59') : null
  }
  // intersección del periodo de la factura con [desde, hasta]
  return lista.filter((i) => {
    const fi = i.fechaInicio, ff = i.fechaFin || i.fechaInicio
    if (desde && ff < desde) return false
    if (hasta && fi > hasta) return false
    return true
  })
}

// ---- filtro por chofer ------------------------------------------------------

// Reduce una factura combinada (facturaRango) a UN solo chofer, recomputando
// ciudades/rutas/totales desde SUS filas, para que TODA la app (funciones de cálculo
// intactas) muestre solo los datos de ese chofer. No cambia ninguna fórmula: solo
// acota los datos de entrada.
//  - resumenChoferes/ChoferRuta: solo filas de ese chofer.
//  - resumenRutas/Ciudades: recomputadas desde esas filas.
//  - verificacion = null → gananciaRealDe usa el neto por entregas (por chofer),
//    no el neto verificado de Gofo (que es a nivel de factura completa).
//  - totalDescuentoGofo = 0 → la pérdida de Gofo por chofer entra vía sus claims
//    (descontadoGofo en calcularPagos), no por el total de la factura.
//  - __choferScope marca el ámbito (gananciaRealDe excluye el costo de managers).
export function facturaDeChofer(fact, chofer) {
  if (!fact || !chofer) return fact
  const choferes = (fact.resumenChoferes || []).filter((c) => c.nombre === chofer)
  const base = {
    ...fact,
    __choferScope: chofer,
    numChoferes: choferes.length ? 1 : 0,
    verificacion: null,
    totalDescuentoGofo: 0,
    fallidosPorChofer: (fact.fallidosPorChofer && fact.fallidosPorChofer[chofer] != null)
      ? { [chofer]: fact.fallidosPorChofer[chofer] } : {},
    fallidosSinAsociar: (fact.fallidosSinAsociar || []).filter((s) => s.chofer === chofer),
  }
  if (choferes.length === 0) {
    return { ...base, resumenChoferes: [], resumenChoferRuta: [], resumenRutas: [], resumenCiudades: [],
      totalIndividuales: 0, totalDobles: 0, totalPaquetes: 0, ingresoTotal: 0, totalClaims: 0, numRutas: 0, totalFallidos: 0 }
  }
  const choferRuta = (fact.resumenChoferRuta || []).filter((c) => c.nombre === chofer)

  // Rutas EXACTAS desde el desglose chofer×ruta (facturas nuevas). Si la factura no
  // lo trae (histórico), no se pueden separar por chofer → sin filas de ruta.
  const porRuta = {}
  for (const cr of choferRuta) {
    const t = (porRuta[cr.ruta] = porRuta[cr.ruta] || { ruta: cr.ruta, ciudad: cr.ciudad, nombreCiudad: cr.nombreCiudad, paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, pesoTotalLb: 0, numClaims: 0 })
    t.individuales += cr.individuales || 0
    t.dobles += cr.dobles || 0
    t.paquetes += (cr.individuales || 0) + (cr.dobles || 0)
    t.ingreso += cr.ingreso || 0
    t.pesoTotalLb += cr.pesoTotalLb || 0
    t.numClaims += cr.numClaims || 0
  }
  const resumenRutas = Object.values(porRuta).map((r) => ({
    ...r,
    precioPorLb: r.pesoTotalLb > 0 ? r.ingreso / r.pesoTotalLb : 0,
    precioPorPaquete: r.paquetes > 0 ? r.ingreso / r.paquetes : 0,
  }))

  // Ciudades recomputadas desde las filas del chofer.
  const porCiudad = {}
  for (const c of choferes) {
    const t = (porCiudad[c.ciudad] = porCiudad[c.ciudad] || { ubicacion: c.ciudad, nombreCiudad: c.nombreCiudad || nombreCiudad(c.ciudad), paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, numClaims: 0, _ru: new Set() })
    t.individuales += c.individuales || 0
    t.dobles += c.dobles || 0
    t.paquetes += (c.individuales || 0) + (c.dobles || 0)
    t.ingreso += c.ingreso || 0
    t.numClaims += c.numClaims || 0
  }
  for (const r of resumenRutas) if (porCiudad[r.ciudad]) porCiudad[r.ciudad]._ru.add(r.ruta)
  const resumenCiudades = Object.values(porCiudad).map((c) => ({
    ubicacion: c.ubicacion, nombreCiudad: c.nombreCiudad, paquetes: c.paquetes, individuales: c.individuales,
    dobles: c.dobles, ingreso: c.ingreso, numClaims: c.numClaims, numChoferes: 1, numRutas: c._ru.size,
  }))

  const suma = (campo) => choferes.reduce((a, c) => a + (c[campo] || 0), 0)
  return {
    ...base,
    resumenChoferes: choferes,
    resumenChoferRuta: choferRuta,
    resumenRutas,
    resumenCiudades,
    totalIndividuales: suma('individuales'),
    totalDobles: suma('dobles'),
    totalPaquetes: suma('individuales') + suma('dobles'),
    ingresoTotal: suma('ingreso'),
    totalClaims: suma('numClaims'),
    numRutas: resumenRutas.length,
    totalFallidos: suma('fallidos'),
  }
}

// ---- verificación de Gofo combinada -----------------------------------------

// Suma la verificación de Gofo (Bruto→Neto + "Cuadra con Gofo") de varias facturas
// en un solo objeto con la misma forma. Como cada factura es de UNA ciudad (Gofo
// paga por ciudad), sirve tanto para el total (todas las facturas) como para UNA
// ciudad (solo las facturas de esa ciudad). Devuelve null si no hay ninguna.
export function combinarVerificacion(invoices) {
  const lista = invoices || []
  if (lista.length === 0) return null
  const gofo = lista.reduce(
    (a, i) => {
      const g = i.verificacion?.gofo || {}
      return {
        totalGofo: a.totalGofo + (g.totalGofo || 0), claim: a.claim + (g.claim || 0), ajuste: a.ajuste + (g.ajuste || 0),
        offset: a.offset + (g.offset || 0), disponible: a.disponible || !!g.disponible,
      }
    },
    { totalGofo: 0, claim: 0, ajuste: 0, offset: 0, disponible: false }
  )
  const vSum = (campo) => lista.reduce((a, i) => a + (i.verificacion?.[campo] || 0), 0)
  const netoCalculado = vSum('netoCalculado')
  return {
    sumaEntregas: vSum('sumaEntregas'), sumaOffset: vSum('sumaOffset'), sumaClaims: vSum('sumaClaims'), sumaAjustes: vSum('sumaAjustes'),
    netoCalculado, gofo, diferencia: netoCalculado - gofo.totalGofo,
    cuadra: gofo.disponible ? Math.abs(netoCalculado - gofo.totalGofo) < 0.01 : null,
    porFactura: lista.map((i) => ({ semana: i.semana, v: i.verificacion })),
  }
}

// ---- combinación de varias facturas ----------------------------------------

// Suma varios resúmenes de facturas en un único objeto con la misma forma.
export function combinarFacturas(invoices) {
  if (!invoices || invoices.length === 0) return null
  if (invoices.length === 1) return { ...invoices[0], facturas: [invoices[0]], esRango: false }

  const porChofer = {}
  const porRuta = {}
  const porCiudad = {}
  const ciudadesMap = {}

  for (const inv of invoices) {
    Object.assign(ciudadesMap, inv.ciudadesMap || {})
    for (const c of inv.resumenChoferes || []) {
      const k = `${c.nombre}||${c.ciudad}`
      const t = (porChofer[k] = porChofer[k] || { nombre: c.nombre, ciudad: c.ciudad, nombreCiudad: c.nombreCiudad, individuales: 0, dobles: 0, ingreso: 0, numClaims: 0, fallidos: 0 })
      t.individuales += c.individuales || 0
      t.dobles += c.dobles || 0
      t.ingreso += c.ingreso || 0
      t.numClaims += c.numClaims || 0
      t.fallidos += c.fallidos || 0
    }
    for (const r of inv.resumenRutas || []) {
      const t = (porRuta[r.ruta] = porRuta[r.ruta] || { ruta: r.ruta, ciudad: r.ciudad, nombreCiudad: r.nombreCiudad, paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, pesoTotalLb: 0, numClaims: 0 })
      t.paquetes += r.paquetes || 0
      t.individuales += r.individuales || 0
      t.dobles += r.dobles || 0
      t.ingreso += r.ingreso || 0
      t.pesoTotalLb += r.pesoTotalLb || 0
      t.numClaims += r.numClaims || 0
    }
  }

  // ciudades recomputadas desde choferes/rutas combinados
  for (const c of Object.values(porChofer)) {
    const t = (porCiudad[c.ciudad] = porCiudad[c.ciudad] || { ubicacion: c.ciudad, nombreCiudad: c.nombreCiudad || nombreCiudad(c.ciudad), paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, numClaims: 0, _ch: new Set(), _ru: new Set() })
    t.individuales += c.individuales
    t.dobles += c.dobles
    t.paquetes += c.individuales + c.dobles
    t.ingreso += c.ingreso
    t.numClaims += c.numClaims
    t._ch.add(c.nombre)
  }
  for (const r of Object.values(porRuta)) {
    if (porCiudad[r.ciudad]) porCiudad[r.ciudad]._ru.add(r.ruta)
  }

  const resumenRutas = Object.values(porRuta).map((r) => ({
    ...r,
    precioPorLb: r.pesoTotalLb > 0 ? r.ingreso / r.pesoTotalLb : 0,
    precioPorPaquete: r.paquetes > 0 ? r.ingreso / r.paquetes : 0,
  }))
  const resumenCiudades = Object.values(porCiudad).map((c) => ({
    ubicacion: c.ubicacion, nombreCiudad: c.nombreCiudad, paquetes: c.paquetes, individuales: c.individuales,
    dobles: c.dobles, ingreso: c.ingreso, numClaims: c.numClaims, numChoferes: c._ch.size, numRutas: c._ru.size,
  }))
  const resumenChoferes = Object.values(porChofer)

  // Reglas de cálculo aplicadas: se conservan (unión de mapas por ciudad + el
  // default de empresa de la primera factura), para que calcularPagos use el
  // claimFee correcto por ciudad también en rangos de varias semanas.
  const reglasAplicadas = {}
  let reglaEmpresa = null
  for (const inv of invoices) {
    if (inv.reglasAplicadas) Object.assign(reglasAplicadas, inv.reglasAplicadas)
    if (!reglaEmpresa && inv.reglaEmpresa) reglaEmpresa = inv.reglaEmpresa
  }

  const suma = (campo) => invoices.reduce((a, i) => a + (i[campo] || 0), 0)

  // Fallidos combinados: conteo por chofer (unión sumada) + total + sin asociar.
  const fallidosPorChofer = {}
  const fallidosSinAsociar = []
  for (const inv of invoices) {
    for (const [nombre, n] of Object.entries(inv.fallidosPorChofer || {})) fallidosPorChofer[nombre] = (fallidosPorChofer[nombre] || 0) + (n || 0)
    for (const s of inv.fallidosSinAsociar || []) fallidosSinAsociar.push({ ...s, semana: inv.semana })
  }

  // verificación combinada + por factura (reutilizable por ciudad).
  const verificacion = combinarVerificacion(invoices)

  return {
    esRango: true,
    id: 'rango',
    semana: `${invoices.length} semanas`,
    facturas: invoices,
    // Modo de configuración: si TODAS las facturas del rango son 'ruta', el combinado
    // es 'ruta' (para que las reglas/alertas por ruta apliquen bien).
    modoConfig: invoices.every((i) => i.modoConfig === 'ruta') ? 'ruta' : 'estandar',
    ciudadesMap,
    totalPaquetes: suma('totalPaquetes'),
    totalIndividuales: suma('totalIndividuales'),
    totalDobles: suma('totalDobles'),
    ingresoTotal: suma('ingresoTotal'),
    totalClaims: suma('totalClaims'),
    totalDescuentoGofo: suma('totalDescuentoGofo'),
    numChoferes: new Set(resumenChoferes.map((c) => c.nombre)).size,
    numRutas: resumenRutas.length,
    resumenChoferes,
    resumenRutas,
    resumenCiudades,
    reglaEmpresa,
    reglasAplicadas,
    totalFallidos: suma('totalFallidos'),
    fallidosPorChofer,
    fallidosSinAsociar,
    verificacion,
  }
}
