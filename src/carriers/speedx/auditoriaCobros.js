// ============================================================================
// SPEEDX · AUDITORÍA DE COBROS — lógica PURA (sin React, sin pdfjs, sin DOM),
// para poder probarla en Node y reutilizarla desde el navegador.
//
// Qué hace:
//   1) parsearEstadoCuenta(lineas): de las líneas de texto de un estado de cuenta
//      de Chase (o de filas de un CSV/Excel) saca los DEPÓSITOS de SpeedX
//      (los pagos que SpeedX te hizo), ignorando transferencias, Zelle, etc.
//   2) conciliar(depositos, facturas, opts): cruza esos pagos contra las
//      facturas de SpeedX (invoices, campo montoACobrar) y las clasifica en:
//        · cuadran        → pagada y el monto coincide (±tolerancia)
//        · diferencia     → pagada pero el monto NO coincide (de más o de menos)
//        · sinPagar       → factura sin ningún pago asociado
//        · sinFactura     → pago en el banco que no corresponde a ninguna factura
//      Maneja también pagos "en bloque" (un depósito que cubre varias facturas).
//
// NO escribe nada en la base de datos: es solo lectura / reporte.
// ============================================================================

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Identificadores por defecto de SpeedX en el estado de cuenta (editables desde
// la UI). Un depósito se considera "de SpeedX" si su descripción contiene el
// nombre o el Orig ID de la empresa.
export const SPEEDX_MARCADORES = {
  nombres: ['speed xpress', 'speedx', 'speed x'],
  origIds: ['1301303038'],
}

const MESES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may_es: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
}

// "October 01, 2026 through October 30, 2026" → { anioIni, anioFin, mesFin }
function leerPeriodo(lineas) {
  for (const l of lineas) {
    const m = l.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+through\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i)
    if (m) {
      return {
        mesIni: MESES[m[1].toLowerCase()] || null, diaIni: +m[2], anioIni: +m[3],
        mesFin: MESES[m[4].toLowerCase()] || null, diaFin: +m[5], anioFin: +m[6],
        texto: m[0],
      }
    }
  }
  return null
}

