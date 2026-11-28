// ============================================================================
// WALMART · Núcleo de cálculo PURO (sin Firebase, sin DOM).
//
// Aquí vive toda la aritmética de dinero, semanas operativas, importes de ruta
// y Fast Pay/conciliación. Es un módulo puro para poder PROBARLO con Node
// (`node --test`) sin arrancar Firebase. `datosWal.js` lo re-exporta tal cual,
// así el resto de la app (WalmartApp.jsx) lo sigue importando desde datosWal.
//
// Aislamiento: esto es EXCLUSIVO del módulo Walmart. No toca Gofo/Speedex/
// Freight/Warehouse ni ningún otro módulo.
// ============================================================================

// Redondeo monetario a centavos.
export const money2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Fecha de hoy en zona LOCAL (no UTC) como 'YYYY-MM-DD'.
export const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ── Semana operativa de Walmart: SÁBADO (Día 1) → VIERNES (Día 7) ────────────
// La clave de semana (`semana`) es la fecha ISO del SÁBADO de inicio.
// `lunesDe`/`domingoDe` se conservan por compatibilidad de nombres.
export function inicioSemana(fechaISO) {
  const d = new Date(`${fechaISO || hoyISO()}T00:00:00`)
  const dow = (d.getDay() + 1) % 7 // 0 = sábado (getDay: dom0..sáb6)
  d.setDate(d.getDate() - dow)
  return d.toISOString().slice(0, 10)
}
export function finSemana(fechaISO) {
  const d = new Date(`${inicioSemana(fechaISO)}T00:00:00`); d.setDate(d.getDate() + 6); return d.toISOString().slice(0, 10)
}
export const lunesDe = inicioSemana
export const domingoDe = finSemana

// ── Importes de una ruta ─────────────────────────────────────────────────────
// Suma de bonos/deducciones de una ruta por destino ('walmart' | 'driver').
function ajustes(r, destino) {
  const b = (r.bonos || []).filter((x) => x.aplicaA === destino).reduce((a, x) => a + (Number(x.monto) || 0), 0)
  const d = (r.deducciones || []).filter((x) => x.aplicaA === destino).reduce((a, x) => a + (Number(x.monto) || 0), 0)
  return money2(b - d)
}
// OT (overtime): total que paga Walmart y total que se le paga al driver.
export const otIngresoRuta = (r) => money2(Number(r?.otIngreso) || 0)
export const otPagoRuta = (r) => money2(Number(r?.otPago) || 0)
// Ingreso que corresponde recibir de Walmart por la ruta (0 si no completada).
export function ingresoRuta(r) {
  if (r.estado !== 'completada') return 0
  return money2((Number(r.tarifaWalmart) || 0) + otIngresoRuta(r) + ajustes(r, 'walmart'))
}
// Ganancia bruta del driver por la ruta, antes de Fast Pay (0 si no completada).
export function gananciaDriver(r) {
  if (r.estado !== 'completada') return 0
  return money2((Number(r.tarifaDriver) || 0) + otPagoRuta(r) + ajustes(r, 'driver'))
}

// ── Pagos y Fast Pay ─────────────────────────────────────────────────────────
export const METODOS_PAGO = ['Efectivo', 'Zelle', 'Transferencia', 'Cheque', 'Otro']

