// ---------------------------------------------------------------------------
// Cálculos de negocio derivados del resumen de una factura.
// Reglas por defecto: doble = monto 0.5 ; CLAIM_FEE = $100 por claim no perdonado.
// Ambas son CONFIGURABLES por empresa y por ciudad (ver resolverReglas). El pago
// = individuales*tarifaInd + dobles*tarifaDoble - claimsNoPerdonados*claimFee.
// ---------------------------------------------------------------------------
import { CLAIM_FEE, DOBLE_MONTO, TIPOS_CLAIM_REDUCIDO, UMBRAL_CAMBIO_PRECIO, nombreCiudad, PESOS_CALIF_CHOFER, PESOS_CALIF_CIUDAD, UMBRALES_CALIF, UMBRALES_ESTRELLAS, CALIDAD_FACTOR, BASE_PROMEDIO } from '../constants'

export const TODAS = 'todas'

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v))

// ---- reglas de cálculo configurables (empresa → ciudad → global) -------------
const numONull = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null }

// Resuelve claimFee y dobleMonto para una ciudad, con jerarquía:
//   ciudad (si la definió) → empresa (default de la empresa) → global (100 / 0.5).
// `ajustes` = settings/{companyId} con { reglas:{claimFee,dobleMonto},
//   reglasCiudad:{ [codigoCiudad]: {claimFee?, dobleMonto?} } }.
export function resolverReglas(ajustes, ciudad) {
  const emp = ajustes?.reglas || {}
  const ciu = (ajustes?.reglasCiudad && ajustes.reglasCiudad[ciudad]) || {}
  const claimFee = numONull(ciu.claimFee) ?? numONull(emp.claimFee) ?? CLAIM_FEE
  const dobleMonto = numONull(ciu.dobleMonto) ?? numONull(emp.dobleMonto) ?? DOBLE_MONTO
  // Multa REDUCIDA (tracking interruption / lost). Si no se configura, es igual a
  // la general (así el histórico y las empresas que no la usan no cambian nada).
  const claimFeeReducido = numONull(ciu.claimFeeReducido) ?? numONull(emp.claimFeeReducido) ?? claimFee
  return { claimFee, dobleMonto, claimFeeReducido }
}

// ¿Este tipo de claim paga la multa REDUCIDA? (tracking interruption / lost)
export function esClaimReducido(claimType) {
  return TIPOS_CLAIM_REDUCIDO.includes(String(claimType || '').trim().toLowerCase())
}

// ¿Un paquete es "doble" según la regla (monto == dobleMonto, con tolerancia)?
export function esDoblePorRegla(monto, dobleMonto = DOBLE_MONTO) {
  return Math.abs((Number(monto) || 0) - (Number(dobleMonto) || 0)) < 1e-9
}

// claimFee aplicado a una factura para una ciudad concreta. Usa las reglas que se
// guardaron EN la factura al procesarla (histórico consistente); si no existen
// (facturas antiguas), cae al valor global 100.
export function claimFeeDe(inv, ciudad) {
  const r = inv?.reglasAplicadas && inv.reglasAplicadas[ciudad]
  if (r && numONull(r.claimFee) != null) return Number(r.claimFee)
  if (inv?.reglaEmpresa && numONull(inv.reglaEmpresa.claimFee) != null) return Number(inv.reglaEmpresa.claimFee)
  return CLAIM_FEE
}

// Multa REDUCIDA aplicada (para tracking interruption / lost). Si la factura no la
// guardó (histórico), cae a la multa general → sin cambio en datos existentes.
export function claimFeeReducidoDe(inv, ciudad) {
  const r = inv?.reglasAplicadas && inv.reglasAplicadas[ciudad]
  if (r && numONull(r.claimFeeReducido) != null) return Number(r.claimFeeReducido)
  if (inv?.reglaEmpresa && numONull(inv.reglaEmpresa.claimFeeReducido) != null) return Number(inv.reglaEmpresa.claimFeeReducido)
  return claimFeeDe(inv, ciudad)
}

// Multa que le corresponde a UN claim según su tipo: reducida para los tipos
// especiales (tracking interruption / lost), general para el resto.
export function feeDeClaim(inv, ciudad, claimType) {
  return esClaimReducido(claimType) ? claimFeeReducidoDe(inv, ciudad) : claimFeeDe(inv, ciudad)
}

