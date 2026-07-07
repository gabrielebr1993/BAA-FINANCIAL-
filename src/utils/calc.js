// ---------------------------------------------------------------------------
// Cálculos de negocio derivados del resumen de una factura.
// Reglas fijas: doble = monto 0.5 ; CLAIM_FEE = $100 por claim no perdonado ;
// pago = individuales*tarifaInd + dobles*tarifaDoble - claimsNoPerdonados*100.
// ---------------------------------------------------------------------------
import { CLAIM_FEE, UMBRAL_CAMBIO_PRECIO, nombreCiudad } from '../constants'

export const TODAS = 'todas'

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

// Claims activos (no perdonados) por chofer, a partir de la colección claims.
export function claimsActivosPorChofer(claims) {
  const map = {}
  for (const c of claims || []) {
    if (c.perdonado) continue
    map[c.courier] = (map[c.courier] || 0) + 1
  }
  return map
}

// Calcula la nómina (payroll) por chofer para una factura, con el filtro de ciudad.
// Devuelve filas con ingreso, tarifas, descuento de claims, total a pagar y ganancia.
export function calcularPagos(inv, claims, drivers, ciudad) {
  const choferes = porCiudad(inv?.resumenChoferes || [], ciudad)
  const activos = claimsActivosPorChofer(claims)
  const totalClaimsPorChofer = {}
  for (const c of claims || []) totalClaimsPorChofer[c.courier] = (totalClaimsPorChofer[c.courier] || 0) + 1

  return choferes.map((ch) => {
    const driver = buscarDriver(drivers, ch.nombre)
    const tarifaInd = driver ? Number(driver.precioIndividual) || 0 : 0
    const tarifaDoble = driver ? Number(driver.precioDoble) || 0 : 0
    const claimsActivos = activos[ch.nombre] || 0
    const claimsTotales = totalClaimsPorChofer[ch.nombre] || 0
    const claimsPerdonados = claimsTotales - claimsActivos
    const descuentoClaims = claimsActivos * CLAIM_FEE
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
      claimsTotales,
      claimsActivos,
      claimsPerdonados,
      descuentoClaims,
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
export function costoManagers(managers, semanas = 1) {
  const base = (managers || []).filter((m) => m.activo !== false).reduce((a, m) => a + (Number(m.sueldoSemanal) || 0), 0)
  return base * (semanas || 1)
}

// Ganancia real = ingresoNeto − costoChoferes − costoManagers.
// ingresoNeto: si "Todas", el neto verificado (entregas+offset+claims+ajustes);
// si una ciudad, se aproxima con entregas(ciudad) + claimsGofo(ciudad).
// Los managers son costo fijo de empresa: solo se cuentan en "Todas las ciudades".
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
  const cMgr = esTodas ? costoManagers(managers, semanas) : 0
  const ganancia = ingresoNeto - costoChoferes - cMgr
  return {
    ingresoNeto,
    costoChoferes,
    costoManagers: cMgr,
    gananciaReal: ganancia,
    margen: ingresoNeto > 0 ? ganancia / ingresoNeto : 0,
    soloTodas: !esTodas,
  }
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
