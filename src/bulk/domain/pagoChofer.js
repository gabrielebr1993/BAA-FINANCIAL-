// ============================================================================
// BULK · Dominio · Cómo el transportista le paga a su chofer (lógica pura).
// El transportista elige por chofer: un % de lo que recibe por esa carga, o un
// valor fijo por carga entregada. Si no hay config, no se calcula (se respeta lo
// que ya trae la orden).
// ============================================================================
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Config de un chofer: { tipo: 'porcentaje' | 'fijo', valor: number }
// precioTransportista = lo que el transportista recibe por esa carga.
// Devuelve el pago al chofer, o null si no hay una config válida (deja la orden como está).
export function calcularPagoChofer(precioTransportista, config) {
  if (!config || !config.tipo) return null
  const valor = num(config.valor)
  if (valor <= 0) return null
  if (config.tipo === 'porcentaje') return r2(num(precioTransportista) * valor / 100)
  if (config.tipo === 'fijo') return r2(valor)
  return null
}

// Toma el mapa de configs del transportista (pagoChoferes[driverId]) y devuelve
// la config de un chofer, normalizada, o null.
export function configDeChofer(pagoChoferes, driverId) {
  const c = pagoChoferes && pagoChoferes[driverId]
  if (!c || !c.tipo) return null
  return { tipo: c.tipo, valor: num(c.valor) }
}

// Etiqueta legible de una config de pago (para la UI).
export function etiquetaPago(config) {
  if (!config || !config.tipo || num(config.valor) <= 0) return ''
  if (config.tipo === 'porcentaje') return `${num(config.valor)}% por carga`
  return `$${r2(config.valor)} por carga`
}