// ---- calificación de choferes ------------------------------------------------
// Promedios de la flota (para comparar productividad y rentabilidad).
export function promediosFlota(pagos) {
  const lista = (pagos || []).filter((p) => (p.individuales + p.dobles) > 0)
  const n = lista.length || 1
  const paquetes = lista.reduce((a, p) => a + (p.individuales + p.dobles), 0) / n
  const ganancia = lista.reduce((a, p) => a + (p.ganancia || 0), 0) / n
  return { paquetes, ganancia, n: lista.length }
}

const nivelSub = (s) => (s >= 80 ? 'excelente' : s >= 60 ? 'alta' : s >= 40 ? 'media' : 'baja')

// Estrellas 1-5 a partir del puntaje (bandas en constants).
export function estrellasDe(puntaje) {
  const p = Number(puntaje) || 0
  for (const u of UMBRALES_ESTRELLAS) if (p >= u.min) return u.estrellas
  return 1
}

// Calcula la calificación 0-100 de un chofer combinando calidad, productividad
// y rentabilidad (pesos en constants). Devuelve subpuntajes, nivel y desglose.
export function calificarChofer(pago, prom) {
  const paquetes = pago.paquetes ?? (pago.individuales + pago.dobles)
  const claims = pago.claimsTotales || 0
  const claimsPor100 = paquetes > 0 ? (claims / paquetes) * 100 : 0
  const calidad = clamp(100 - claimsPor100 * CALIDAD_FACTOR)
  const productividad = prom?.paquetes > 0 ? clamp(BASE_PROMEDIO * (paquetes / prom.paquetes)) : 50
  const rentabilidad = prom?.ganancia > 0 ? clamp(BASE_PROMEDIO * ((pago.ganancia || 0) / prom.ganancia)) : (pago.ganancia >= 0 ? 50 : 0)
  const w = PESOS_CALIF_CHOFER
  const puntaje = Math.round(w.calidad * calidad + w.productividad * productividad + w.rentabilidad * rentabilidad)
  const nivel = puntaje >= UMBRALES_CALIF.bueno ? 'bueno' : puntaje >= UMBRALES_CALIF.regular ? 'regular' : 'malo'
  const etiqueta = nivel === 'bueno' ? 'Bueno' : nivel === 'regular' ? 'Regular' : 'Malo'
  return {
    puntaje,
    estrellas: estrellasDe(puntaje),
    calidad, productividad, rentabilidad,
    nivel, etiqueta,
    desglose: `Calidad: ${nivelSub(calidad)} · Productividad: ${nivelSub(productividad)} · Rentabilidad: ${nivelSub(rentabilidad)}`,
  }
}

// Filtra un arreglo del resumen por ciudad. `campo` es la clave que guarda el código.
export function porCiudad(arr, ciudad, campo = 'ciudad') {
  if (!arr) return []
  if (!ciudad || ciudad === TODAS) return arr
  return arr.filter((x) => (x[campo] || x.ubicacion) === ciudad)
}

// Lista de ciudades disponibles (códigos) presentes en una factura.
export function ciudadesDeFactura(inv) {
  if (!inv) return []
  const set = new Set()
  ;(inv.resumenCiudades || []).forEach((c) => set.add(c.ubicacion))
  return [...set].filter(Boolean).sort()
}

// Nombre legible de una ciudad para una factura concreta: primero el mapa
// guardado (ciudades personalizadas), luego el resumen, luego la tabla estándar.
export function nombreCiudadDe(inv, code) {
  if (inv?.ciudadesMap && inv.ciudadesMap[code]) return inv.ciudadesMap[code]
  const r = (inv?.resumenCiudades || []).find((c) => c.ubicacion === code)
  if (r?.nombreCiudad) return r.nombreCiudad
  return nombreCiudad(code)
}

