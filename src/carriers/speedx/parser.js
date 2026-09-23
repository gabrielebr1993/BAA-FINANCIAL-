// ============================================================================
// SPEEDX · PARSER de la factura semanal (.xlsx) — Mile Pay Multi-Company.
//
// Estructura REAL verificada con DFW_TTC_15.xlsx (5 hojas):
//   · PLD                      → detalle por paquete (la fuente de verdad)
//   · Driver Summary Version 2 → resumen por chofer (se usa para VERIFICAR)
//   · Claims                   → claims de la semana (Value + Del.Fee = Total)
//   · CLAIM PIVOT              → resumen de claims (solo verificación)
//   · DSP Summary              → totales oficiales (PCS, CONFIRM RATE, CLAIM,
//                                TOTAL PAYMENT, ajustes de la semana previa)
//
// MODELO DE PAGO de SpeedX (por paquete):
//   · Tarifa según peso: <1 lb → 1.75 · ≥1 lb → 1.90 (valores de esta factura).
//   · PAY-PER-STOP: los paquetes ADICIONALES de una misma parada se pagan a
//     0.45 (la columna "Pay per stop adj." trae −1.30/−1.45 y CONFIRM RATE
//     queda en 0.45). CONFIRM RATE = Rate + ajuste = lo que SpeedX paga.
//   · TEMU es solo un marcador del cliente: NO cambia la tarifa.
//
// La SEMANA sale del CONTENIDO (columna NOTE "0829-0904" + fechas), no del
// nombre del archivo (a diferencia de Gofo). Los claims vienen en POSITIVO y
// aquí se guardan en NEGATIVO (montoGofo) para reutilizar sin cambios el motor
// de claims M1/M2/M3 de Mile Pay.
// ============================================================================
import * as XLSX from 'xlsx'
import { filasMatriz, toNum } from '../../utils/excel'

// Encabezado normalizado (mismo criterio que el parser de Gofo).
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Busca una hoja por nombre normalizado (tolera espacios/mayúsculas).
function hoja(wb, nombre) {
  const n = norm(nombre)
  const real = wb.SheetNames.find((s) => norm(s) === n) || wb.SheetNames.find((s) => norm(s).includes(n))
  return real ? wb.Sheets[real] : null
}

// Índices de columnas por encabezado (exacto → contiene → posición de respaldo).
function indices(headerRow, defs) {
  const norms = (headerRow || []).map(norm)
  const out = {}
  for (const [clave, candidatos, fallback] of defs) {
    let idx = -1
    for (const c of candidatos) { const i = norms.indexOf(norm(c)); if (i >= 0) { idx = i; break } }
    if (idx < 0) for (const c of candidatos) { const i = norms.findIndex((h) => h && h.includes(norm(c))); if (i >= 0) { idx = i; break } }
    out[clave] = idx >= 0 ? idx : (fallback ?? -1)
  }
  return out
}

// "0829-0904" + fechas reales → { semana, fechaInicioISO, fechaFinISO }.
function semanaDeNota(nota, fechas) {
  const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(String(nota || '').trim())
  // El AÑO sale de las fechas del detalle (la nota no lo trae).
  const anios = fechas.filter(Boolean).map((f) => new Date(f).getFullYear()).filter((y) => y > 2000)
  const anio = anios.length ? Math.max(...anios) : new Date().getFullYear()
  if (!m) return { semana: String(nota || ''), fechaInicioISO: null, fechaFinISO: null }
  const [, m1, d1, m2, d2] = m
  // Si el periodo cruza el año (dic→ene), el inicio es del año anterior.
  const anioIni = Number(m1) > Number(m2) ? anio - 1 : anio
  const iso = (a, mm, dd) => `${a}-${mm}-${dd}`
  return { semana: `${m1}${d1}-${m2}${d2}`, fechaInicioISO: iso(anioIni, m1, d1), fechaFinISO: iso(anio, m2, d2) }
}

