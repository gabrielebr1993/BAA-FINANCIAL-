// ============================================================================
// BULK · Dominio · Motor de tarifas configurable (lógica pura).
// El ADMIN configura, por regla: lo que COBRA al cliente y lo que PAGA al
// transportista (ambos por unidad: tonelada / yarda / pie / milla / viaje). La
// diferencia es la UTILIDAD del dueño. Una regla puede aplicar a VARIOS materiales
// y VARIOS equipos. El pago al CHOFER NO se define aquí: lo fija el transportista
// en el perfil del chofer (por % o monto fijo) — ver domain/pagoChofer.js.
// Gana la regla MÁS específica (luego prioridad). Compatible con reglas viejas
// (campo `valor` + `pctTransportista`).
// ============================================================================

export const TIPO_BASE = {
  POR_TONELADA: 'por_tonelada',
  POR_YARDA: 'por_yarda',
  POR_PIE: 'por_pie',
  POR_MILLA: 'por_milla',
  POR_VIAJE: 'por_viaje',
}
export const TIPO_BASE_LABEL = {
  por_tonelada: 'Por tonelada (tn)',
  por_yarda: 'Por yarda (yd³)',
  por_pie: 'Por pie (ft)',
  por_milla: 'Por milla',
  por_viaje: 'Por viaje (fijo)',
}
// Unidad corta para mostrar junto al precio.
export const UNIDAD_CORTA = { por_tonelada: 'ton', por_yarda: 'yd³', por_pie: 'ft', por_milla: 'mi', por_viaje: 'viaje' }

// Cantidad del contexto que multiplica al precio, según el tipo.
const CANTIDAD = {
  por_tonelada: (c) => Number(c.ton) || 0,
  por_yarda: (c) => Number(c.yardas) || 0,
  por_pie: (c) => Number(c.pies) || 0,
  por_milla: (c) => Number(c.millas) || 0,
  por_viaje: () => 1,
}

const eq = (a, b) => !a || String(a).toLowerCase() === String(b || '').toLowerCase()

// Lista (materiales/equipos): vacía = aplica a todos; si tiene valores, ctx debe estar en ella.
const enLista = (lista, val) => !lista || lista.length === 0 || lista.some((x) => eq(x, val))
// Normaliza condiciones nuevas (arrays) y viejas (campos simples).
export function matsDe(c) { return (c && c.materiales && c.materiales.length) ? c.materiales : (c && c.material ? [c.material] : []) }
export function eqsDe(c) { return (c && c.equipos && c.equipos.length) ? c.equipos : (c && c.tipoEquipo ? [c.tipoEquipo] : []) }
export function clientesDe(c) { return (c && c.clientes && c.clientes.length) ? c.clientes : (c && c.clienteId ? [c.clienteId] : []) }
export function plantasDe(c) { return (c && c.plantas && c.plantas.length) ? c.plantas : (c && c.plantaId ? [c.plantaId] : []) }
const enIds = (lista, val) => !lista || lista.length === 0 || lista.includes(val)

export function reglaAplica(regla, ctx) {
  const c = regla.condiciones || {}
  if (!enLista(matsDe(c), ctx.material)) return false
  if (!enLista(eqsDe(c), ctx.tipoEquipo)) return false
  if (!enIds(clientesDe(c), ctx.clienteId)) return false
  if (!enIds(plantasDe(c), ctx.plantaId)) return false
  if (c.zona && !eq(c.zona, ctx.zona)) return false
  if (c.soloUrgente && !ctx.urgente) return false
  return true
}

// Cuántas condiciones fija la regla (más = más específica).
function especificidad(r) {
  const c = r.condiciones || {}
  let n = 0
  if (matsDe(c).length) n++
  if (eqsDe(c).length) n++
  if (clientesDe(c).length) n++
  if (plantasDe(c).length) n++
  if (c.zona) n++
  if (c.soloUrgente) n++
  return n
}

// Elige la mejor regla aplicable (más específica; empate → mayor prioridad).
export function elegirRegla(reglas, ctx) {
  const aplican = (reglas || []).filter((r) => r.activo !== false && reglaAplica(r, ctx))
  if (!aplican.length) return null
  return aplican.sort((a, b) => (especificidad(b) - especificidad(a)) || ((b.prioridad || 0) - (a.prioridad || 0)))[0]
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Devuelve { precioCliente, precioTransportista, pagoChofer, utilidad, reglaId, reglaNombre } o null.
export function calcularTarifa(reglas, ctx) {
  const r = elegirRegla(reglas, ctx)
  if (!r) return null
  const cant = (CANTIDAD[r.tipo] || (() => 1))(ctx)
  const urg = ctx.urgente && r.recargoUrgencia ? 1 + Number(r.recargoUrgencia) : 1

  // COBRO al cliente: por unidad (valorCliente) — o el viejo `valor`.
  const vCli = Number(r.valorCliente != null ? r.valorCliente : r.valor) || 0
  const precioCliente = r2(vCli * cant * urg)

  // PAGO al transportista: monto DIRECTO por unidad (valorTransportista) o, para reglas
  // viejas, un % del precio al cliente (pctTransportista, default 72%).
  let precioTransportista
  if (r.valorTransportista != null && r.valorTransportista !== '') {
    precioTransportista = r2(Number(r.valorTransportista) * cant * urg)
  } else {
    const pctT = r.pctTransportista != null ? Number(r.pctTransportista) : 0.72
    precioTransportista = r2(precioCliente * pctT)
  }

  // Pago al chofer: valor por DEFECTO (el transportista lo ajusta en el perfil del
  // chofer). Se conserva el % viejo como referencia.
  const pctCh = r.pctChofer != null ? Number(r.pctChofer) : 0.8
  const pagoChofer = r2(precioTransportista * pctCh)

  const utilidad = r2(precioCliente - precioTransportista)
  return { precioCliente, precioTransportista, pagoChofer, utilidad, reglaId: r.id, reglaNombre: r.nombre }
}
