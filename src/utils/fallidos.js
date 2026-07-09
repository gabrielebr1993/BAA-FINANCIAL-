// ---------------------------------------------------------------------------
// Asocia los "Failed delivery" del reporte de Gofo a los choferes que YA existen
// en MilePay, haciendo match por nombre normalizado (y, si no hay match exacto,
// por coincidencia de tokens nombre+apellido). Los nombres del reporte pueden
// venir distintos que en la factura (ej. "Jesus Salcedo" vs "Jesus A Salcedo
// Fuenmayor"), por eso se normaliza y se compara por tokens.
// ---------------------------------------------------------------------------

// Normaliza: sin acentos, minúsculas, sin puntuación, espacios colapsados.
export function normNombre(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Tokens significativos (ignora iniciales sueltas de 1 letra, ej. "A", "R").
export function tokensNombre(s) {
  return normNombre(s).split(' ').filter((t) => t.length > 1)
}

// Asocia { nombreReporte: nFallidos } a una lista de nombres de choferes de MilePay.
//   1) match exacto por nombre normalizado
//   2) si no, el chofer con MÁS tokens compartidos (nombre+apellido), exigiendo
//      al menos 2 tokens en común para no casar solo por el primer nombre.
// Devuelve { porChofer, sinAsociar:[{nombre,n}], asociados, totalAsociado }.
export function asociarFallidos(fallidosPorNombre, choferesNombres) {
  const choferes = (choferesNombres || []).map((nombre) => ({ nombre, norm: normNombre(nombre), toks: tokensNombre(nombre) }))
  const porNorm = new Map()
  for (const c of choferes) if (c.norm && !porNorm.has(c.norm)) porNorm.set(c.norm, c.nombre)

  const porChofer = {}
  const sinAsociar = []
  for (const [nombreRep, n] of Object.entries(fallidosPorNombre || {})) {
    if (!n) continue
    const nrm = normNombre(nombreRep)
    let target = porNorm.get(nrm) || null
    if (!target) {
      const rt = tokensNombre(nombreRep)
      let best = null
      let bestScore = 0
      for (const c of choferes) {
        const shared = rt.filter((t) => c.toks.includes(t)).length
        if (shared > bestScore) { bestScore = shared; best = c.nombre }
      }
      if (bestScore >= 2) target = best // exige nombre+apellido (o dos coincidencias)
    }
    if (target) porChofer[target] = (porChofer[target] || 0) + n
    else sinAsociar.push({ nombre: nombreRep, n })
  }
  const asociados = Object.keys(porChofer).length
  const totalAsociado = Object.values(porChofer).reduce((a, b) => a + b, 0)
  sinAsociar.sort((a, b) => b.n - a.n)
  return { porChofer, sinAsociar, asociados, totalAsociado }
}

// Resuelve el nombre CRUDO de un courier de la factura al CHOFER REAL (canónico).
// `canonicos` = [{ nombre, norm, toks, aliasNorm:[...] }]. Reglas (estrictas para
// no unir personas distintas):
//   1) match exacto normalizado
//   2) match con un alias guardado
//   3) fuzzy: MISMO primer nombre + ≥2 tokens en común + uno contenido en el otro
//      (subconjunto), y único (sin empate). Así "Christian M Gutierrez Chaustre"
//      une con "Christian Gutierrez", pero "Kenny Daniel Franco Palma" NO une con
//      "Daniel Palma" (distinto primer nombre) ni "Maria … Navas Martínez" con
//      "Maria … Martinez Gonzalez" (apellidos distintos → no es subconjunto).
// Devuelve { nombre, tipo:'exacto'|'alias'|'fuzzy' } o null (para revisión manual).
export function resolverNombre(raw, canonicos) {
  const nrm = normNombre(raw)
  const rt = tokensNombre(raw)
  for (const c of canonicos || []) {
    if (c.norm === nrm) return { nombre: c.nombre, tipo: 'exacto' }
    if (c.aliasNorm && c.aliasNorm.includes(nrm)) return { nombre: c.nombre, tipo: 'alias' }
  }
  if (rt.length === 0) return null
  let best = null
  let bestShared = 0
  let empate = false
  for (const c of canonicos || []) {
    if (!c.toks || !c.toks.length) continue
    if (rt[0] !== c.toks[0]) continue // el primer nombre debe coincidir
    const shared = rt.filter((t) => c.toks.includes(t)).length
    if (shared < 2) continue // nombre + al menos un apellido
    const subset = rt.every((t) => c.toks.includes(t)) || c.toks.every((t) => rt.includes(t))
    if (!subset) continue // evita unir apellidos distintos
    if (shared > bestShared) { bestShared = shared; best = c.nombre; empate = false }
    else if (shared === bestShared && best && c.nombre !== best) empate = true
  }
  if (best && !empate) return { nombre: best, tipo: 'fuzzy' }
  return null
}

// Asocia una lista de PRECIOS por nombre CORTO (ej. "Alejandro Mejía") a los
// choferes de la factura, cuyos nombres son LARGOS (ej. "Alejandro Rafael Mejía
// Villanueva"). Reglas (conservadoras: ante duda, se deja para revisión manual):
//   1) match exacto normalizado
//   2) todos los tokens del nombre corto están en el largo (subconjunto) → fuerte
//   3) ≥2 tokens en común (nombre+apellido); si empatan dos choferes, se descarta
// `preciosArr` = [{ nombre, ind, doble }]. Devuelve:
//   { porChofer: { nombreChofer: {ind, doble, origen} }, sinAsociar:[...], asociados }
export function asociarPrecios(preciosArr, choferesNombres) {
  const choferes = (choferesNombres || []).map((nombre) => ({ nombre, norm: normNombre(nombre), toks: tokensNombre(nombre) }))
  const porNorm = new Map()
  for (const c of choferes) if (c.norm && !porNorm.has(c.norm)) porNorm.set(c.norm, c.nombre)

  const porChofer = {}
  const sinAsociar = []
  for (const p of preciosArr || []) {
    const nrm = normNombre(p.nombre)
    let target = porNorm.get(nrm) || null
    if (!target) {
      const rt = tokensNombre(p.nombre)
      let best = null
      let bestScore = 0
      let empate = false
      for (const c of choferes) {
        const shared = rt.filter((t) => c.toks.includes(t)).length
        const subconjunto = rt.length > 0 && rt.every((t) => c.toks.includes(t))
        const bordes = rt.length && c.toks.length && rt[0] === c.toks[0] && rt[rt.length - 1] === c.toks[c.toks.length - 1]
        const score = shared + (subconjunto ? 1 : 0) + (bordes ? 1 : 0)
        if (score > bestScore) { bestScore = score; best = c.nombre; empate = false }
        else if (score === bestScore && score > 0 && best && c.nombre !== best) empate = true
      }
      if (bestScore >= 2 && !empate) target = best
    }
    if (target) porChofer[target] = { ind: p.ind, doble: p.doble }
    else sinAsociar.push(p)
  }
  return { porChofer, sinAsociar, asociados: Object.keys(porChofer).length }
}