// Totales globales respetando el filtro de ciudad, calculados desde resumenChoferes/Rutas.
export function totalesFiltrados(inv, ciudad) {
  const choferes = porCiudad(inv?.resumenChoferes || [], ciudad)
  const rutas = porCiudad(inv?.resumenRutas || [], ciudad)
  const ingreso = choferes.reduce((a, c) => a + c.ingreso, 0)
  const individuales = choferes.reduce((a, c) => a + c.individuales, 0)
  const dobles = choferes.reduce((a, c) => a + c.dobles, 0)
  const numClaims = choferes.reduce((a, c) => a + c.numClaims, 0)
  const paquetes = individuales + dobles
  return {
    ingreso,
    individuales,
    dobles,
    paquetes,
    numClaims,
    pctDobles: paquetes > 0 ? dobles / paquetes : 0,
    numChoferes: choferes.length,
    numRutas: rutas.length,
  }
}

// Empareja un chofer del resumen con su tarifa en `drivers` (por nombre, texto).
export function buscarDriver(drivers, nombre) {
  if (!drivers || !nombre) return null
  const n = nombre.trim().toLowerCase()
  return drivers.find((d) => (d.nombre || '').trim().toLowerCase() === n) || null
}

// ---- claims repetidos y conteo canónico --------------------------------------
// Un claim puede tener `estadoRevision`:
//   undefined / 'aprobado' -> cuenta como válido
//   'anulado'              -> no cuenta (reversión rechazada por el dueño)
//   'pendiente'            -> repetido sin decidir; no cuenta hasta aprobarse
// Un caso REPETIDO = un mismo Waybill No. que aparece >1 vez dentro de la MISMA
// factura (invoiceId). Suele ser un claim (monto negativo) + su reversión
// (monto positivo). El dueño decide manualmente si el caso se aprueba o se anula.

// Clave de agrupación: factura + waybill (para no cruzar facturas distintas).
function claveWaybill(c) {
  const wb = (c.waybill || '').trim()
  return `${c.invoiceId || ''}||${wb || `__${c.id || Math.random()}`}`
}

// Detecta los casos de waybill repetido en un conjunto de claims.
// Devuelve [{ waybill, invoiceId, courier, estado, claims: [...] }].
export function detectarClaimsRepetidos(claims) {
  const grupos = {}
  for (const c of claims || []) {
    if (!(c.waybill || '').trim()) continue
    const k = claveWaybill(c)
    ;(grupos[k] = grupos[k] || []).push(c)
  }
  return Object.values(grupos)
    .filter((arr) => arr.length > 1)
    .map((arr) => ({
      waybill: (arr[0].waybill || '').trim(),
      invoiceId: arr[0].invoiceId || '',
      courier: arr[0].courier,
      ciudad: arr[0].ciudad || '',
      estado: arr[0].estadoRevision || 'pendiente',
      claims: arr,
    }))
}

// Casos repetidos aún sin resolver (pendientes de aprobación del dueño).
export function claimsRepetidosPendientes(claims) {
  return detectarClaimsRepetidos(claims).filter((g) => (g.estado || 'pendiente') === 'pendiente')
}

// Conteo CANÓNICO: lista de claims VÁLIDOS (mismo criterio en todo el sistema).
// - No repetido: cuenta salvo que esté 'anulado'.
// - Repetido: cuenta UNA vez y solo si el caso está 'aprobado' (representado por
//   el claim de monto negativo, el "real"); 'pendiente'/'anulado' no cuentan.
export function claimsValidos(claims) {
  const grupos = {}
  for (const c of claims || []) {
    const k = claveWaybill(c)
    ;(grupos[k] = grupos[k] || []).push(c)
  }
  const validos = []
  for (const arr of Object.values(grupos)) {
    if (arr.length === 1) {
      if (arr[0].estadoRevision !== 'anulado') validos.push(arr[0])
    } else {
      const estado = arr[0].estadoRevision || 'pendiente'
      if (estado === 'aprobado') {
        const real = arr.find((c) => Number(c.montoGofo) < 0) || arr[0]
        validos.push(real)
      }
    }
  }
  return validos
}

// Número oficial de claims válidos.
export function contarClaimsValidos(claims) {
  return claimsValidos(claims).length
}

// Claims activos (válidos y no perdonados) por chofer → base del cobro de $100.
export function claimsActivosPorChofer(claims) {
  const map = {}
  for (const c of claimsValidos(claims)) {
    if (c.perdonado) continue
    map[c.courier] = (map[c.courier] || 0) + 1
  }
  return map
}