// Estados de un pago Fast Pay (máquina de estados).
//   pendiente  → iniciado, bloquea la ruta, NO liquida todavía
//   confirmado → pagado y liquidado (cuenta como saldado) · ingreso de comisión
//   fallido    → no se concretó, LIBERA la ruta, no liquida
//   anulado    → se revierte un confirmado; libera la ruta; exige nota de recuperación
export const ESTADOS_FP = ['pendiente', 'confirmado', 'fallido', 'anulado']
export const ESTADO_FP_LABEL = { pendiente: 'Pendiente', confirmado: 'Confirmado', fallido: 'Fallido', anulado: 'Anulado' }
export const ESTADO_FP_COLOR = { pendiente: '#D9822B', confirmado: '#2E9E6B', fallido: '#E0533D', anulado: '#6B7280' }
// Estado efectivo (compatibilidad: un pago FP sin campo estado = confirmado).
export const estadoFP = (p) => (p && p.estado) || 'confirmado'
// ¿Este FP liquida la ruta? (solo confirmado cuenta como saldado)
export const fpLiquida = (p) => p && p.tipo === 'fastpay' && estadoFP(p) === 'confirmado'
// ¿Este FP bloquea la ruta? (en proceso o confirmado → no se puede volver a pagar)
export const fpBloquea = (p) => p && p.tipo === 'fastpay' && (estadoFP(p) === 'pendiente' || estadoFP(p) === 'confirmado')
// ¿La ruta está bloqueada por un FP en proceso/confirmado? (anti doble pago)
export function rutaBloqueadaFP(pagos, rutaId) {
  return (pagos || []).some((p) => p.rutaId === rutaId && fpBloquea(p))
}
// Devuelve el FP que bloquea una ruta (para mostrarlo o anularlo).
export function fpDeRuta(pagos, rutaId) {
  return (pagos || []).find((p) => p.rutaId === rutaId && fpBloquea(p)) || null
}
// Importe bruto de una ruta ya LIQUIDADO mediante Fast Pay confirmado.
export function liquidadoFPruta(pagos, rutaId) {
  return money2((pagos || []).filter((p) => fpLiquida(p) && p.rutaId === rutaId).reduce((a, p) => a + (Number(p.bruto) || 0), 0))
}

// Resumen de una semana para un driver (sábado–viernes por fecha de servicio).
// Regla Fast Pay: el bruto ya liquidado (confirmado) NO se vuelve a pagar; la
// comisión retenida es ingreso de la compañía (aparte), no un saldo.
export function resumenSemana(rutas, pagos, driverId, semana) {
  const rs = (rutas || []).filter((r) => r.driverId === driverId && lunesDe(r.fecha) === semana && r.estado === 'completada')
  const totalGanado = money2(rs.reduce((a, r) => a + gananciaDriver(r), 0))
  const ps = (pagos || []).filter((p) => p.driverId === driverId && p.semana === semana)
  const fpConf = ps.filter(fpLiquida)                                            // confirmados → liquidan
  const fpPend = ps.filter((p) => p.tipo === 'fastpay' && estadoFP(p) === 'pendiente') // en proceso → bloquean
  const liquidadoFP = money2(fpConf.reduce((a, p) => a + (Number(p.bruto) || 0), 0))
  const comisiones = money2(fpConf.reduce((a, p) => a + (Number(p.comision) || 0), 0))
  const efectivoFP = money2(fpConf.reduce((a, p) => a + (Number(p.efectivo) || 0), 0))
  const enProcesoFP = money2(fpPend.reduce((a, p) => a + (Number(p.bruto) || 0), 0)) // bruto bloqueado sin liquidar
  const pagadoNormal = money2(ps.filter((p) => p.tipo === 'pago').reduce((a, p) => a + (Number(p.monto) || 0), 0))
  const saldo = money2(totalGanado - liquidadoFP - pagadoNormal)                  // lo que falta por pagar (confirmados)
  const saldoDisponible = money2(saldo - enProcesoFP)                            // lo que aún se puede iniciar a pagar
  const estado = saldo <= 0.005 ? 'pagado' : (liquidadoFP + pagadoNormal > 0 ? 'parcial' : 'pendiente')
  return { rutasSemana: rs, totalGanado, liquidadoFP, comisiones, efectivoFP, enProcesoFP, pagadoNormal, saldo, saldoDisponible, estado, pagos: ps }
}

