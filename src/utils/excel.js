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

// Encuentra una hoja por nombre normalizado (por "incluye").
function buscarHoja(wb, objetivoNorm) {
  const nombre = wb.SheetNames.find((n) => norm(n).includes(objetivoNorm))
  return nombre ? wb.Sheets[nombre] : null
}

// Recalcula el rango REAL de la hoja escaneando todas las celdas, porque algunos
// .xlsx de Gofo traen un "!ref" (dimensión) TRUNCADO que declara solo 1-2 filas
// aunque las celdas lleguen a ~101.024. Si no se corrige, sheet_to_json respeta
// ese "!ref" y devuelve solo la primera fila → "detecta 1 chofer". ESTE era el bug.
export function rangoRealDeHoja(sheet) {
  let maxR = -1
  let maxC = -1
  for (const k of Object.keys(sheet)) {
    if (k.charCodeAt(0) === 33) continue // ignora claves '!ref', '!merges', etc.
    const cell = XLSX.utils.decode_cell(k)
    if (!cell || Number.isNaN(cell.r)) continue
    if (cell.r > maxR) maxR = cell.r
    if (cell.c > maxC) maxC = cell.c
  }
  if (maxR < 0) return null
  const rango = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: Math.max(0, maxC) } })
  // Sobreescribe el "!ref" malo con el real (doble seguro: además se pasa `range`).
  sheet['!ref'] = rango
  return rango
}

// Lee la hoja como MATRIZ (array de arrays), garantizando que se recorren TODAS
// las filas reales (no solo la primera). Cada fila es un array de celdas por columna.
export function filasMatriz(sheet) {
  if (!sheet) return []
  const rangoReal = rangoRealDeHoja(sheet)
  // pasar el rango REAL evita que un "!ref" truncado limite la lectura a 1 fila
  const opts = { header: 1, defval: null, blankrows: false }
  if (rangoReal) opts.range = rangoReal
  return XLSX.utils.sheet_to_json(sheet, opts)
}

// Detecta la fila de encabezados buscando, en las primeras filas, alguna que
// contenga alguna de las claves esperadas (por si hay filas de título arriba).
function detectarFilaEncabezado(matriz, clavesEsperadas) {
  const lim = Math.min(matriz.length, 15)
  for (let i = 0; i < lim; i++) {
    const norms = (matriz[i] || []).map(norm)
    if (clavesEsperadas.some((k) => norms.includes(k) || norms.some((h) => h && h.includes(k)))) return i
  }
  return 0
}

// Resuelve el índice de columna de cada campo: primero por nombre de encabezado
// (exacto, luego "incluye") y si falla, por POSICIÓN fija de respaldo.
function resolverIndices(headerRow, defs) {
  const norms = (headerRow || []).map(norm)
  const out = {}
  for (const [campoNombre, def] of Object.entries(defs)) {
    let idx = -1
    for (const c of def.cands) {
      const i = norms.findIndex((h) => h === c)
      if (i >= 0) { idx = i; break }
    }
    if (idx < 0) {
      for (const c of def.cands) {
        const i = norms.findIndex((h) => h && h.includes(c))
        if (i >= 0) { idx = i; break }
      }
    }
    if (idx < 0 && def.fallback != null) idx = def.fallback
    out[campoNombre] = idx
  }
  return out
}

