// ============================================================================
// CÁLCULO DE PAGOS con MIS tarifas (independientes de las tarifas de Gofo).
//
// · Tarifas por posición (regular y OT) con vigencia + excepciones por persona.
// · Reglas de OT configurables:
//     'gofo'    → respeta el reparto regular/OT que trae el reporte de Gofo.
//     'semanal' → umbral semanal por PERSONA (default 40 h) sumando TODAS sus
//                 posiciones de la semana, sin aplicar el umbral dos veces;
//                 las horas OT se reparten proporcionalmente entre posiciones.
// · Si falta una tarifa, el registro queda pendienteTarifa (no se inventa).
// ============================================================================
import { normalizarNombre } from './parserGofo'

export const REGLAS_OT = { GOFO: 'gofo', SEMANAL: 'semanal' }

// Tarifa vigente para una posición en una fecha (ISO) según su historial.
export function tarifaVigente(tarifaDoc, fechaISO) {
  if (!tarifaDoc) return null
  const candidatas = [
    { reg: tarifaDoc.reg, ot: tarifaDoc.ot, desde: tarifaDoc.vigenteDesde || '0000-00-00' },
    ...(tarifaDoc.historial || []),
  ].filter((t) => t.reg !== undefined && t.reg !== null && (t.desde || '0000-00-00') <= (fechaISO || '9999-12-31'))
  if (!candidatas.length) return null
  candidatas.sort((a, b) => String(b.desde).localeCompare(String(a.desde)))
  return { reg: Number(candidatas[0].reg), ot: Number(candidatas[0].ot) }
}

// Excepción individual vigente (worker.tarifas = [{posicion|'' , reg, ot, desde}]).
export function excepcionVigente(worker, posicion, fechaISO) {
  const lista = (worker && worker.tarifas) || []
  const aplicables = lista.filter((t) => (!t.posicion || t.posicion === posicion) && (t.desde || '0000-00-00') <= (fechaISO || '9999-12-31'))
  if (!aplicables.length) return null
  aplicables.sort((a, b) => {
    // primero la más específica (con posición), luego la más reciente
    if (!!a.posicion !== !!b.posicion) return a.posicion ? -1 : 1
    return String(b.desde).localeCompare(String(a.desde))
  })
  return { reg: Number(aplicables[0].reg), ot: Number(aplicables[0].ot) }
}

// Calcula el pago de TODAS las filas de un período.
// filas: salida del parser · tarifas: {posicion → doc} · workers: {nombreNorm → worker}
// config: { reglaOT: 'gofo'|'semanal', umbralSemanal: 40 }
export function calcularPagos(filas, tarifas, workers, config, finPeriodo) {
  const cfg = { reglaOT: 'gofo', umbralSemanal: 40, ...(config || {}) }
  // horas por persona (todas las posiciones juntas) para la regla semanal
  const porPersona = {}
  for (const fila of filas) {
    const k = fila.nombreNorm || normalizarNombre(fila.nombre)
    porPersona[k] = porPersona[k] || { total: 0, filas: [] }
    porPersona[k].total += fila.horasTotal || 0
    porPersona[k].filas.push(fila)
  }
  const resultados = []
  for (const fila of filas) {
    const k = fila.nombreNorm || normalizarNombre(fila.nombre)
    const worker = workers ? workers[k] : null
    const exc = excepcionVigente(worker, fila.posicion, finPeriodo)
    const base = tarifaVigente(tarifas ? tarifas[fila.posicion] : null, finPeriodo)
    const tarifa = exc || base
    let horasReg, horasOT
    if (cfg.reglaOT === 'semanal') {
      const persona = porPersona[k]
      const otPersona = Math.max(0, persona.total - cfg.umbralSemanal)
      // reparto proporcional del OT entre las posiciones de la persona
      const proporcion = persona.total > 0 ? (fila.horasTotal || 0) / persona.total : 0
      horasOT = Math.round(otPersona * proporcion * 100) / 100
      horasReg = Math.max(0, (fila.horasTotal || 0) - horasOT)
    } else {
      horasReg = fila.horasReg != null ? fila.horasReg : Math.max(0, (fila.horasTotal || 0) - (fila.horasOT || 0))
      horasOT = fila.horasOT || 0
    }
    if (!tarifa || !Number.isFinite(tarifa.reg) || !Number.isFinite(tarifa.ot)) {
      resultados.push({ ...fila, miHorasReg: horasReg, miHorasOT: horasOT, miTarifaReg: null, miTarifaOT: null, miPago: null, pendienteTarifa: true, origenTarifa: null })
      continue
    }
    const pago = Math.round((horasReg * tarifa.reg + horasOT * tarifa.ot) * 100) / 100
    resultados.push({
      ...fila,
      miHorasReg: horasReg,
      miHorasOT: horasOT,
      miTarifaReg: tarifa.reg,
      miTarifaOT: tarifa.ot,
      miPago: pago,
      pendienteTarifa: false,
      origenTarifa: exc ? 'excepción individual' : 'tarifa de posición',
    })
  }
  return resultados
}

// Resumen financiero de un período.
// Utilidad operativa = ingreso Gofo (con ajustes) − pagos calculados − gastos.
export function resumenPeriodo({ registros, ajustes, gastos, cobros, cheques }) {
  const ingresoDetalle = (registros || []).reduce((s, r) => s + (r.importeGofo || 0), 0)
  const ajustesTot = (ajustes || []).reduce((s, a) => s + (a.importe || 0), 0)
  const ingreso = Math.round((ingresoDetalle + ajustesTot) * 100) / 100
  const pendientesTarifa = (registros || []).filter((r) => r.pendienteTarifa || r.miPago === null || r.miPago === undefined).length
  const pagoCalc = Math.round((registros || []).reduce((s, r) => s + (r.miPago || 0), 0) * 100) / 100
  const gastosTot = Math.round((gastos || []).reduce((s, g) => s + (g.importe || 0), 0) * 100) / 100
  const cobrado = Math.round((cobros || []).reduce((s, c) => s + (c.importe || 0), 0) * 100) / 100
  // pagado real: distribución de cheques COBRADOS que apuntan a este período
  const pagado = Math.round((cheques || []).reduce((s, ch) => {
    if (ch.estado !== 'cobrado') return s
    return s + (ch.distribucion || []).reduce((s2, d) => s2 + (d.importe || 0), 0)
  }, 0) * 100) / 100
  const emitido = Math.round((cheques || []).reduce((s, ch) => {
    if (ch.estado === 'cancelado') return s
    return s + (ch.distribucion || []).reduce((s2, d) => s2 + (d.importe || 0), 0)
  }, 0) * 100) / 100
  const margen = Math.round((ingreso - pagoCalc) * 100) / 100
  const utilidad = Math.round((ingreso - pagoCalc - gastosTot) * 100) / 100
  const horas = Math.round((registros || []).reduce((s, r) => s + (r.horasTotal || 0), 0) * 100) / 100
  return {
    ingreso,
    ajustes: Math.round(ajustesTot * 100) / 100,
    cobrado,
    porCobrar: Math.round((ingreso - cobrado) * 100) / 100,
    pagoCalc,
    emitido,
    pagado,
    porPagar: Math.round((pagoCalc - emitido) * 100) / 100,
    gastos: gastosTot,
    margen,
    utilidad,
    pctUtilidad: ingreso > 0 ? Math.round((utilidad / ingreso) * 1000) / 10 : null, // null → "no aplica"
    horas,
    trabajadores: new Set((registros || []).map((r) => r.workerId || r.nombreNorm)).size,
    parcial: pendientesTarifa > 0,
    pendientesTarifa,
  }
}