// Igual que el anterior, pero devuelve la LISTA de claims activos por chofer
// (para poder cobrar una multa distinta según el tipo de cada claim).
export function claimsActivosDetallePorChofer(claims) {
  const map = {}
  for (const c of claimsValidos(claims)) {
    if (c.perdonado) continue
    ;(map[c.courier] = map[c.courier] || []).push(c)
  }
  return map
}

// Claims válidos (perdonados incluidos) por chofer → conteo de calidad.
export function claimsValidosPorChofer(claims) {
  const map = {}
  for (const c of claimsValidos(claims)) map[c.courier] = (map[c.courier] || 0) + 1
  return map
}

// Calcula la nómina (payroll) por chofer para una factura, con el filtro de ciudad.
// Devuelve filas con ingreso, tarifas, descuento de claims, total a pagar y ganancia.
export function calcularPagos(inv, claims, drivers, ciudad) {
  const choferes = porCiudad(inv?.resumenChoferes || [], ciudad)
  const activosDet = claimsActivosDetallePorChofer(claims) // lista de claims activos por chofer
  const totalClaimsPorChofer = claimsValidosPorChofer(claims) // válidos (incluye perdonados)
  // Monto que Gofo descontó por chofer (suma de |montoGofo| de sus claims válidos).
  const descuentoGofoPorChofer = {}
  for (const c of claimsValidos(claims)) descuentoGofoPorChofer[c.courier] = (descuentoGofoPorChofer[c.courier] || 0) + Math.abs(Number(c.montoGofo) || 0)

  return choferes.map((ch) => {
    const driver = buscarDriver(drivers, ch.nombre)
    const tarifaInd = driver ? Number(driver.precioIndividual) || 0 : 0
    const tarifaDoble = driver ? Number(driver.precioDoble) || 0 : 0
    const misActivos = activosDet[ch.nombre] || []
    const claimsActivos = misActivos.length
    const claimsTotales = totalClaimsPorChofer[ch.nombre] || 0
    const claimsPerdonados = claimsTotales - claimsActivos
    // Multa por CADA claim activo según su tipo: reducida para tracking
    // interruption / lost, general para el resto (config empresa→ciudad guardada).
    const claimFee = claimFeeDe(inv, ch.ciudad) // general (referencia/visualización)
    const descuentoClaims = misActivos.reduce((a, cl) => a + feeDeClaim(inv, ch.ciudad, cl.claimType), 0)
    const descontadoGofo = descuentoGofoPorChofer[ch.nombre] || 0
    const pagoBase = ch.individuales * tarifaInd + ch.dobles * tarifaDoble
    const totalPagar = pagoBase - descuentoClaims
    return {
      nombre: ch.nombre,
      ciudad: ch.ciudad,
      nombreCiudad: nombreCiudad(ch.ciudad),
      individuales: ch.individuales,
      dobles: ch.dobles,
      ingreso: ch.ingreso,
      tarifaInd,
      tarifaDoble,
      sinTarifa: !driver,
      claimFee,
      claimsTotales,
      claimsActivos,
      claimsPerdonados,
      descuentoClaims,
      descontadoGofo,
      gananciaClaims: descuentoClaims - descontadoGofo,
      totalPagar,
      ganancia: ch.ingreso - totalPagar,
    }
  })
}

// Estimación rápida de totales de una factura (sin depender de la colección de
// claims perdonados). Trata todos los claims como activos. Útil para comparar
// tendencia semana-a-semana en los KPIs.
export function resumenEstimado(inv, drivers, ciudad) {
  const choferes = porCiudad(inv?.resumenChoferes || [], ciudad)
  let ingreso = 0, costo = 0, individuales = 0, dobles = 0, claims = 0
  for (const ch of choferes) {
    const driver = buscarDriver(drivers, ch.nombre)
    const tInd = driver ? Number(driver.precioIndividual) || 0 : 0
    const tDob = driver ? Number(driver.precioDoble) || 0 : 0
    ingreso += ch.ingreso
    individuales += ch.individuales
    dobles += ch.dobles
    claims += ch.numClaims
    costo += ch.individuales * tInd + ch.dobles * tDob - ch.numClaims * CLAIM_FEE
  }
  const paquetes = individuales + dobles
  return {
    ingreso,
    costo,
    ganancia: ingreso - costo,
    individuales,
    dobles,
    paquetes,
    claims,
    pctDobles: paquetes > 0 ? dobles / paquetes : 0,
    margen: ingreso > 0 ? (ingreso - costo) / ingreso : 0,
  }
}