// Monto de UNA ruta ya cubierto: Fast Pay confirmado de esa ruta + pagos
// normales etiquetados con esa ruta (rutaId). Base para el estado de pago de la
// ruta y para evitar pagarla dos veces (#4).
export function pagadoDeRuta(pagos, rutaId) {
  const fp = liquidadoFPruta(pagos, rutaId)
  const pg = money2((pagos || []).filter((p) => p.tipo === 'pago' && p.rutaId === rutaId).reduce((a, p) => a + (Number(p.monto) || 0), 0))
  return money2(fp + pg)
}
// Estado de pago de una ruta: { estado, bruto, pagado, resta }.
//   'na'        → la ruta no genera pago (no completada o $0)
//   'pagada'    → cubierta (por tag de ruta, o la semana entera ya está saldada)
//   'parcial'   → parte cubierta por pagos de esta ruta
//   'pendiente' → nada cubierto todavía
export function estadoPagoRuta(rutas, pagos, r) {
  const bruto = gananciaDriver(r)
  if (bruto <= 0.005) return { estado: 'na', bruto: 0, pagado: 0, resta: 0 }
  const taggd = pagadoDeRuta(pagos, r.id)
  if (taggd >= bruto - 0.005) return { estado: 'pagada', bruto, pagado: taggd, resta: 0 }
  const sem = resumenSemana(rutas, pagos, r.driverId, lunesDe(r.fecha))
  if (sem.saldo <= 0.005) return { estado: 'pagada', bruto, pagado: bruto, resta: 0 }
  if (taggd > 0.005) return { estado: 'parcial', bruto, pagado: taggd, resta: money2(bruto - taggd) }
  return { estado: 'pendiente', bruto, pagado: 0, resta: bruto }
}

// Conciliación semanal (por driver): desglose exacto del cuadre de la semana.
// Ej.: 5 rutas de $100, 1 pagada por FP → total 500, bruto FP 100, comisión 5,
// neto desembolsado 95, saldo pendiente 400 (la comisión NO se resta del saldo).
export function conciliacionSemana(rutas, pagos, driverId, semana) {
  const r = resumenSemana(rutas, pagos, driverId, semana)
  return {
    nRutas: r.rutasSemana.length,
    brutoGenerado: r.totalGanado,
    rutasPagadasFP: new Set(r.pagos.filter(fpLiquida).map((p) => p.rutaId).filter(Boolean)).size,
    brutoLiquidadoFP: r.liquidadoFP,
    comisionesFP: r.comisiones,
    netoDesembolsadoFP: r.efectivoFP,
    pagadoNormal: r.pagadoNormal,
    enProcesoFP: r.enProcesoFP,
    saldoPendiente: r.saldo,
    estado: r.estado,
  }
}

// Calcula los montos de un Fast Pay (comisión del % sobre el BRUTO liquidado).
export function calcularFastPay(bruto, comisionPct) {
  const b = money2(bruto)
  const comision = money2(b * (Number(comisionPct) || 0) / 100)
  return { bruto: b, comision, efectivo: money2(b - comision) }
}

// Utilidad por financiamiento (Fast Pay): concepto independiente del resultado
// operativo. Solo FP CONFIRMADOS cuentan; filtra por fecha, almacén (vía ruta)
// y driver. La comisión confirmada ES la utilidad por financiamiento.
export function utilidadFinanciamiento(pagos, rutas, desde, hasta, opts = {}) {
  const { almacenId, driverId } = opts
  const almDeRuta = {}
  for (const r of (rutas || [])) almDeRuta[r.id] = r.almacenId
  const ps = (pagos || []).filter((p) =>
    p.tipo === 'fastpay' && estadoFP(p) === 'confirmado' &&
    (p.fecha || '') >= desde && (p.fecha || '') <= hasta &&
    (!driverId || p.driverId === driverId) &&
    (!almacenId || almDeRuta[p.rutaId] === almacenId))
  const bruto = money2(ps.reduce((a, p) => a + (Number(p.bruto) || 0), 0))
  const comision = money2(ps.reduce((a, p) => a + (Number(p.comision) || 0), 0))
  const desembolsado = money2(ps.reduce((a, p) => a + (Number(p.efectivo) || 0), 0))
  const nRutas = new Set(ps.map((p) => p.rutaId).filter(Boolean)).size
  return { bruto, comision, desembolsado, nPagos: ps.length, nRutas, pagos: ps }
}
