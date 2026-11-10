// ============================================================================
// Motor de DISTRIBUCIÓN de Autoasignación.
//
// Reparte `total` paquetes entre los conductores de una ruta respetando:
//  · cantidades FIJAS (quedan fuera del reparto del resto),
//  · capacidad MÁXIMA por conductor (nadie la supera),
//  · rangos Start–End secuenciales sin huecos ni solapamientos (1..suma),
//  · método ZIP (ruta 081): sin rangos 1–N, la asignación es por código postal.
//
// NO inventa cantidades: si no cabe el total en las capacidades, lo marca como
// `faltante` para que el operador lo resuelva. Función PURA y testeable.
// ============================================================================

// conductores: [{ nombre, capacidadMax, fija }]  ·  opts: { zip }
export function distribuir(total, conductores, opts = {}) {
  const zip = !!opts.zip
  const t = Math.max(0, Math.round(Number(total) || 0))
  const cs = (conductores || []).map((c) => ({
    nombre: c.nombre,
    cap: zip ? Infinity : Math.max(0, Math.round(Number(c.capacidadMax) || 0)),
    fija: Math.max(0, Math.round(Number(c.fija) || 0)),
  }))
  const fijos = cs.reduce((a, c) => a + c.fija, 0)
  const resto = t - fijos
  const asign = cs.map((c) => Math.min(c.fija, c.cap === Infinity ? c.fija : c.cap))
  const libres = cs.map((c, i) => i).filter((i) => !cs[i].fija)

  if (libres.length && resto > 0) {
    const base = Math.floor(resto / libres.length)
    let queda = resto
    for (const i of libres) { const v = Math.min(base, cs[i].cap); asign[i] = v; queda -= v }
    // reparte el sobrante uno a uno a quien tenga cupo
    let guard = 0
    while (queda > 0 && guard < 1e7) {
      let puso = false
      for (const i of libres) { if (queda <= 0) break; if (asign[i] < cs[i].cap) { asign[i]++; queda--; puso = true } }
      if (!puso) break
      guard++
    }
  }

  // rangos secuenciales 1..suma (no ZIP)
  let cursor = 1
  const rangos = asign.map((v) => { if (v <= 0) return null; const r = [cursor, cursor + v - 1]; cursor += v; return r })
  const suma = asign.reduce((a, b) => a + b, 0)

  const lineas = cs.map((c, i) => ({
    nombre: c.nombre,
    capacidadMax: zip ? null : c.cap,
    fija: c.fija,
    cantidad: asign[i],
    rangoDesde: zip ? null : (rangos[i] ? rangos[i][0] : null),
    rangoHasta: zip ? null : (rangos[i] ? rangos[i][1] : null),
  }))

  const excedeCap = !zip && cs.some((c, i) => asign[i] > c.cap)
  const cuadra = suma === t
  const sinHuecos = zip || (cursor - 1 === suma)
  const bajos = []
  cs.forEach((c, i) => { if (asign[i] > 0 && asign[i] < 150) bajos.push(c.nombre) })

  return { lineas, total: t, fijos, suma, faltante: t - suma, cuadra, excedeCap, sinHuecos, zip, bajos }
}

// ¿El plan se puede guardar? (cuadra exacto y sin exceder capacidades)
export function planValido(r) {
  return !!r && r.cuadra && !r.excedeCap && r.sinHuecos
}

// Huella de contenido para evitar órdenes duplicadas (id determinista).
export function huellaOrden(o) {
  const base = [o.fecha, o.almacen, o.ruta, o.total, (o.lineas || []).map((l) => `${l.nombre}:${l.cantidad}`).join('|')].join('__')
  let h1 = 5381, h2 = 52711
  for (let i = 0; i < base.length; i++) { const c = base.charCodeAt(i); h1 = ((h1 * 33) ^ c) >>> 0; h2 = ((h2 * 31) + c) >>> 0 }
  return h1.toString(36) + '-' + h2.toString(36)
}