// Variación relativa (para flechas ▲▼). null si no hay base comparable.
export function variacion(actual, anterior) {
  if (anterior == null || anterior === 0) return null
  return (actual - anterior) / Math.abs(anterior)
}

// Costo semanal de los managers activos × número de semanas del periodo.
// Cada manager pertenece a UNA ciudad (campo `ciudad`). Con `ciudad` se cuenta
// solo esa ciudad; con "Todas" (o sin ciudad) se suman todas las ciudades.
export function costoManagers(managers, semanas = 1, ciudad) {
  const esTodas = !ciudad || ciudad === TODAS
  const base = (managers || [])
    .filter((m) => m.activo !== false)
    .filter((m) => esTodas || (m.ciudad || '') === ciudad)
    .reduce((a, m) => a + (Number(m.sueldoSemanal) || 0), 0)
  return base * (semanas || 1)
}

// Ganancia real = ingresoNeto − costoChoferes − costoManagers.
// ingresoNeto: si "Todas", el neto verificado (entregas+offset+claims+ajustes);
// si una ciudad, se aproxima con entregas(ciudad) + claimsGofo(ciudad).
// El costo de managers respeta el filtro de ciudad (solo los de esa ciudad, o el
// total si es "Todas").
export function gananciaRealDe(inv, claims, drivers, managers, ciudad, semanas = 1) {
  const pagos = calcularPagos(inv, claims, drivers, ciudad)
  const costoChoferes = pagos.reduce((a, p) => a + p.totalPagar, 0)
  const esTodas = !ciudad || ciudad === TODAS
  let ingresoNeto
  if (esTodas && inv?.verificacion) {
    ingresoNeto = inv.verificacion.netoCalculado
  } else {
    const entregas = porCiudad(inv?.resumenCiudades || [], ciudad).reduce((a, c) => a + c.ingreso, 0)
    const claimsGofo = porCiudad(claims || [], ciudad).reduce((a, c) => a + (c.montoGofo || 0), 0)
    ingresoNeto = entregas + claimsGofo
  }
  const cMgr = costoManagers(managers, semanas, ciudad)
  const ganancia = ingresoNeto - costoChoferes - cMgr
  return {
    ingresoNeto,
    costoChoferes,
    costoManagers: cMgr,
    gananciaReal: ganancia,
    margen: ingresoNeto > 0 ? ganancia / ingresoNeto : 0,
    ingresoAprox: !esTodas, // en una ciudad el ingreso neto es aproximado
  }
}

// Desglose de ganancia real POR CIUDAD (una fila por ciudad de la factura).
export function desgloseGananciaCiudades(inv, claims, drivers, managers, semanas = 1) {
  return (inv?.resumenCiudades || [])
    .map((c) => {
      const g = gananciaRealDe(inv, claims, drivers, managers, c.ubicacion, semanas)
      return { code: c.ubicacion, nombreCiudad: nombreCiudadDe(inv, c.ubicacion), ...g }
    })
    .sort((a, b) => b.gananciaReal - a.gananciaReal)
}

// Economía de claims. El chofer paga la MULTA (claimFee, configurable por ciudad)
// por cada claim NO perdonado. Gofo descuenta un monto variable (montoGofo) por
// cada claim, ya incluido en el neto. Perdonar = no cobrar la multa y ABSORBER el
// monto que Gofo cobró.
// `feeDe(ciudad)` resuelve la multa por ciudad; por defecto usa CLAIM_FEE (100),
// así que sin pasarlo el resultado es idéntico al actual.
export function economiaClaims(claims, feeDe) {
  const fee = typeof feeDe === 'function' ? feeDe : () => CLAIM_FEE
  const validos = claimsValidos(claims)
  const total = validos.length
  const perdonados = validos.filter((c) => c.perdonado).length
  const activos = total - perdonados
  const cobradoChoferes = validos.filter((c) => !c.perdonado).reduce((a, c) => a + fee(c.ciudad), 0)
  const descontadoGofo = validos.reduce((a, c) => a + Math.abs(Number(c.montoGofo) || 0), 0)
  const perdidaAbsorbida = validos.filter((c) => c.perdonado).reduce((a, c) => a + Math.abs(Number(c.montoGofo) || 0), 0)
  return {
    total,
    perdonados,
    activos,
    cobradoChoferes,
    descontadoGofo,
    perdidaAbsorbida,
    gananciaNetaClaims: cobradoChoferes - descontadoGofo,
  }
}

