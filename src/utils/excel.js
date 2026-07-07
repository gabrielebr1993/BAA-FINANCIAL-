// ---------------------------------------------------------------------------
// Lectura y procesamiento de las facturas .xlsx de Gofo (SheetJS / xlsx).
// Todo se procesa EN EL NAVEGADOR; no se sube ningún archivo a un servidor.
// ---------------------------------------------------------------------------
import * as XLSX from 'xlsx'
import { DOBLE_MONTO, nombreCiudad } from '../constants'

// ---- helpers de normalización -------------------------------------------------

// Normaliza un texto de encabezado a solo letras/números en minúscula,
// para poder emparejar columnas aunque cambien espacios/mayúsculas/puntuación.
function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Convierte a número tolerando "$", comas y espacios.
export function toNum(v) {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return v
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

// Busca en una fila (objeto) el valor de la primera columna candidata que exista.
// `candidatos` son textos ya normalizados (norm()).
function campo(rowNorm, candidatos) {
  for (const c of candidatos) {
    if (c in rowNorm && rowNorm[c] !== '' && rowNorm[c] != null) return rowNorm[c]
  }
  // segundo intento: por "incluye" (encabezado contiene el candidato)
  for (const c of candidatos) {
    for (const k of Object.keys(rowNorm)) {
      if (k.includes(c) && rowNorm[k] !== '' && rowNorm[k] != null) return rowNorm[k]
    }
  }
  return undefined
}

// Reindexa una fila por claves normalizadas.
function normalizarFila(row) {
  const out = {}
  for (const k of Object.keys(row)) out[norm(k)] = row[k]
  return out
}

// Encuentra una hoja por nombre normalizado (por "incluye").
function buscarHoja(wb, objetivoNorm) {
  const nombre = wb.SheetNames.find((n) => norm(n).includes(objetivoNorm))
  return nombre ? wb.Sheets[nombre] : null
}

function filasDeHoja(sheet) {
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

// ---- código de ciudad desde "Region/route" ----------------------------------

// "DFW01-001" -> "DFW01" ; "IAH02-015" -> "IAH02". Toma lo anterior al guion.
export function codigoCiudad(regionRoute) {
  if (!regionRoute) return ''
  const s = String(regionRoute).trim()
  const idx = s.indexOf('-')
  return (idx === -1 ? s : s.slice(0, idx)).trim().toUpperCase()
}

// ---- detección de semana desde el nombre del archivo -------------------------

// Busca dos fechas tipo dd_mm_aaaa y devuelve "dd_mm_aaaa-dd_mm_aaaa".
// Se exige año de 4 dígitos para no confundir el prefijo de ciudad (ej. "DFW01_")
// con parte de la fecha. Si no hay años de 4 dígitos, se intenta un patrón laxo.
export function detectarSemana(nombreArchivo) {
  if (!nombreArchivo) return ''
  const nombre = String(nombreArchivo).replace(/\.xlsx?$/i, '')
  const limpiar = (f) => f.replace(/[._/-]/g, '_')
  let fechas = nombre.match(/\d{1,2}[._/-]\d{1,2}[._/-]\d{4}/g)
  if (!fechas || fechas.length === 0) fechas = nombre.match(/\d{1,2}[._/-]\d{1,2}[._/-]\d{2,4}/g)
  if (!fechas || fechas.length === 0) return ''
  if (fechas.length >= 2) return `${limpiar(fechas[0])}-${limpiar(fechas[1])}`
  return limpiar(fechas[0])
}

// ---- procesamiento de un archivo --------------------------------------------

// Lee un ArrayBuffer y devuelve datos crudos + sumas de verificación.
export function procesarArchivo(arrayBuffer, nombreArchivo) {
  const errores = []
  let wb
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array' })
  } catch (e) {
    throw new Error(`No se pudo leer "${nombreArchivo}": ${e.message}`)
  }

  const hDetails = buscarHoja(wb, 'detailsofdeliveryfees')
  const hClaims = buscarHoja(wb, 'claimsdetail')
  const hOffset = buscarHoja(wb, 'offsetdetails')
  const hAdjust = buscarHoja(wb, 'generalledgeradjustment')
  const hDsp = buscarHoja(wb, 'dspsummary')

  if (!hDetails) errores.push('Falta la hoja "Details of Delivery Fees" (obligatoria).')

  // --- Details of Delivery Fees ---
  const detalles = []
  let sumaEntregas = 0
  for (const raw of filasDeHoja(hDetails)) {
    const r = normalizarFila(raw)
    const courier = campo(r, ['courier'])
    const ruta = campo(r, ['regionroute', 'region', 'route'])
    if (courier == null && ruta == null) continue
    const monto = toNum(campo(r, ['thetotalexpensesexclusiveoftaxes', 'totalexpensesexclusiveoftaxes']))
    const peso = toNum(campo(r, ['settlementweightlb', 'settlementweight']))
    const rango = campo(r, ['billingweightrange'])
    const waybill = campo(r, ['waybillno', 'waybill'])
    const ciudad = codigoCiudad(ruta)
    detalles.push({
      courier: (courier ?? '').toString().trim() || 'Sin chofer',
      ruta: (ruta ?? '').toString().trim() || 'Sin ruta',
      ciudad,
      monto,
      peso,
      rango: rango == null ? '' : String(rango),
      waybill: waybill == null ? '' : String(waybill),
      esDoble: monto === DOBLE_MONTO,
    })
    sumaEntregas += monto
  }

  // --- Claims Detail ---
  const claims = []
  let sumaClaims = 0
  for (const raw of filasDeHoja(hClaims)) {
    const r = normalizarFila(raw)
    const waybill = campo(r, ['waybillno', 'waybill'])
    const courier = campo(r, ['courier'])
    if (waybill == null && courier == null) continue
    const monto = toNum(campo(r, ['thetotalexpensesexclusiveoftaxes', 'totalexpensesexclusiveoftaxes']))
    claims.push({
      waybill: waybill == null ? '' : String(waybill),
      courier: (courier ?? '').toString().trim() || 'Sin chofer',
      date: (() => {
        const d = campo(r, ['date'])
        return d == null ? '' : String(d)
      })(),
      postalCode: (() => {
        const p = campo(r, ['postalcode'])
        return p == null ? '' : String(p)
      })(),
      claimType: (() => {
        const t = campo(r, ['claimtype'])
        return t == null ? '' : String(t)
      })(),
      montoGofo: monto,
    })
    sumaClaims += monto
  }

  // --- Offset Details ---
  let sumaOffset = 0
  for (const raw of filasDeHoja(hOffset)) {
    const r = normalizarFila(raw)
    sumaOffset += toNum(campo(r, ['thetotalexpensesexclusiveoftaxes', 'totalexpensesexclusiveoftaxes']))
  }

  // --- General Ledger Adjustment record ---
  let sumaAjustes = 0
  for (const raw of filasDeHoja(hAdjust)) {
    const r = normalizarFila(raw)
    sumaAjustes += toNum(campo(r, ['adjustmentamountuntaxed', 'adjustmentamount']))
  }

  // --- DSP Summary (total oficial de Gofo) ---
  const gofo = { totalGofo: 0, claim: 0, ajuste: 0, offset: 0, numDeliveries: 0, first: 0, subsequent: 0, disponible: false }
  for (const raw of filasDeHoja(hDsp)) {
    const r = normalizarFila(raw)
    const total = campo(r, ['totalbillingamountuntaxed', 'totalbillingamount'])
    if (total != null) {
      gofo.disponible = true
      gofo.totalGofo += toNum(total)
      gofo.claim += toNum(campo(r, ['claimamount']))
      gofo.ajuste += toNum(campo(r, ['adjustmentamount']))
      gofo.offset += toNum(campo(r, ['totaloffsetamount', 'offsetamount']))
      gofo.numDeliveries += toNum(campo(r, ['numberofdeliveries', 'numdeliveries']))
      gofo.first += toNum(campo(r, ['firstshipments', 'firstshipment']))
      gofo.subsequent += toNum(campo(r, ['subsequentshipments', 'subsequentshipment']))
    }
  }

  // ciudad "de la mayoría" para etiquetar claims que no tienen ruta
  const ciudadPorChofer = {}
  const conteoCiudad = {}
  for (const d of detalles) {
    conteoCiudad[d.ciudad] = (conteoCiudad[d.ciudad] || 0) + 1
    const key = d.courier
    ciudadPorChofer[key] = ciudadPorChofer[key] || {}
    ciudadPorChofer[key][d.ciudad] = (ciudadPorChofer[key][d.ciudad] || 0) + 1
  }
  const mayoria = (obj) => Object.keys(obj || {}).sort((a, b) => obj[b] - obj[a])[0] || ''
  for (const c of claims) c.ciudad = mayoria(ciudadPorChofer[c.courier]) || mayoria(conteoCiudad)

  const ciudadesDetectadas = Object.keys(conteoCiudad).filter(Boolean).sort()

  return {
    archivoNombre: nombreArchivo,
    semana: detectarSemana(nombreArchivo),
    detalles,
    claims,
    sumaEntregas,
    sumaOffset,
    sumaClaims,
    sumaAjustes,
    gofo,
    ciudadesDetectadas,
    errores,
  }
}

// ---- construcción del resumen agregado ---------------------------------------

// A partir de una lista de detalles + claims (posiblemente de varios archivos),
// construye todo el resumen que se guarda/usa en la app.
export function construirResumen(detalles, claims) {
  const porChofer = {}
  const porRuta = {}
  const porCiudad = {}

  let totalPaquetes = 0
  let totalIndividuales = 0
  let totalDobles = 0
  let ingresoTotal = 0

  for (const d of detalles) {
    totalPaquetes += 1
    ingresoTotal += d.monto
    if (d.esDoble) totalDobles += 1
    else totalIndividuales += 1

    // por chofer (clave chofer + ciudad, para separar almacenes)
    const ck = `${d.courier}||${d.ciudad}`
    if (!porChofer[ck]) porChofer[ck] = { nombre: d.courier, ciudad: d.ciudad, individuales: 0, dobles: 0, ingreso: 0, numClaims: 0 }
    porChofer[ck].ingreso += d.monto
    if (d.esDoble) porChofer[ck].dobles += 1
    else porChofer[ck].individuales += 1

    // por ruta
    if (!porRuta[d.ruta]) porRuta[d.ruta] = { ruta: d.ruta, ciudad: d.ciudad, paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, pesoTotalLb: 0 }
    porRuta[d.ruta].paquetes += 1
    porRuta[d.ruta].ingreso += d.monto
    porRuta[d.ruta].pesoTotalLb += d.peso
    if (d.esDoble) porRuta[d.ruta].dobles += 1
    else porRuta[d.ruta].individuales += 1

    // por ciudad
    if (!porCiudad[d.ciudad]) porCiudad[d.ciudad] = { ubicacion: d.ciudad, paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, numClaims: 0, _choferes: new Set(), _rutas: new Set() }
    porCiudad[d.ciudad].paquetes += 1
    porCiudad[d.ciudad].ingreso += d.monto
    porCiudad[d.ciudad]._choferes.add(d.courier)
    porCiudad[d.ciudad]._rutas.add(d.ruta)
    if (d.esDoble) porCiudad[d.ciudad].dobles += 1
    else porCiudad[d.ciudad].individuales += 1
  }

  // ruta principal de cada chofer (donde entrega más paquetes), para atribuir claims
  const rutaPorChofer = {} // courier -> { ruta: conteo }
  for (const d of detalles) {
    rutaPorChofer[d.courier] = rutaPorChofer[d.courier] || {}
    rutaPorChofer[d.courier][d.ruta] = (rutaPorChofer[d.courier][d.ruta] || 0) + 1
  }
  const rutaPrincipal = {}
  for (const courier of Object.keys(rutaPorChofer)) {
    const m = rutaPorChofer[courier]
    rutaPrincipal[courier] = Object.keys(m).sort((a, b) => m[b] - m[a])[0]
  }

  // claims por chofer / ciudad / ruta (todo O(claims), sin bucles anidados sobre detalles)
  const claimsPorRuta = {}
  for (const c of claims) {
    const ciudad = c.ciudad || ''
    const ck = `${c.courier}||${ciudad}`
    if (porChofer[ck]) porChofer[ck].numClaims += 1
    else {
      const alt = Object.values(porChofer).find((x) => x.nombre === c.courier)
      if (alt) alt.numClaims += 1
    }
    if (porCiudad[ciudad]) porCiudad[ciudad].numClaims += 1
    const ruta = rutaPrincipal[c.courier]
    if (ruta) claimsPorRuta[ruta] = (claimsPorRuta[ruta] || 0) + 1
  }

  // derivados de ruta
  const resumenRutas = Object.values(porRuta).map((r) => ({
    ...r,
    precioPorLb: r.pesoTotalLb > 0 ? r.ingreso / r.pesoTotalLb : 0,
    precioPorPaquete: r.paquetes > 0 ? r.ingreso / r.paquetes : 0,
    numClaims: claimsPorRuta[r.ruta] || 0,
  }))

  const resumenCiudades = Object.values(porCiudad).map((c) => ({
    ubicacion: c.ubicacion,
    nombreCiudad: nombreCiudad(c.ubicacion),
    paquetes: c.paquetes,
    individuales: c.individuales,
    dobles: c.dobles,
    ingreso: c.ingreso,
    numClaims: c.numClaims,
    numChoferes: c._choferes.size,
    numRutas: c._rutas.size,
  }))

  const resumenChoferes = Object.values(porChofer).map((c) => ({ ...c, nombreCiudad: nombreCiudad(c.ciudad) }))

  const totalClaims = claims.length
  const totalDescuentoGofo = claims.reduce((a, c) => a + c.montoGofo, 0)

  return {
    totalPaquetes,
    totalIndividuales,
    totalDobles,
    ingresoTotal,
    numChoferes: new Set(detalles.map((d) => d.courier)).size,
    numRutas: Object.keys(porRuta).length,
    totalClaims,
    totalDescuentoGofo,
    resumenChoferes,
    resumenRutas,
    resumenCiudades,
  }
}

// Combina varios archivos procesados bajo una misma semana.
export function combinarArchivos(procesados) {
  const detalles = procesados.flatMap((p) => p.detalles)
  const claims = procesados.flatMap((p) => p.claims)
  const resumen = construirResumen(detalles, claims)

  const sumaEntregas = procesados.reduce((a, p) => a + p.sumaEntregas, 0)
  const sumaOffset = procesados.reduce((a, p) => a + p.sumaOffset, 0)
  const sumaClaims = procesados.reduce((a, p) => a + p.sumaClaims, 0)
  const sumaAjustes = procesados.reduce((a, p) => a + p.sumaAjustes, 0)
  const netoCalculado = sumaEntregas + sumaOffset + sumaClaims + sumaAjustes

  const gofo = procesados.reduce(
    (a, p) => ({
      totalGofo: a.totalGofo + p.gofo.totalGofo,
      claim: a.claim + p.gofo.claim,
      ajuste: a.ajuste + p.gofo.ajuste,
      offset: a.offset + p.gofo.offset,
      numDeliveries: a.numDeliveries + p.gofo.numDeliveries,
      first: a.first + p.gofo.first,
      subsequent: a.subsequent + p.gofo.subsequent,
      disponible: a.disponible || p.gofo.disponible,
    }),
    { totalGofo: 0, claim: 0, ajuste: 0, offset: 0, numDeliveries: 0, first: 0, subsequent: 0, disponible: false }
  )

  const diferencia = netoCalculado - gofo.totalGofo
  const verificacion = {
    sumaEntregas,
    sumaOffset,
    sumaClaims,
    sumaAjustes,
    netoCalculado,
    gofo,
    diferencia,
    cuadra: gofo.disponible ? Math.abs(diferencia) < 0.01 : null,
  }

  return {
    ...resumen,
    detalles,
    claims,
    verificacion,
    ciudades: [...new Set(detalles.map((d) => d.ciudad).filter(Boolean))].sort(),
  }
}