// Lee TODAS las filas de datos de una hoja y devuelve objetos {campo: valor}
// según `defs` = { campo: { cands:[norms], fallback:idx } }.
function leerObjetos(sheet, defs, clavesEncabezado) {
  const matriz = filasMatriz(sheet)
  if (matriz.length === 0) return []
  const hIdx = detectarFilaEncabezado(matriz, clavesEncabezado)
  const cols = resolverIndices(matriz[hIdx], defs)
  const out = []
  for (let i = hIdx + 1; i < matriz.length; i++) {
    const row = matriz[i]
    if (!row || row.length === 0) continue
    const obj = {}
    let algo = false
    for (const campoNombre of Object.keys(defs)) {
      const idx = cols[campoNombre]
      const v = idx != null && idx >= 0 ? row[idx] : undefined
      obj[campoNombre] = v
      if (v != null && String(v).trim() !== '') algo = true
    }
    if (algo) out.push(obj)
  }
  return out
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

  // --- Details of Delivery Fees --- (recorre TODAS las filas por matriz)
  // Mapa de columnas confirmado (0-based): Courier=8 (col I), Region/route=6 (G),
  // The total expenses...=15 (P), Settlement weight lb=14 (O), Waybill No=0 (A).
  const detalles = []
  let sumaEntregas = 0
  const detRows = leerObjetos(
    hDetails,
    {
      courier: { cands: ['courier'], fallback: 8 },
      ruta: { cands: ['regionroute', 'region', 'route'], fallback: 6 },
      monto: { cands: ['thetotalexpensesexclusiveoftaxes', 'totalexpensesexclusiveoftaxes'], fallback: 15 },
      peso: { cands: ['settlementweightlb', 'settlementweight'], fallback: 14 },
      rango: { cands: ['billingweightrange'], fallback: -1 },
      waybill: { cands: ['waybillno', 'waybill'], fallback: 0 },
    },
    ['courier', 'regionroute']
  )
  for (const r of detRows) {
    const monto = toNum(r.monto)
    const ruta = (r.ruta == null ? '' : String(r.ruta)).trim() || 'Sin ruta'
    detalles.push({
      courier: (r.courier == null ? '' : String(r.courier)).trim() || 'Sin chofer',
      ruta,
      ciudad: codigoCiudad(ruta),
      monto,
      peso: toNum(r.peso),
      rango: r.rango == null ? '' : String(r.rango),
      waybill: r.waybill == null ? '' : String(r.waybill),
      esDoble: monto === DOBLE_MONTO,
    })
    sumaEntregas += monto
  }

  // --- Claims Detail ---
  const claims = []
  let sumaClaims = 0
  const claimRows = leerObjetos(
    hClaims,
    {
      waybill: { cands: ['waybillno', 'waybill'], fallback: -1 },
      courier: { cands: ['courier'], fallback: -1 },
      date: { cands: ['date'], fallback: -1 },
      postalCode: { cands: ['postalcode'], fallback: -1 },
      claimType: { cands: ['claimtype'], fallback: -1 },
      monto: { cands: ['thetotalexpensesexclusiveoftaxes', 'totalexpensesexclusiveoftaxes'], fallback: -1 },
    },
    ['waybillno', 'courier', 'claimtype']
  )
  for (const r of claimRows) {
    const monto = toNum(r.monto)
    claims.push({
      waybill: r.waybill == null ? '' : String(r.waybill),
      courier: (r.courier == null ? '' : String(r.courier)).trim() || 'Sin chofer',
      date: r.date == null ? '' : String(r.date),
      postalCode: r.postalCode == null ? '' : String(r.postalCode),
      claimType: r.claimType == null ? '' : String(r.claimType),
      montoGofo: monto,
    })
    sumaClaims += monto
  }

  // --- Offset Details ---
  let sumaOffset = 0
  for (const r of leerObjetos(hOffset, { monto: { cands: ['thetotalexpensesexclusiveoftaxes', 'totalexpensesexclusiveoftaxes'], fallback: -1 } }, ['thetotalexpensesexclusiveoftaxes'])) {
    sumaOffset += toNum(r.monto)
  }

  // --- General Ledger Adjustment record ---
  let sumaAjustes = 0
  for (const r of leerObjetos(hAdjust, { monto: { cands: ['adjustmentamountuntaxed', 'adjustmentamount'], fallback: -1 } }, ['adjustmentamountuntaxed', 'adjustmentamount'])) {
    sumaAjustes += toNum(r.monto)
  }

  // --- DSP Summary (total oficial de Gofo) ---
  const gofo = { totalGofo: 0, claim: 0, ajuste: 0, offset: 0, numDeliveries: 0, first: 0, subsequent: 0, disponible: false }
  const dspRows = leerObjetos(
    hDsp,
    {
      total: { cands: ['totalbillingamountuntaxed', 'totalbillingamount'], fallback: -1 },
      claim: { cands: ['claimamount'], fallback: -1 },
      ajuste: { cands: ['adjustmentamount'], fallback: -1 },
      offset: { cands: ['totaloffsetamount', 'offsetamount'], fallback: -1 },
      numDeliveries: { cands: ['numberofdeliveries', 'numdeliveries'], fallback: -1 },
      first: { cands: ['firstshipments', 'firstshipment'], fallback: -1 },
      subsequent: { cands: ['subsequentshipments', 'subsequentshipment'], fallback: -1 },
    },
    ['totalbillingamountuntaxed', 'totalbillingamount']
  )
  for (const r of dspRows) {
    if (r.total != null) {
      gofo.disponible = true
      gofo.totalGofo += toNum(r.total)
      gofo.claim += toNum(r.claim)
      gofo.ajuste += toNum(r.ajuste)
      gofo.offset += toNum(r.offset)
      gofo.numDeliveries += toNum(r.numDeliveries)
      gofo.first += toNum(r.first)
      gofo.subsequent += toNum(r.subsequent)
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

  // Diagnóstico (visible en la consola del navegador, F12): debe dar ~101024 y ~139.
  const choferesUnicos = [...new Set(detalles.map((d) => d.courier))]
  /* eslint-disable no-console */
  console.log('[MilePay] Filas leídas:', detalles.length, `("${nombreArchivo}")`)
  console.log('[MilePay] Choferes únicos:', choferesUnicos.length)
  /* eslint-enable no-console */

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

// ---- reporte de FALLIDOS (segundo archivo, hoja "sheet") ---------------------
//
// Del reporte de Gofo SOLO se usan dos columnas: "Courier Name" y "Courier
// Operation Status". Se cuenta como FALLIDO únicamente cada fila cuyo estado sea
// "Failed delivery". TODO lo demás del archivo se ignora (Delivered, Returned,
// waybill, zip, fechas, issue type, etc.). Devuelve el conteo por nombre de chofer.
export function procesarReporteFallidos(arrayBuffer, nombreArchivo) {
  const errores = []
  let wb
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array' })
  } catch (e) {
    throw new Error(`No se pudo leer "${nombreArchivo}": ${e.message}`)
  }
  // Hoja "sheet": exacta preferida; si no, la primera que la incluya; si no, la primera hoja.
  let hoja = wb.SheetNames.find((n) => norm(n) === 'sheet')
  if (!hoja) hoja = wb.SheetNames.find((n) => norm(n).includes('sheet'))
  const sheet = hoja ? wb.Sheets[hoja] : wb.Sheets[wb.SheetNames[0]]
  if (!sheet) {
    errores.push('El reporte de fallidos no tiene hojas legibles.')
    return { archivoNombre: nombreArchivo, porNombre: {}, totalFailed: 0, filas: 0, errores }
  }
  const rows = leerObjetos(
    sheet,
    {
      courier: { cands: ['couriername', 'courier'], fallback: -1 },
      status: { cands: ['courieroperationstatus', 'operationstatus', 'deliverystatus', 'status'], fallback: -1 },
    },
    ['couriername', 'courieroperationstatus']
  )
  const porNombre = {}
  let totalFailed = 0
  for (const r of rows) {
    const status = String(r.status == null ? '' : r.status).trim().toLowerCase()
    if (status !== 'failed delivery') continue // SOLO "Failed delivery"
    const nombre = String(r.courier == null ? '' : r.courier).trim()
    if (!nombre) continue
    porNombre[nombre] = (porNombre[nombre] || 0) + 1
    totalFailed += 1
  }
  if (totalFailed === 0) errores.push('No se encontró ninguna fila con estado "Failed delivery" en el reporte.')
  return { archivoNombre: nombreArchivo, porNombre, totalFailed, filas: rows.length, errores }
}

// ---- construcción del resumen agregado ---------------------------------------

// Resuelve el nombre de una ciudad usando primero un mapa personalizado
// (códigos añadidos manualmente) y si no, la tabla estándar.
function nombreDe(code, nombreMap) {
  if (nombreMap && nombreMap[code]) return nombreMap[code]
  return nombreCiudad(code)
}

// A partir de una lista de detalles + claims (posiblemente de varios archivos),
// construye todo el resumen que se guarda/usa en la app.
export function construirResumen(detalles, claims, nombreMap) {
  const porChofer = {}
  const porChoferRuta = {} // desglose exacto por (chofer, ruta)
  const porRuta = {}
  const porCiudad = {}

  // Arreglo "Sin ruta": los paquetes sin Region/route válido se asignan a la
  // ruta MÁS COMÚN de ese chofer (moda). Si el chofer no tiene ninguna ruta
  // válida, se dejan como "Sin ruta".
  const rutasValidasPorChofer = {}
  for (const d of detalles) {
    if (d.ruta && d.ruta !== 'Sin ruta') {
      const m = (rutasValidasPorChofer[d.courier] = rutasValidasPorChofer[d.courier] || {})
      m[d.ruta] = (m[d.ruta] || 0) + 1
    }
  }
  const modaRuta = {}
  for (const courier of Object.keys(rutasValidasPorChofer)) {
    const m = rutasValidasPorChofer[courier]
    modaRuta[courier] = Object.keys(m).sort((a, b) => m[b] - m[a])[0]
  }
  for (const d of detalles) {
    if ((!d.ruta || d.ruta === 'Sin ruta') && modaRuta[d.courier]) {
      d.ruta = modaRuta[d.courier]
      d.ciudad = codigoCiudad(d.ruta)
    }
  }

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

    // por chofer + ruta (desglose exacto para filtrar por ruta puntual)
    const crk = `${d.courier}||${d.ruta}`
    if (!porChoferRuta[crk]) porChoferRuta[crk] = { nombre: d.courier, ruta: d.ruta, ciudad: d.ciudad, individuales: 0, dobles: 0, ingreso: 0 }
    porChoferRuta[crk].ingreso += d.monto
    if (d.esDoble) porChoferRuta[crk].dobles += 1
    else porChoferRuta[crk].individuales += 1

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
    nombreCiudad: nombreDe(c.ubicacion, nombreMap),
    paquetes: c.paquetes,
    individuales: c.individuales,
    dobles: c.dobles,
    ingreso: c.ingreso,
    numClaims: c.numClaims,
    numChoferes: c._choferes.size,
    numRutas: c._rutas.size,
  }))

  const resumenChoferes = Object.values(porChofer).map((c) => ({ ...c, nombreCiudad: nombreDe(c.ciudad, nombreMap) }))

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
    resumenChoferRuta: Object.values(porChoferRuta),
    resumenRutas,
    resumenCiudades,
  }
}

// Combina varios archivos procesados bajo una misma semana.
// `nombreMap` (opcional) resuelve nombres de ciudades personalizadas.
export function combinarArchivos(procesados, nombreMap) {
  const detalles = procesados.flatMap((p) => p.detalles)
  const claims = procesados.flatMap((p) => p.claims)
  const resumen = construirResumen(detalles, claims, nombreMap)

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