// ---- ranking de ciudades -----------------------------------------------------
// Calificación 0-100 por ciudad combinando ganancia, rentabilidad $/lb, calidad
// (claims), % fallidos (proxy = claims por ahora) y volumen. Pesos en constants.
// Funciona con una sola ciudad (los factores relativos quedan al 100%).
export function rankingCiudades(inv, claims, drivers, managers, semanas = 1) {
  const ciudades = inv?.resumenCiudades || []
  if (!ciudades.length) return []

  // Peso e ingreso por ciudad (desde rutas) para el $/lb.
  const pesoPorCiudad = {}, ingresoRutaPorCiudad = {}
  for (const r of inv?.resumenRutas || []) {
    pesoPorCiudad[r.ciudad] = (pesoPorCiudad[r.ciudad] || 0) + (r.pesoTotalLb || 0)
    ingresoRutaPorCiudad[r.ciudad] = (ingresoRutaPorCiudad[r.ciudad] || 0) + (r.ingreso || 0)
  }

  const base = ciudades.map((c) => {
    const code = c.ubicacion
    const claimsCiudad = porCiudad(claims, code)
    const numClaims = contarClaimsValidos(claimsCiudad)
    const g = gananciaRealDe(inv, claims, drivers, managers, code, semanas)
    const peso = pesoPorCiudad[code] || 0
    const precioLb = peso > 0 ? (ingresoRutaPorCiudad[code] || c.ingreso) / peso : 0
    const paquetes = c.paquetes || 0
    return {
      code,
      nombre: nombreCiudadDe(inv, code),
      paquetes,
      ingreso: c.ingreso,
      ingresoNeto: g.ingresoNeto,
      ganancia: g.gananciaReal,
      precioLb,
      numClaims,
      // TODO: cuando la factura traiga fallidos reales, usarlos aquí en vez de claims.
      fallidos: numClaims,
      pctClaims: paquetes > 0 ? numClaims / paquetes : 0,
    }
  })

  const maxGan = Math.max(...base.map((b) => b.ganancia), 0) || 1
  const maxLb = Math.max(...base.map((b) => b.precioLb), 0) || 1
  const maxPq = Math.max(...base.map((b) => b.paquetes), 0) || 1
  const w = PESOS_CALIF_CIUDAD

  return base
    .map((b) => {
      const gananciaScore = clamp(b.ganancia > 0 ? (b.ganancia / maxGan) * 100 : 0)
      const rentabilidadScore = clamp((b.precioLb / maxLb) * 100)
      const claimsPor100 = b.paquetes > 0 ? (b.numClaims / b.paquetes) * 100 : 0
      const calidadScore = clamp(100 - claimsPor100 * CALIDAD_FACTOR)
      const fallidosPor100 = b.paquetes > 0 ? (b.fallidos / b.paquetes) * 100 : 0
      const fallidosScore = clamp(100 - fallidosPor100 * CALIDAD_FACTOR)
      const volumenScore = clamp((b.paquetes / maxPq) * 100)
      const puntaje = Math.round(
        w.ganancia * gananciaScore + w.rentabilidad * rentabilidadScore + w.calidad * calidadScore + w.fallidos * fallidosScore + w.volumen * volumenScore
      )
      const nivel = puntaje >= UMBRALES_CALIF.bueno ? 'bueno' : puntaje >= UMBRALES_CALIF.regular ? 'regular' : 'malo'
      return {
        ...b,
        gananciaScore, rentabilidadScore, calidadScore, fallidosScore, volumenScore,
        puntaje,
        nivel,
        etiqueta: nivel === 'bueno' ? 'Buena' : nivel === 'regular' ? 'Regular' : 'Mala',
        desglose: `Ganancia ${nivelSub(gananciaScore)} · Calidad ${nivelSub(calidadScore)} · $/lb ${nivelSub(rentabilidadScore)} · Volumen ${nivelSub(volumenScore)}`,
      }
    })
    .sort((a, b) => b.puntaje - a.puntaje)
}