// Convierte "MM/DD" + año de referencia a ISO "YYYY-MM-DD". Si el estado cruza
// de diciembre a enero, ajusta el año para los meses de enero.
function fechaISO(mm, dd, periodo) {
  let anio = periodo?.anioIni || new Date().getFullYear()
  if (periodo && periodo.anioIni !== periodo.anioFin) {
    // período que cruza de año: meses >= mesIni usan anioIni, el resto anioFin
    if (periodo.mesIni && mm < periodo.mesIni) anio = periodo.anioFin
  }
  return `${anio}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

// Último número con formato de dinero en la línea (el AMOUNT va a la derecha).
function montoDeLinea(l) {
  const ms = l.match(/-?\$?\s?[\d,]+\.\d{2}/g)
  if (!ms || !ms.length) return null
  const ultimo = ms[ms.length - 1].replace(/[^0-9.-]/g, '')
  const n = parseFloat(ultimo)
  return Number.isFinite(n) ? n : null
}

function esDeSpeedX(texto, marcadores = SPEEDX_MARCADORES) {
  const t = (texto || '').toLowerCase()
  if ((marcadores.nombres || []).some((n) => t.includes(n.toLowerCase()))) return true
  if ((marcadores.origIds || []).some((id) => t.includes(String(id).toLowerCase()))) return true
  return false
}

// ----------------------------------------------------------------------------
// 1) PARSEAR el estado de cuenta (líneas de PDF de Chase).
// ----------------------------------------------------------------------------
export function parsearEstadoCuenta(lineas, { marcadores = SPEEDX_MARCADORES } = {}) {
  const periodo = leerPeriodo(lineas)
  const avisos = []
  const depositos = []        // solo SpeedX
  const todosDepositos = []   // todos los depósitos (para "pago sin factura" amplio)

  // Delimitar la sección de DEPÓSITOS para no tomar retiros por error.
  let enDepositos = false
  let vistoSeccion = false
  for (const l of lineas) {
    const low = l.toLowerCase()
    if (/deposits and additions/.test(low) && !/total deposits/.test(low)) { enDepositos = true; vistoSeccion = true; continue }
    if (/electronic withdrawal|total deposits and additions|checking summary|daily ending balance/.test(low)) { enDepositos = false }

    // Línea de movimiento: empieza con MM/DD y trae un monto a la derecha.
    const fm = l.match(/^(\d{1,2})\/(\d{1,2})\b/)
    if (!fm) continue
    const monto = montoDeLinea(l)
    if (monto == null) continue
    // En DEPOSITS los montos son positivos (entra plata).
    if (!vistoSeccion || enDepositos) {
      const mm = +fm[1], dd = +fm[2]
      const iso = fechaISO(mm, dd, periodo)
      const reg = { fecha: iso, fechaCorta: `${fm[1]}/${fm[2]}`, monto: r2(Math.abs(monto)), descripcion: l.replace(/\s+/g, ' ').trim() }
      todosDepositos.push(reg)
      if (esDeSpeedX(l, marcadores)) depositos.push(reg)
    }
  }

  if (!periodo) avisos.push('No pude leer el período del estado de cuenta; usé el año actual para las fechas.')
  if (!depositos.length) avisos.push('No encontré depósitos de SpeedX en este estado de cuenta. Revisa los identificadores (nombre / Orig ID) o que sea el archivo correcto.')

  return { periodo, depositos, todosDepositos, avisos }
}

// ----------------------------------------------------------------------------
// Filas de CSV/Excel → mismo formato de depósitos. Detecta columnas de fecha,
// descripción y monto por nombre de encabezado (Chase export y genéricos).
// `filas` = array de objetos (xlsx sheet_to_json) o array de arrays.
// ----------------------------------------------------------------------------
export function depositosDeFilas(filas, { marcadores = SPEEDX_MARCADORES } = {}) {
  const depositos = []
  const todosDepositos = []
  const avisos = []
  if (!filas || !filas.length) return { depositos, todosDepositos, avisos: ['El archivo no tiene filas.'] }

  const claves = Object.keys(filas[0] || {})
  const buscar = (cands) => claves.find((k) => cands.some((c) => k.toLowerCase().replace(/\s+/g, '').includes(c)))
  const kFecha = buscar(['postingdate', 'fecha', 'date'])
  const kDesc = buscar(['description', 'descripcion', 'detail', 'concepto', 'memo'])
  const kMonto = buscar(['amount', 'monto', 'credit', 'deposito', 'deposit'])
  const kTipo = buscar(['type', 'tipo', 'details'])

  if (!kMonto) avisos.push('No encontré la columna de monto (Amount). Revisa el archivo.')

  for (const f of filas) {
    const rawMonto = kMonto ? f[kMonto] : null
    const monto = typeof rawMonto === 'number' ? rawMonto : parseFloat(String(rawMonto ?? '').replace(/[^0-9.-]/g, ''))
    if (!Number.isFinite(monto) || monto === 0) continue
    // Solo créditos (entradas): monto positivo, o Details = CREDIT.
    const tipo = kTipo ? String(f[kTipo] || '').toLowerCase() : ''
    const esCredito = monto > 0 || /credit|deposit|dep\b/.test(tipo)
    if (!esCredito) continue
    const desc = kDesc ? String(f[kDesc] || '') : ''
    const fechaRaw = kFecha ? f[kFecha] : ''
    const reg = { fecha: normalizarFecha(fechaRaw), fechaCorta: String(fechaRaw), monto: r2(Math.abs(monto)), descripcion: desc.replace(/\s+/g, ' ').trim() }
    todosDepositos.push(reg)
    if (esDeSpeedX(desc, marcadores)) depositos.push(reg)
  }
  if (!depositos.length) avisos.push('No encontré depósitos de SpeedX en el archivo. Revisa los identificadores o que sea el archivo correcto.')
  return { depositos, todosDepositos, avisos }
}

function normalizarFecha(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` }
  return s
}

