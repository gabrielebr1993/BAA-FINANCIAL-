// Cálculo centralizado de alertas del negocio sobre la factura/periodo activo.
import { calcularPagos, buscarDriver, alertasCambioPrecio, economiaClaims, claimsRepetidosPendientes } from './calc'
import { money } from './format'

// Categorías para agrupar las alertas en el panel y la campana.
export const CATEGORIAS = ['Choferes', 'Rutas', 'Dinero', 'Pagos']

// Devuelve un arreglo de alertas:
//   { id, tipo:'red'|'yellow'|'blue', categoria, titulo, detalle, link }
export function calcularAlertas({ inv, claims, drivers, invAnterior, pendientes }) {
  const alertas = []
  if (!inv) return alertas

  // 1) Chofer con más de 2 claims en el periodo (grave)
  const claimsPorChofer = {}
  for (const c of claims || []) claimsPorChofer[c.courier] = (claimsPorChofer[c.courier] || 0) + 1
  Object.entries(claimsPorChofer)
    .filter(([, n]) => n > 2)
    .sort((a, b) => b[1] - a[1])
    .forEach(([courier, n]) =>
      alertas.push({ id: `claims:${courier}`, tipo: 'red', categoria: 'Choferes', titulo: `${courier} tiene ${n} claims`, detalle: 'Más de 2 claims en el periodo — conviene revisar.', link: `/choferes/${encodeURIComponent(courier)}` })
    )

  // 2) Factura que no cuadra con Gofo (grave)
  if (inv.verificacion?.cuadra === false) {
    alertas.push({ id: 'cuadre', tipo: 'red', categoria: 'Dinero', titulo: 'La factura no cuadra con Gofo', detalle: `Diferencia de ${money(inv.verificacion.diferencia)} entre nuestro neto y el total de Gofo.`, link: '/financiero' })
  }

  const pagos = calcularPagos(inv, claims, drivers, 'todas')

  // 3) Chofer que genera pérdida (aviso)
  pagos
    .filter((p) => p.totalPagar > p.ingreso)
    .forEach((p) =>
      alertas.push({ id: `perdida:${p.nombre}`, tipo: 'yellow', categoria: 'Choferes', titulo: `${p.nombre} te cuesta más de lo que produce`, detalle: `Pago ${money(p.totalPagar)} vs ingreso ${money(p.ingreso)}.`, link: '/pagos' })
    )

  // 4) Ruta no rentable (aviso) — costo estimado con tarifa promedio
  const act = (drivers || []).filter((d) => d.activo !== false)
  const avgInd = act.reduce((a, d) => a + (Number(d.precioIndividual) || 0), 0) / (act.length || 1)
  const avgDob = act.reduce((a, d) => a + (Number(d.precioDoble) || 0), 0) / (act.length || 1)
  ;(inv.resumenRutas || []).forEach((r) => {
    const costo = r.individuales * avgInd + r.dobles * avgDob
    if (r.ingreso - costo < 0)
      alertas.push({ id: `ruta:${r.ruta}`, tipo: 'yellow', categoria: 'Rutas', titulo: `Ruta ${r.ruta} no es rentable`, detalle: `Ingreso ${money(r.ingreso)} < costo estimado ${money(costo)}.`, link: '/financiero' })
  })

  // 5) Cambio de precio de Gofo vs. semana anterior (info)
  alertasCambioPrecio(inv, invAnterior).forEach((a) =>
    alertas.push({ id: `precio:${a.ruta}`, tipo: 'blue', categoria: 'Rutas', titulo: `Gofo cambió el precio en ${a.ruta}`, detalle: `Antes $${a.antesLb.toFixed(3)}/lb, ahora $${a.ahoraLb.toFixed(3)}/lb (${a.cambioLb >= 0 ? '+' : ''}${(a.cambioLb * 100).toFixed(1)}%).`, link: '/financiero' })
  )

  // 6) Chofer nuevo / sin tarifa (aviso)
  const sinTarifa = new Set()
  ;(inv.resumenChoferes || []).forEach((c) => { if (!buscarDriver(drivers, c.nombre)) sinTarifa.add(c.nombre) })
  ;(drivers || []).forEach((d) => { if (!(Number(d.precioIndividual) > 0) || !(Number(d.precioDoble) > 0)) sinTarifa.add(d.nombre) })
  ;[...sinTarifa].forEach((n) =>
    alertas.push({ id: `tarifa:${n}`, tipo: 'yellow', categoria: 'Choferes', titulo: `${n} sin tarifa`, detalle: 'Asígnale precio individual y doble en Choferes.', link: '/choferes' })
  )

  // 7) Pagos pendientes sin marcar (info) — solo si se provee el conteo
  if (pendientes != null && pendientes > 0) {
    alertas.push({ id: 'pagos', tipo: 'blue', categoria: 'Pagos', titulo: `Tienes ${pendientes} pago(s) pendiente(s) por marcar`, detalle: 'Revisa Pagos y marca los ya realizados.', link: '/pagos' })
  }

  // 9) Claims repetidos pendientes de aprobación (aviso importante)
  const repetidos = claimsRepetidosPendientes(claims)
  if (repetidos.length > 0) {
    alertas.push({
      id: 'claimsRepetidos',
      tipo: 'yellow',
      categoria: 'Dinero',
      titulo: `Claims repetidos detectados: ${repetidos.length} — requieren tu aprobación`,
      detalle: 'Un mismo tracking aparece más de una vez (claim + reversión). Aprueba o anula cada caso en Claims.',
      link: '/claims',
    })
  }

  // 8) Costo de claims perdonados (aviso) — dinero que dejas de cobrar + monto
  //    que Gofo ya te descontó y que absorbes al perdonar.
  const ec = economiaClaims(claims)
  if (ec.perdonados > 0) {
    alertas.push({
      id: 'claimsPerdonados',
      tipo: 'yellow',
      categoria: 'Dinero',
      titulo: `Perdonaste ${ec.perdonados} claim(s): te costaron ${money(ec.perdidaAbsorbida)}`,
      detalle: `Tu única pérdida real es lo que Gofo te descontó por esos claims (monto variable): ${money(ec.perdidaAbsorbida)}. Los $100 por claim son una multa que dejas de cobrar, no una pérdida.`,
      link: '/claims',
    })
  }

  return alertas
}

export const SEVERIDAD_ORDEN = { red: 0, yellow: 1, blue: 2 }
export const NOMBRE_TIPO = { red: 'Grave', yellow: 'Aviso', blue: 'Info' }