// ---- ranking de claims por tipo ----------------------------------------------

// Etiquetas en español para los tipos de claim conocidos (Claim Type de Gofo).
// Se comparan en minúsculas; los tipos no listados se muestran tal cual.
const ETIQUETAS_CLAIM = {
  'tracking interruption': 'Interrupción de tracking',
  'fake pod': 'POD falso',
  'damaged item': 'Artículo dañado',
  'lost': 'Perdido',
}
export function etiquetaTipoClaim(tipo) {
  if (!tipo) return 'Sin tipo'
  return ETIQUETAS_CLAIM[String(tipo).trim().toLowerCase()] || String(tipo).trim()
}

// Ranking de choferes por TIPO de claim, a partir del detalle de claims
// (Claim Type + Courier). Detecta los tipos dinámicamente.
// Devuelve:
//   tipos  : [{ key, raw, label }]  tipos presentes (orden alfabético por etiqueta)
//   matriz : [{ courier, total, porTipo: { [key]: n } }]  ordenado por total desc
//   porTipo: { [key]: [{ courier, n }] }  ranking por cada tipo (desc)
export function rankingClaimsPorTipo(claims) {
  const lista = claimsValidos(claims)
  const tiposMap = new Map() // key normalizado -> etiqueta cruda representativa
  const porCourier = {}
  for (const c of lista) {
    const raw = (c.claimType || 'Sin tipo').trim() || 'Sin tipo'
    const key = raw.toLowerCase()
    if (!tiposMap.has(key)) tiposMap.set(key, raw)
    const courier = c.courier || '—'
    if (!porCourier[courier]) porCourier[courier] = { courier, total: 0, porTipo: {} }
    porCourier[courier].porTipo[key] = (porCourier[courier].porTipo[key] || 0) + 1
    porCourier[courier].total += 1
  }
  const tipos = [...tiposMap.entries()]
    .map(([key, raw]) => ({ key, raw, label: etiquetaTipoClaim(raw) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const matriz = Object.values(porCourier).sort((a, b) => b.total - a.total || a.courier.localeCompare(b.courier))
  const porTipo = {}
  for (const t of tipos) {
    porTipo[t.key] = matriz
      .map((m) => ({ courier: m.courier, n: m.porTipo[t.key] || 0 }))
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n || a.courier.localeCompare(b.courier))
  }
  return { tipos, matriz, porTipo }
}

// ---- rankings ----------------------------------------------------------------

// Rankings de choferes (productividad, ganancia, calidad) con filtro de ciudad.
export function rankingsChoferes(inv, claims, drivers, ciudad) {
  const pagos = calcularPagos(inv, claims, drivers, ciudad)
  const productividad = [...pagos].sort((a, b) => b.ingreso - a.ingreso)
  const ganancia = [...pagos].sort((a, b) => b.ganancia - a.ganancia)
  const calidad = [...pagos].sort((a, b) => a.claimsTotales - b.claimsTotales) // menos claims = mejor
  return { pagos, productividad, ganancia, calidad }
}

// Rankings de rutas (por claims, por ingreso, por ganancia estimada, por $/lb).
export function rankingsRutas(inv, drivers, ciudad) {
  const rutas = porCiudad(inv?.resumenRutas || [], ciudad).map((r) => {
    // costo estimado de la ruta: no tenemos el desglose de choferes por ruta en el
    // resumen guardado, así que estimamos con la tarifa promedio de individuales/dobles.
    return { ...r, nombreCiudad: nombreCiudad(r.ciudad) }
  })
  return {
    porClaims: [...rutas].sort((a, b) => (b.numClaims || 0) - (a.numClaims || 0)),
    porIngreso: [...rutas].sort((a, b) => b.ingreso - a.ingreso),
    porPrecioLb: [...rutas].sort((a, b) => (b.precioPorLb || 0) - (a.precioPorLb || 0)),
  }
}

// ---- análisis de rutas -------------------------------------------------------

// Tarifa promedio (individual/doble) de los choferes que operan en una ciudad.
// Si no hay datos de esa ciudad, cae al promedio de todos los choferes activos.
// (La factura solo guarda el agregado por ruta, no el desglose chofer×ruta, por
// eso el costo por ruta se estima con la tarifa promedio de su ciudad.)
export function tarifaPromedio(drivers, resumenChoferes, ciudad) {
  const media = (arr, f) => { const v = arr.map(f).filter((x) => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 }
  const chof = (resumenChoferes || []).filter((c) => !ciudad || c.ciudad === ciudad)
  const tarifas = chof.map((c) => buscarDriver(drivers, c.nombre)).filter(Boolean)
  let ind = media(tarifas, (d) => Number(d.precioIndividual) || 0)
  let dob = media(tarifas, (d) => Number(d.precioDoble) || 0)
  if (!ind || !dob) {
    const act = (drivers || []).filter((d) => d.activo !== false)
    if (!ind) ind = media(act, (d) => Number(d.precioIndividual) || 0)
    if (!dob) dob = media(act, (d) => Number(d.precioDoble) || 0)
  }
  return { ind, dob }
}

// Rutas con costo de choferes estimado, ganancia, $/paquete, $/lb y calidad.
export function rutasConGanancia(inv, drivers, ciudad) {
  const rutas = porCiudad(inv?.resumenRutas || [], ciudad)
  const rc = inv?.resumenChoferes || []
  return rutas.map((r) => {
    const paquetes = r.paquetes || (r.individuales + r.dobles)
    const t = tarifaPromedio(drivers, rc, r.ciudad)
    const costoChoferes = r.individuales * t.ind + r.dobles * t.dob
    const ganancia = r.ingreso - costoChoferes
    return {
      ...r,
      paquetes,
      precioPorPaquete: r.precioPorPaquete != null ? r.precioPorPaquete : (paquetes > 0 ? r.ingreso / paquetes : 0),
      precioPorLb: r.precioPorLb != null ? r.precioPorLb : (r.pesoTotalLb > 0 ? r.ingreso / r.pesoTotalLb : 0),
      tarifaIndProm: t.ind,
      tarifaDobleProm: t.dob,
      costoChoferes,
      ganancia,
      margen: r.ingreso > 0 ? ganancia / r.ingreso : 0,
      calidad: paquetes > 0 ? 1 - (r.numClaims || 0) / paquetes : 1,
      nombreCiudad: r.nombreCiudad || nombreCiudad(r.ciudad),
    }
  })
}

// ---- alertas de cambio de precio ---------------------------------------------

// Compara precios por ruta de la factura nueva vs la anterior. Devuelve las rutas
// cuyo $/lb o $/paquete cambió más del umbral (±5% por defecto).
export function alertasCambioPrecio(invNueva, invAnterior, umbral = UMBRAL_CAMBIO_PRECIO) {
  if (!invNueva || !invAnterior) return []
  const anterioresPorRuta = {}
  for (const r of invAnterior.resumenRutas || []) anterioresPorRuta[r.ruta] = r
  const alertas = []
  for (const r of invNueva.resumenRutas || []) {
    const prev = anterioresPorRuta[r.ruta]
    if (!prev) continue
    const cambio = (nuevo, viejo) => (viejo > 0 ? (nuevo - viejo) / viejo : 0)
    const dLb = cambio(r.precioPorLb, prev.precioPorLb)
    const dPq = cambio(r.precioPorPaquete, prev.precioPorPaquete)
    if (Math.abs(dLb) >= umbral || Math.abs(dPq) >= umbral) {
      alertas.push({
        ruta: r.ruta,
        ciudad: r.ciudad,
        nombreCiudad: nombreCiudad(r.ciudad),
        antesLb: prev.precioPorLb,
        ahoraLb: r.precioPorLb,
        cambioLb: dLb,
        antesPq: prev.precioPorPaquete,
        ahoraPq: r.precioPorPaquete,
        cambioPq: dPq,
      })
    }
  }
  return alertas.sort((a, b) => Math.abs(b.cambioLb) - Math.abs(a.cambioLb))
}
