// ---------------------------------------------------------------------------
// Simulador de precios de Gofo (SOLO proyección/lectura). Dado una factura de una
// ciudad, permite proyectar qué pasa con el INGRESO y la GANANCIA REAL si Gofo
// cambia sus precios (por %, por rango de peso o por celda). NO toca ninguna
// fórmula de pago: el pago a choferes es FIJO (depende de sus tarifas, no de Gofo).
// ---------------------------------------------------------------------------
import { RANGOS_PESO } from './excel'

export { RANGOS_PESO }
export const DOBLE = 0.5
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Base por ciudad+factura: rutas con celdas por rango de peso. Usa el desglose
// ruta×peso (resumenRutaPeso) si la factura lo trae; si no (facturas viejas), cae a
// nivel de ruta con un precio PROMEDIO por primera entrega (una sola "celda").
export function construirBase(inv, ciudad) {
  // `simuladorDesglose` = campo dedicado y aislado del simulador (respaldo al antiguo).
  const todos = (inv?.simuladorDesglose || inv?.resumenRutaPeso) || []
  // Se filtra por ciudad; pero si NINGUNA entrada calza con el código de ciudad
  // (facturas viejas cuyo código difiere del actual) se usa TODO el desglose de la
  // factura —que ya es de esa ciudad—, para no perder el detalle por peso.
  const conCiudad = todos.filter((x) => (x.ciudad || '') === ciudad)
  const rp = conCiudad.length ? conCiudad : todos
  const tieneDetalle = rp.length > 0
  const map = {}
  if (tieneDetalle) {
    for (const x of rp) {
      const r = map[x.ruta] || (map[x.ruta] = { ruta: x.ruta, celdas: {}, ingresoDobles: 0, dobles: 0, individuales: 0, ingresoInd: 0 })
      if (x.doble) { r.ingresoDobles += x.ingreso; r.dobles += x.cantidad }
      else { r.celdas[x.rango] = { precio: x.precio, cantidad: x.cantidad, ingreso: x.ingreso }; r.individuales += x.cantidad; r.ingresoInd += x.ingreso }
    }
  } else {
    for (const r0 of (inv?.resumenRutas || []).filter((r) => (r.ciudad || '') === ciudad)) {
      const dobles = r0.dobles || 0
      const ingresoDobles = r2(dobles * DOBLE)
      const ind = r0.individuales || 0
      const ingresoInd = r2((r0.ingreso || 0) - ingresoDobles)
      map[r0.ruta] = {
        ruta: r0.ruta, dobles, ingresoDobles, individuales: ind, ingresoInd,
        celdas: { '(promedio)': { precio: ind > 0 ? ingresoInd / ind : 0, cantidad: ind, ingreso: ingresoInd } },
      }
    }
  }
  const rutas = Object.values(map)
    .map((r) => ({ ...r, ingresoBase: r2(r.ingresoInd + r.ingresoDobles) }))
    .sort((a, b) => String(a.ruta).localeCompare(String(b.ruta)))
  const rangos = tieneDetalle ? RANGOS_PESO.filter((rg) => rutas.some((r) => r.celdas[rg])) : ['(promedio)']
  return { rutas, rangos, tieneDetalle }
}

// Precio proyectado de una celda con PRIORIDAD: edición manual de la celda >
// precio fijo por rango de peso > % global > precio actual.
export function precioProyectado(ruta, rango, precioActual, ov) {
  const man = ov?.celda?.[`${ruta}||${rango}`]
  if (man != null && man !== '' && isFinite(Number(man))) return Number(man)
  const fijo = ov?.peso?.[rango]
  if (fijo != null && fijo !== '' && isFinite(Number(fijo))) return Number(fijo)
  if (ov?.pct) return precioActual * (1 + ov.pct)
  return precioActual
}

// Proyección completa. `costoPorRuta` = costo de choferes por ruta (fijo). Su suma
// debe ser el pago total de la ciudad (se escala en el componente para que cuadre).
export function proyectar(base, ov, costoPorRuta) {
  const rutas = base.rutas.map((r) => {
    let ingresoProy = r.ingresoDobles
    for (const [rg, c] of Object.entries(r.celdas)) ingresoProy += precioProyectado(r.ruta, rg, c.precio, ov) * c.cantidad
    ingresoProy = r2(ingresoProy)
    const costo = r2(costoPorRuta?.[r.ruta] || 0)
    const avgActual = r.individuales > 0 ? r.ingresoInd / r.individuales : 0
    // Punto de equilibrio: precio promedio (primera entrega) al que la ganancia = 0.
    const beAvg = r.individuales > 0 ? (costo - r.ingresoDobles) / r.individuales : 0
    const bePct = avgActual > 0 ? beAvg / avgActual - 1 : 0
    return {
      ruta: r.ruta, individuales: r.individuales, dobles: r.dobles, celdas: r.celdas,
      ingresoBase: r.ingresoBase, ingresoProy, costo,
      gananciaBase: r2(r.ingresoBase - costo), gananciaProy: r2(ingresoProy - costo),
      avgActual, beAvg, bePct,
    }
  })
  const pagoCiudad = r2(rutas.reduce((a, r) => a + r.costo, 0))
  const ingresoBase = r2(rutas.reduce((a, r) => a + r.ingresoBase, 0))
  const ingresoProy = r2(rutas.reduce((a, r) => a + r.ingresoProy, 0))
  const ingresoIndTotal = r2(base.rutas.reduce((a, r) => a + r.ingresoInd, 0))
  const ingresoDoblesTotal = r2(base.rutas.reduce((a, r) => a + r.ingresoDobles, 0))
  const gananciaBase = r2(ingresoBase - pagoCiudad)
  const gananciaProy = r2(ingresoProy - pagoCiudad)
  return {
    rutas, pagoCiudad, ingresoBase, ingresoProy, gananciaBase, gananciaProy,
    margenBase: ingresoBase > 0 ? gananciaBase / ingresoBase : 0,
    margenProy: ingresoProy > 0 ? gananciaProy / ingresoProy : 0,
    // % de bajada global (sobre primeras entregas) que lleva la ganancia de la ciudad a 0.
    bePctCiudad: ingresoIndTotal > 0 ? (pagoCiudad - ingresoDoblesTotal) / ingresoIndTotal - 1 : 0,
    ingresoIndTotal, ingresoDoblesTotal,
  }
}
