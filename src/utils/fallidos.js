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