// Categoría de claim propia de SpeedX (tipos vistos en la factura real).
export function categoriaClaimSpeedX(claimType) {
  const t = norm(claimType)
  if (t.includes('failedloading') || t.includes('loadingscan')) return 'fallo_escaneo'
  if (t.includes('faileddelivery')) return 'fallo_entrega'
  if (t.includes('lost') || t.includes('missing')) return 'perdido'
  if (t.includes('damage')) return 'danado'
  return 'otros'
}
export const CATEGORIAS_SPEEDX = [
  { id: 'fallo_entrega', label: 'Fallo de entrega' },
  { id: 'fallo_escaneo', label: 'Fallo de escaneo' },
  { id: 'perdido', label: 'Perdido' },
  { id: 'danado', label: 'Dañado' },
  { id: 'otros', label: 'Otros' },
]

// ── Parser principal ─────────────────────────────────────────────────────────
// arrayBuffer → { detalles, claims, driverSummary, oficial, semana, fechas,
//                 ciudad, fleet, verificacion, avisos }
export function procesarArchivoSpeedX(arrayBuffer, nombreArchivo = '') {
  const wb = XLSX.read(arrayBuffer, { type: 'array', raw: true })
  const avisos = []

  // ── 1) PLD: detalle por paquete ──────────────────────────────────────────
  const wsPld = hoja(wb, 'PLD')
  if (!wsPld) throw new Error('El archivo no trae la hoja "PLD" (detalle por paquete). ¿Es la factura de SpeedX?')
  const mPld = filasMatriz(wsPld)
  const iP = indices(mPld[0], [
    ['poe', ['POE'], 0],
    ['ruta', ['Route (Clean)', 'Route'], 1],
    ['zip', ['ZipCode'], 5],
    ['track', ['TrackingNo', 'Tracking Number'], 6],
    ['status', ['FinalStatus', 'Status'], 10],
    ['fechaEntrega', ['CompleteTime'], 11],
    ['peso', ['Weight'], 12],
    ['driver', ['DriverName'], 17],
    ['fleet', ['FleeName', 'Fleet Name'], 16],
    ['fecha', ['Date'], 31],
    ['rate', ['Rate'], 32],
    ['adj', ['Pay per stop adj.', 'Pay per stop'], 34],
    ['cat', ['Weight Category'], 35],
    ['temu', ['TEMU'], 39],
    ['monto', ['CONFIRM RATE'], 42],
    ['nota', ['NOTE'], 41],
  ])
  const detalles = []
  const vistos = new Set()
  let duplicadosInternos = 0
  for (let r = 1; r < mPld.length; r++) {
    const f = mPld[r]
    if (!f || f.every((v) => v === null || v === undefined || v === '')) continue
    const track = String(f[iP.track] ?? '').trim()
    if (!track) continue
    if (vistos.has(track)) { duplicadosInternos++; continue } // mismo tracking repetido: se cuenta 1 vez
    vistos.add(track)
    const rate = toNum(f[iP.rate])
    const adj = toNum(f[iP.adj])
    const monto = toNum(f[iP.monto])
    const catRaw = String(f[iP.cat] ?? '').trim()
    const esMenor1 = norm(catRaw) === norm('<1 lbs') || norm(catRaw).startsWith('1lbs') === false && /^<1/.test(catRaw)
    detalles.push({
      waybill: track,
      courier: String(f[iP.driver] ?? '').trim().replace(/\s+/g, ' '),
      ruta: String(f[iP.ruta] ?? '').trim() || 'Sin ruta',
      ciudad: String(f[iP.poe] ?? '').trim() || 'SPX',
      zip: String(f[iP.zip] ?? '').trim(),
      peso: toNum(f[iP.peso]),
      rangoPeso: catRaw || (toNum(f[iP.peso]) < 1 ? '<1 lbs' : '1-10 lbs'),
      esMenor1Lb: /^<\s*1/.test(catRaw) || (!catRaw && toNum(f[iP.peso]) < 1),
      temu: toNum(f[iP.temu]) === 1,
      rate, adj, monto,
      // Paquete ADICIONAL de la parada: SpeedX lo baja a la tarifa de stop (0.45).
      esStopAdicional: adj < 0,
      fecha: String(f[iP.fecha] ?? f[iP.fechaEntrega] ?? '').slice(0, 10),
      nota: String(f[iP.nota] ?? '').trim(),
      estado: String(f[iP.status] ?? '').trim(),
    })
  }
  if (!detalles.length) throw new Error('La hoja PLD no trae paquetes. Revisa el archivo.')
  if (duplicadosInternos) avisos.push(`${duplicadosInternos} tracking(s) repetidos dentro del PLD: se contaron una sola vez.`)
  const noEntregados = detalles.filter((d) => d.estado && norm(d.estado) !== 'delivered').length
  if (noEntregados) avisos.push(`${noEntregados} paquete(s) con estado distinto de DELIVERED (se incluyen igual: SpeedX los facturó).`)

  // Semana y fechas (del contenido).
  const notas = {}
  for (const d of detalles) if (d.nota) notas[d.nota] = (notas[d.nota] || 0) + 1
  const notaTop = Object.keys(notas).sort((a, b) => notas[b] - notas[a])[0] || ''
  const { semana, fechaInicioISO, fechaFinISO } = semanaDeNota(notaTop, detalles.map((d) => d.fecha))
  if (Object.keys(notas).length > 1) avisos.push(`El PLD mezcla ${Object.keys(notas).length} periodos (NOTE); se usa el más frecuente: ${notaTop}.`)

  const ciudad = detalles[0]?.ciudad || 'SPX'
  const fleet = String((mPld[1] || [])[iP.fleet] ?? '').trim()

  // ── 2) Claims ────────────────────────────────────────────────────────────
  const wsCl = hoja(wb, 'Claims')
  const claims = []
  if (wsCl) {
    const mCl = filasMatriz(wsCl)
    const iC = indices(mCl[0], [
      ['track', ['Tracking Number', 'TrackingNo'], 2],
      ['valor', ['Value'], 4],
      ['delFee', ['Del. Fee', 'Del Fee'], 5],
      ['total', ['Total Claim (Value,Del)', 'Total Claim'], 6],
      ['driver', ['Last delivery driver', 'Driver'], 8],
      ['periodo', ['Claim Period'], 9],
      ['ruta', ['Last Physical Delivery Route', 'Route'], 10],
      ['zip', ['Zip Code', 'ZipCode'], 11],
      ['tipo', ['Claim Type'], 12],
    ])
    for (let r = 1; r < mCl.length; r++) {
      const f = mCl[r]
      if (!f || !f[iC.track]) continue
      const total = toNum(f[iC.total]) || (toNum(f[iC.valor]) + toNum(f[iC.delFee]))
      const tipo = String(f[iC.tipo] ?? '').trim()
      claims.push({
        waybill: String(f[iC.track]).trim(),
        courier: String(f[iC.driver] ?? '').trim().replace(/\s+/g, ' '),
        date: String(f[iC.periodo] ?? '').trim(),
        postalCode: String(f[iC.zip] ?? '').trim(),
        claimType: tipo,
        categoria: categoriaClaimSpeedX(tipo),
        // NEGATIVO para reutilizar el motor M1/M2/M3 tal cual (M2 = |montoGofo|).
        montoGofo: -Math.abs(total),
        valor: toNum(f[iC.valor]),
        delFee: toNum(f[iC.delFee]),
        ruta: String(f[iC.ruta] ?? '').trim(),
        ciudad,
      })
    }
  } else avisos.push('El archivo no trae hoja "Claims": se asume semana sin claims.')

  // ── 3) Driver Summary (verificación) ─────────────────────────────────────
  const wsDs = hoja(wb, 'Driver Summary Version 2') || hoja(wb, 'Driver Summary')
  const driverSummary = []
  if (wsDs) {
    const mDs = filasMatriz(wsDs)
    const iD = indices(mDs[0], [
      ['nombre', ['Driver Name'], 0],
      ['volumen', ['Volume'], 1],
      ['temu', ['Volume TEMU'], 4],
      ['comp', ['Compensation'], 5],
      ['claimDed', ['Claim Deduction: $', 'Claim Deduction'], 6],
    ])
    // "<1 lbs" y ">1 lbs" se distinguen por el SÍMBOLO (la normalización lo
    // borra): se buscan sobre el encabezado crudo.
    const crudos = (mDs[0] || []).map((h) => String(h ?? ''))
    iD.men1 = crudos.findIndex((h) => /<\s*1/.test(h)); if (iD.men1 < 0) iD.men1 = 2
    iD.may1 = crudos.findIndex((h) => />\s*1/.test(h)); if (iD.may1 < 0) iD.may1 = 3
    for (let r = 1; r < mDs.length; r++) {
      const f = mDs[r]
      if (!f || f[iD.nombre] === null || f[iD.nombre] === undefined) continue
      const nombre = String(f[iD.nombre]).trim()
      // Sub-filas por tarifa (0.45/1.75/1.9) y la fila Grand Total se saltan.
      if (!nombre || !isNaN(Number(nombre)) || /grand\s*total/i.test(nombre)) continue
      driverSummary.push({
        courier: nombre.replace(/\s+/g, ' '),
        volumen: toNum(f[iD.volumen]),
        menor1: toNum(f[iD.men1]),
        mayor1: toNum(f[iD.may1]),
        temu: toNum(f[iD.temu]),
        compensacionCarrier: toNum(f[iD.comp]),
        claimDeduction: toNum(f[iD.claimDed]),
      })
    }
  }

  // ── 4) DSP Summary: totales oficiales ────────────────────────────────────
  const wsDsp = hoja(wb, 'DSP Summary')
  let oficial = null
  if (wsDsp) {
    const mD = filasMatriz(wsDsp)
    const iO = indices(mD[0], [
      ['brn', ['BRN'], 0],
      ['fleet', ['FLEET NAME'], 1],
      ['vendor', ['VENDOR ID'], 2],
      ['pcs', ['PCS'], 3],
      ['confirm', ['CONFIRM RATE'], 4],
      ['pmtAdjPrev', ['PMT ADJ'], 5],
      ['claimPrev', ['LAX CLAIM'], 6],
      ['total', ['TOTAL PAYMENT'], 8],
    ])
    // "CLAIM MMDD-MMDD" (semana actual): la columna que EMPIEZA con "claim"
    // (no "lax claim" ni "pmt adj"). Con candidatos normalizados chocaría con
    // "LAX CLAIM ...".
    const crudosD = (mD[0] || []).map((h) => norm(h))
    iO.claim = crudosD.findIndex((h) => h.startsWith('claim')); if (iO.claim < 0) iO.claim = 7
    // La fila de datos es la primera no vacía después del encabezado.
    const fila = mD.slice(1).find((f) => f && f.some((v) => v !== null && v !== ''))
    if (fila) {
      oficial = {
        brn: String(fila[iO.brn] ?? '').trim(),
        fleet: String(fila[iO.fleet] ?? '').trim(),
        vendorId: String(fila[iO.vendor] ?? '').trim(),
        pcs: toNum(fila[iO.pcs]),
        confirmRate: toNum(fila[iO.confirm]),
        ajustePrevio: toNum(fila[iO.pmtAdjPrev]),
        claimPrevio: toNum(fila[iO.claimPrev]),
        claim: toNum(fila[iO.claim]),
        totalPago: toNum(fila[iO.total]),
      }
    }
  }
  if (!oficial) avisos.push('El archivo no trae "DSP Summary": la verificación oficial queda incompleta.')

  // ── 5) Verificación cruzada (el "cuadra" de SpeedX) ──────────────────────
  const r2 = (n) => Math.round(n * 100) / 100
  const sumaDetalle = r2(detalles.reduce((a, d) => a + d.monto, 0))
  const sumaClaims = r2(claims.reduce((a, c) => a + Math.abs(c.montoGofo), 0))
  const totalCalculado = r2(sumaDetalle - sumaClaims + (oficial?.ajustePrevio || 0) + (oficial?.claimPrevio || 0))
  const verificacion = {
    paquetes: detalles.length,
    sumaDetalle,
    sumaClaims,
    totalCalculado,
    speedx: oficial ? {
      pcs: oficial.pcs, confirmRate: oficial.confirmRate, claim: oficial.claim,
      ajustePrevio: oficial.ajustePrevio, claimPrevio: oficial.claimPrevio, totalOficial: oficial.totalPago,
    } : null,
    difPaquetes: oficial ? detalles.length - oficial.pcs : null,
    difMonto: oficial ? r2(totalCalculado - oficial.totalPago) : null,
    cuadra: oficial ? (Math.abs(detalles.length - oficial.pcs) === 0 && Math.abs(totalCalculado - oficial.totalPago) < 0.01) : false,
  }

  return {
    carrier: 'speedx',
    nombreArchivo,
    fleet: oficial?.fleet || fleet,
    ciudad,
    semana, fechaInicioISO, fechaFinISO,
    detalles, claims, driverSummary, oficial,
    verificacion, avisos,
  }
}