// ----------------------------------------------------------------------------
// 2) CONCILIAR depósitos ↔ facturas.
//   facturas: [{ id, montoACobrar, semana, semanaSpeedX, ciudad, fleet, fechaFin, estadoCobro }]
//   opts.tol: tolerancia en $ para considerar que "cuadra" (default 5)
//   opts.bandaDiferencia: % para marcar "diferencia" vs "sin factura" (default 0.25)
// ----------------------------------------------------------------------------
export function conciliar(depositos, facturas, opts = {}) {
  const tol = opts.tol != null ? Number(opts.tol) : 5
  const banda = opts.bandaDiferencia != null ? Number(opts.bandaDiferencia) : 0.25

  const deps = (depositos || []).map((d, i) => ({ ...d, _id: 'd' + i, usado: false }))
  const facs = (facturas || [])
    .map((f, i) => ({
      ref: f, _id: 'f' + i, usado: false,
      monto: r2(Number(f.montoACobrar) || 0),
      etiqueta: f.ciudad || f.ciudadNombre || f.fleet || '—',
      semana: f.semanaSpeedX || f.semana || '',
    }))
    .filter((f) => f.monto > 0)

  const cuadran = []      // { factura, deposito, dif }
  const diferencia = []   // { factura, deposito, dif }
  const bloques = []      // { deposito, facturas:[...], dif }  (un pago cubre varias)

  // --- Paso 1: match 1:1 dentro de tolerancia (preferir el de menor diferencia).
  const pares = []
  for (const d of deps) for (const f of facs) {
    const dif = r2(d.monto - f.monto)
    if (Math.abs(dif) <= tol) pares.push({ d, f, adif: Math.abs(dif), dif })
  }
  pares.sort((a, b) => a.adif - b.adif)
  for (const p of pares) {
    if (p.d.usado || p.f.usado) continue
    p.d.usado = true; p.f.usado = true
    cuadran.push({ factura: p.f, deposito: p.d, dif: p.dif })
  }

  // --- Paso 2: pago en BLOQUE — un depósito = suma de 2..4 facturas (±tol).
  const facLibres = () => facs.filter((f) => !f.usado)
  for (const d of deps) {
    if (d.usado) continue
    const libres = facLibres()
    const combo = buscarSubconjunto(libres, d.monto, tol, 4)
    if (combo) {
      d.usado = true
      combo.forEach((f) => { f.usado = true })
      const suma = r2(combo.reduce((a, f) => a + f.monto, 0))
      bloques.push({ deposito: d, facturas: combo, dif: r2(d.monto - suma) })
    }
  }

  // --- Paso 3: diferencia — depósito cerca de una factura (fuera de tol pero
  // dentro de la banda) → pagada con monto distinto.
  for (const d of deps) {
    if (d.usado) continue
    let mejor = null
    for (const f of facLibres()) {
      const dif = Math.abs(d.monto - f.monto)
      const limite = Math.max(tol, f.monto * banda)
      if (dif <= limite && (!mejor || dif < mejor.adif)) mejor = { f, adif: dif, dif: r2(d.monto - f.monto) }
    }
    if (mejor) {
      d.usado = true; mejor.f.usado = true
      diferencia.push({ factura: mejor.f, deposito: d, dif: mejor.dif })
    }
  }

  // --- Sobrantes.
  const sinFactura = deps.filter((d) => !d.usado).map((d) => ({ deposito: d }))
  const sinPagar = facs.filter((f) => !f.usado).map((f) => ({ factura: f }))

  // --- Totales.
  const sum = (arr, sel) => r2(arr.reduce((a, x) => a + sel(x), 0))
  const totales = {
    nDepositos: deps.length,
    nFacturas: facs.length,
    montoDepositado: sum(deps, (d) => d.monto),
    montoFacturado: sum(facs, (f) => f.monto),
    nCuadran: cuadran.length,
    nDiferencia: diferencia.length,
    nBloques: bloques.length,
    facturasEnBloques: bloques.reduce((a, b) => a + b.facturas.length, 0),
    nSinPagar: sinPagar.length,
    nSinFactura: sinFactura.length,
    montoCuadran: sum(cuadran, (x) => x.factura.monto),
    montoDiferencia: sum(diferencia, (x) => x.deposito.monto),
    montoSinPagar: sum(sinPagar, (x) => x.factura.monto),
    montoSinFactura: sum(sinFactura, (x) => x.deposito.monto),
    totalDiferencias: sum(diferencia, (x) => x.dif),
  }

  return { cuadran, diferencia, bloques, sinPagar, sinFactura, totales, tol, banda }
}

// Subconjunto de `items` (cada uno con .monto) cuya suma ≈ objetivo (±tol),
// de tamaño 2..maxN. Devuelve el array de items o null. Prioriza el de menor
// cantidad de facturas y menor diferencia.
function buscarSubconjunto(items, objetivo, tol, maxN) {
  const n = items.length
  if (n < 2) return null
  let mejor = null
  const combinar = (inicio, elegidos, suma) => {
    if (elegidos.length >= 2) {
      const dif = Math.abs(suma - objetivo)
      if (dif <= tol && (!mejor || elegidos.length < mejor.items.length || (elegidos.length === mejor.items.length && dif < mejor.dif))) {
        mejor = { items: elegidos.slice(), dif }
      }
    }
    if (elegidos.length >= maxN) return
    for (let i = inicio; i < n; i++) {
      if (suma + items[i].monto - objetivo > tol && suma + items[i].monto > objetivo + tol) continue
      elegidos.push(items[i])
      combinar(i + 1, elegidos, r2(suma + items[i].monto))
      elegidos.pop()
    }
  }
  combinar(0, [], 0)
  return mejor ? mejor.items : null
}

