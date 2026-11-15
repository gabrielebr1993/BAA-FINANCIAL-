// Pruebas del núcleo Fast Pay / conciliación de Walmart (módulo puro, sin Firebase).
//   node --test test/walmart-fastpay.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularFastPay, resumenSemana, conciliacionSemana, utilidadFinanciamiento,
  estadoFP, fpLiquida, fpBloquea, rutaBloqueadaFP, liquidadoFPruta, lunesDe,
} from '../src/walmart/wmcalc.js'

// Ayuda: 5 rutas completadas de $100 (tarifaDriver) para un driver en una fecha.
const DRIVER = 'drv1'
const FECHA = '2026-11-16' // un día cualquiera; la semana se deriva con lunesDe
const SEMANA = lunesDe(FECHA)
function rutas5() {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `r${i + 1}`, driverId: DRIVER, almacenId: 'alm1', fecha: FECHA,
    estado: 'completada', tarifaDriver: 100, tarifaWalmart: 340,
  }))
}
function fp(rutaId, estado, extra = {}) {
  const { bruto, comision, efectivo } = calcularFastPay(100, 5)
  return { tipo: 'fastpay', driverId: DRIVER, rutaId, semana: SEMANA, fecha: FECHA, bruto, comision, efectivo, estado, ...extra }
}

test('5 rutas de $100, 1 pagada por Fast Pay confirmado → saldo pendiente $400', () => {
  const rutas = rutas5()
  const pagos = [fp('r1', 'confirmado')]
  const r = resumenSemana(rutas, pagos, DRIVER, SEMANA)
  assert.equal(r.totalGanado, 500)
  assert.equal(r.liquidadoFP, 100)      // bruto liquidado por FP
  assert.equal(r.comisiones, 5)         // comisión (ingreso compañía)
  assert.equal(r.efectivoFP, 95)        // neto desembolsado al driver
  assert.equal(r.saldo, 400)            // ← PENDIENTE exacto del ejemplo
})

test('la comisión de $5 NO se resta del saldo ni se cuenta como pendiente a favor', () => {
  const rutas = rutas5()
  const pagos = [fp('r1', 'confirmado')]
  const r = resumenSemana(rutas, pagos, DRIVER, SEMANA)
  // saldo = total - bruto liquidado - pagos normales (NADA de comisión)
  assert.equal(r.saldo, r.totalGanado - r.liquidadoFP - r.pagadoNormal)
  assert.equal(r.saldo, 400)
})

test('conciliación semanal: desglose exacto del ejemplo', () => {
  const c = conciliacionSemana(rutas5(), [fp('r1', 'confirmado')], DRIVER, SEMANA)
  assert.deepEqual(c, {
    nRutas: 5, brutoGenerado: 500, rutasPagadasFP: 1, brutoLiquidadoFP: 100,
    comisionesFP: 5, netoDesembolsadoFP: 95, pagadoNormal: 0, enProcesoFP: 0,
    saldoPendiente: 400, estado: 'parcial',
  })
})

test('un FP pendiente BLOQUEA la ruta pero NO la liquida (no doble pago)', () => {
  const rutas = rutas5()
  const pagos = [fp('r1', 'pendiente')]
  assert.equal(rutaBloqueadaFP(pagos, 'r1'), true)   // bloqueada → no se puede volver a pagar
  assert.equal(liquidadoFPruta(pagos, 'r1'), 0)      // pero NO liquidada todavía
  const r = resumenSemana(rutas, pagos, DRIVER, SEMANA)
  assert.equal(r.saldo, 500)                          // nada liquidado aún
  assert.equal(r.enProcesoFP, 100)                    // $100 en proceso (bloqueado)
  assert.equal(r.saldoDisponible, 400)                // lo que aún se puede iniciar a pagar
})

test('un FP fallido o anulado LIBERA la ruta y no liquida', () => {
  for (const estado of ['fallido', 'anulado']) {
    const pagos = [fp('r1', estado)]
    assert.equal(rutaBloqueadaFP(pagos, 'r1'), false, `${estado} debe liberar la ruta`)
    assert.equal(liquidadoFPruta(pagos, 'r1'), 0, `${estado} no liquida`)
    const r = resumenSemana(rutas5(), pagos, DRIVER, SEMANA)
    assert.equal(r.saldo, 500, `${estado} no reduce el saldo`)
  }
})

test('la ruta no se puede pagar dos veces: ya confirmada queda bloqueada', () => {
  const pagos = [fp('r1', 'confirmado')]
  assert.equal(rutaBloqueadaFP(pagos, 'r1'), true)
  // Intentar un segundo pago de la misma ruta: la UI debe impedirlo porque está bloqueada.
  // Simulamos el guard: si está bloqueada, no se agrega otro pago.
  assert.equal(fpBloquea(pagos[0]), true)
})

test('compatibilidad: un FP sin campo estado se trata como confirmado', () => {
  const sinEstado = { tipo: 'fastpay', rutaId: 'r1', bruto: 100, comision: 5, efectivo: 95 }
  assert.equal(estadoFP(sinEstado), 'confirmado')
  assert.equal(fpLiquida(sinEstado), true)
})

test('utilidad por financiamiento: solo cuenta FP confirmados', () => {
  const rutas = rutas5()
  const pagos = [
    fp('r1', 'confirmado'), fp('r2', 'confirmado'),
    fp('r3', 'pendiente'), fp('r4', 'fallido'), fp('r5', 'anulado'),
  ]
  const u = utilidadFinanciamiento(pagos, rutas, '2026-01-01', '2026-12-31')
  assert.equal(u.nPagos, 2)       // solo los 2 confirmados
  assert.equal(u.bruto, 200)
  assert.equal(u.comision, 10)    // utilidad por financiamiento
  assert.equal(u.desembolsado, 190)
  assert.equal(u.nRutas, 2)
  // Filtro por almacén (vía ruta) y por driver
  assert.equal(utilidadFinanciamiento(pagos, rutas, '2026-01-01', '2026-12-31', { almacenId: 'alm1' }).comision, 10)
  assert.equal(utilidadFinanciamiento(pagos, rutas, '2026-01-01', '2026-12-31', { almacenId: 'otro' }).comision, 0)
})

test('calcularFastPay: comisión del 5% sobre el bruto', () => {
  assert.deepEqual(calcularFastPay(100, 5), { bruto: 100, comision: 5, efectivo: 95 })
  assert.deepEqual(calcularFastPay(340, 5), { bruto: 340, comision: 17, efectivo: 323 })
})
