// ============================================================================
// BULK · Dominio · Motor de tarifas configurable (lógica pura).
// Calcula el precio al cliente y, con márgenes, el precio al transportista y el pago
// al chofer. Reglas por tonelada / milla / viaje, filtrables por material, equipo,
// cliente, planta, zona y urgencia. Gana la regla MÁS específica (luego prioridad).
// ============================================================================

export const TIPO_BASE = {
  POR_TONELADA: 'por_tonelada',
  POR_MILLA: 'por_milla',
  POR_VIAJE: 'por_viaje',
}
export const TIPO_BASE_LABEL = { por_tonelada: 'Por tonelada', por_milla: 'Por milla', por_viaje: 'Por viaje' }

const eq = (a, b) => !a || String(a).toLowerCase() === String(b || '').toLowerCase()
const CONDS = ['material', 'tipoEquipo', 'clienteId', 'plantaId', 'zona', 'soloUrgente']

export function reglaAplica(regla, ctx) {
  const c = regla.condiciones || {}
  if (c.material && !eq(c.material, ctx.material)) return false
  if (c.tipoEquipo && !eq(c.tipoEquipo, ctx.tipoEquipo)) return false
  if (c.clienteId && c.clienteId !== ctx.clienteId) return false
  if (c.plantaId && c.plantaId !== ctx.plantaId) return false
  if (c.zona && !eq(c.zona, ctx.zona)) return false
  if (c.soloUrgente && !ctx.urgente) return false
  return true
}
const especificidad = (r) => CONDS.filter((k) => (r.condiciones || {})[k]).length

// Elige la mejor regla aplicable (más específica; empate → mayor prioridad).
export function elegirRegla(reglas, ctx) {
  const aplican = (reglas || []).filter((r) => r.activo !== false && reglaAplica(r, ctx))
  if (!aplican.length) return null
  return aplican.sort((a, b) => (especificidad(b) - especificidad(a)) || ((b.prioridad || 0) - (a.prioridad || 0)))[0]
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Devuelve { precioCliente, precioTransportista, pagoChofer, reglaId, reglaNombre } o null.
export function calcularTarifa(reglas, ctx) {
  const r = elegirRegla(reglas, ctx)
  if (!r) return null
  const valor = Number(r.valor) || 0
  let precioCliente =
    r.tipo === TIPO_BASE.POR_TONELADA ? valor * (Number(ctx.ton) || 0)
    : r.tipo === TIPO_BASE.POR_MILLA ? valor * (Number(ctx.millas) || 0)
    : valor // por viaje / categoría
  if (ctx.urgente && r.recargoUrgencia) precioCliente *= 1 + Number(r.recargoUrgencia)
  precioCliente = r2(precioCliente)
  // Márgenes: pctTransportista = parte del precio que recibe el transportista; pctChofer
  // = parte de eso que recibe el chofer. Defaults razonables si la regla no los define.
  const pctT = r.pctTransportista != null ? Number(r.pctTransportista) : 0.72
  const pctCh = r.pctChofer != null ? Number(r.pctChofer) : 0.8
  const precioTransportista = r2(precioCliente * pctT)
  const pagoChofer = r2(precioTransportista * pctCh)
  return { precioCliente, precioTransportista, pagoChofer, reglaId: r.id, reglaNombre: r.nombre }
}