// ----------------------------------------------------------------------------
// 3) CONCILIAR POR SEMANA — así es como SpeedX paga de verdad: una (o dos)
//    transferencias por semana que CUBREN TODAS las facturas de esa semana
//    (todas las ciudades/flotas juntas), a veces con un pequeño descuento.
//    Agrupa las facturas por semana y casa el TOTAL de la semana contra la(s)
//    transferencia(s), tolerando el ajuste de SpeedX.
//      opts.tol        : margen para "cuadra exacto" (default 5)
//      opts.ajustePct  : % máximo que SpeedX puede descontar/ajustar (default 0.04)
//      opts.ajusteMax  : tope en $ de ese ajuste (default 2500)
// ----------------------------------------------------------------------------
export function conciliarSemana(depositos, facturas, opts = {}) {
  const tol = opts.tol != null ? Number(opts.tol) : 5
  const ajustePct = opts.ajustePct != null ? Number(opts.ajustePct) : 0.04
  const ajusteMax = opts.ajusteMax != null ? Number(opts.ajusteMax) : 2500

  // Agrupar facturas por semana.
  const mapa = {}
  for (const f of facturas || []) {
    const m = r2(Number(f.montoACobrar) || 0)
    if (m <= 0) continue
    const sem = f.semana || f.semanaSpeedX || '—'
    if (!mapa[sem]) mapa[sem] = { semana: sem, facturas: [], total: 0 }
    mapa[sem].facturas.push({ ...f, monto: m, etiqueta: f.ciudad || f.ciudadNombre || f.fleet || '—' })
    mapa[sem].total = r2(mapa[sem].total + m)
  }
  const semanas = Object.values(mapa).sort((a, b) => (a.semana < b.semana ? -1 : a.semana > b.semana ? 1 : 0))

  const deps = (depositos || []).map((d, i) => ({ ...d, _id: 'd' + i, usado: false, monto: r2(d.monto) }))
  const bandaDe = (total) => Math.max(tol, Math.min(ajusteMax, Math.abs(total) * ajustePct))

  // Mejor grupo de depósitos libres (1 solo o combo 2-3) cuya suma ≈ objetivo.
  function mejorGrupo(objetivo, banda) {
    const libres = deps.filter((d) => !d.usado)
    let best = null
    for (const d of libres) {
      const dif = Math.abs(d.monto - objetivo)
      if (dif <= banda && (!best || dif < best.adif)) best = { pagos: [d], adif: dif }
    }
    const combo = buscarSubconjunto(libres, objetivo, banda, 3)
    if (combo) {
      const suma = r2(combo.reduce((a, d) => a + d.monto, 0))
      const dif = Math.abs(suma - objetivo)
      if (!best || dif < best.adif) best = { pagos: combo, adif: dif }
    }
    return best
  }

  const pagadas = []
  const asignar = (banda) => {
    for (const s of semanas) {
      if (s._done) continue
      const m = mejorGrupo(s.total, typeof banda === 'function' ? banda(s.total) : banda)
      if (!m) continue
      m.pagos.forEach((d) => { d.usado = true })
      s._done = true
      const totalPagado = r2(m.pagos.reduce((a, d) => a + d.monto, 0))
      pagadas.push({ semana: s.semana, facturas: s.facturas, total: s.total, pagos: m.pagos, totalPagado, dif: r2(totalPagado - s.total) })
    }
  }
  asignar(tol)        // 1º los exactos
  asignar(bandaDe)    // 2º los que tienen ajuste de SpeedX

  const pendientes = semanas.filter((s) => !s._done).map((s) => ({ semana: s.semana, facturas: s.facturas, total: s.total }))
  const pagosSinSemana = deps.filter((d) => !d.usado)
  pagadas.sort((a, b) => (a.semana < b.semana ? -1 : a.semana > b.semana ? 1 : 0))

  const sum = (arr, sel) => r2(arr.reduce((a, x) => a + sel(x), 0))
  const cuadran = pagadas.filter((p) => Math.abs(p.dif) <= tol)
  const conAjuste = pagadas.filter((p) => Math.abs(p.dif) > tol)
  const totales = {
    nSemanas: semanas.length,
    totalFacturado: sum(semanas, (s) => s.total),
    totalPagado: sum(deps.filter((d) => d.usado), (d) => d.monto),
    nPagadas: pagadas.length,
    nCuadran: cuadran.length,
    nConAjuste: conAjuste.length,
    nPendientes: pendientes.length,
    totalPendiente: sum(pendientes, (s) => s.total),
    totalAjustes: sum(pagadas, (p) => p.dif), // negativo = SpeedX descontó
    nPagosSinSemana: pagosSinSemana.length,
    totalPagosSinSemana: sum(pagosSinSemana, (d) => d.monto),
  }
  return { pagadas, cuadran, conAjuste, pendientes, pagosSinSemana, semanas, totales, tol }
}
