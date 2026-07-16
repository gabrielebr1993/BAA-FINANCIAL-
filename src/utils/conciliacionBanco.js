// ---------------------------------------------------------------------------
// Conciliación bancaria: cruza los pagos calculados por MilePay (lo que DEBE
// salir del banco: choferes con saldo positivo + gastos fijos) con el extracto
// del banco (lo que REALMENTE salió). Detecta descuadres, pagos sin match y
// diferencias de monto por beneficiario. No toca ninguna fórmula de cálculo.
// ---------------------------------------------------------------------------

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

// Normaliza un nombre a un conjunto de "tokens" comparables (minúsculas, sin
// acentos ni símbolos, palabras de 3+ letras).
export function tokensNombre(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
}

function puntaje(a, b) {
  const A = new Set(tokensNombre(a))
  const B = new Set(tokensNombre(b))
  if (A.size === 0 || B.size === 0) return 0
  let comunes = 0
  for (const t of A) if (B.has(t)) comunes++
  return comunes
}

// Extrae [{ nombre, monto }] de un extracto bancario ya leído como matriz (aoa).
// Detecta las columnas de "descripción/beneficiario" y "monto" por su encabezado.
// Toma los DÉBITOS (pagos que salen) por su valor absoluto; si el archivo no trae
// negativos, toma todas las filas con monto.
export function parseExtractoBanco(aoa) {
  const filas = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c != null))
  if (filas.length === 0) return { movimientos: [], total: 0, aviso: 'El archivo está vacío.' }

  const norm = (v) => String(v || '').toLowerCase()
  const esDesc = (v) => /descrip|concep|detalle|beneficiario|payee|name|nombre/.test(norm(v))
  const esMonto = (v) => /amount|monto|importe|debito|débito|valor|cargo/.test(norm(v))

  // Buscar la fila de encabezado (primeras 15 filas) que tenga ambas columnas.
  let hdr = -1, descIdx = -1, amtIdx = -1
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const r = filas[i]
    const d = r.findIndex(esDesc)
    const m = r.findIndex(esMonto)
    if (d >= 0 && m >= 0) { hdr = i; descIdx = d; amtIdx = m; break }
  }
  // Sin encabezado claro: asumir formato Chase [Details, Fecha, Descripción, Monto…].
  if (hdr < 0) { hdr = 0; descIdx = 2; amtIdx = 3 }

  const cuerpo = filas.slice(hdr + 1)
  const crudos = []
  for (const r of cuerpo) {
    const desc = String(r[descIdx] ?? '').trim()
    const amtRaw = r[amtIdx]
    const monto = typeof amtRaw === 'number' ? amtRaw : parseFloat(String(amtRaw).replace(/[^0-9.-]/g, ''))
    // Un pago SIEMPRE tiene beneficiario (descripción). Las filas sin descripción son
    // totales/subtotales del extracto y se descartan (si no, se duplicaría la suma).
    if (!desc) continue
    if (!isFinite(monto) || monto === 0) continue
    crudos.push({ desc, monto })
  }
  const hayNegativos = crudos.some((c) => c.monto < 0)
  const pagos = crudos.filter((c) => (hayNegativos ? c.monto < 0 : true))

  const limpiarNombre = (desc) => {
    // "Online ACH payment to NAME" / "Zelle payment to NAME" / "Transfer to NAME"
    const m = desc.match(/(?:payment|transfer|pago|to|para|a)\s+to\s+(.+)$/i) || desc.match(/\bto\s+(.+)$/i)
    let n = m ? m[1] : desc
    return n.replace(/\s{2,}/g, ' ').trim()
  }
  const movimientos = pagos.map((c) => ({ nombre: limpiarNombre(c.desc), descripcion: c.desc, monto: redondear(Math.abs(c.monto)) }))
  const total = redondear(movimientos.reduce((a, m) => a + m.monto, 0))
  return { movimientos, total }
}

// Cruza MilePay (esperado) vs banco (real). `milePay` y `banco` son [{nombre, monto,…}].
// Emparejamiento por MEJOR coincidencia global: se generan todos los pares con 2+
// palabras de nombre en común y se asignan de mayor a menor puntaje (cada lado se usa
// una vez). Exigir 2 palabras evita casar por un simple nombre de pila repetido.
export function conciliar(milePay, banco) {
  const mp = milePay || []
  const bk = banco || []
  const usadosP = new Set(), usadosB = new Set()
  const emparejados = []
  const casar = (pi, bi) => { usadosP.add(pi); usadosB.add(bi); emparejados.push({ mp: mp[pi], banco: bk[bi], dif: redondear(mp[pi].monto - bk[bi].monto) }) }

  // Genera pares candidatos con un puntaje, los ordena de mayor a menor y los asigna
  // sin repetir lados. `cond` decide qué pares se consideran en cada pasada.
  const pasada = (cond) => {
    const pares = []
    mp.forEach((p, pi) => { if (usadosP.has(pi)) return; bk.forEach((b, bi) => { if (usadosB.has(bi)) return; const s = cond(p, b); if (s > 0) pares.push({ pi, bi, s }) }) })
    pares.sort((a, b) => b.s - a.s)
    for (const par of pares) { if (usadosP.has(par.pi) || usadosB.has(par.bi)) continue; casar(par.pi, par.bi) }
  }

  const cerca = (a, b) => Math.abs(a - b) < 0.01
  // 1) Nombre fuerte: 2+ palabras en común (mismo nombre y apellido).
  pasada((p, b) => { const s = puntaje(p.nombre, b.nombre); return s >= 2 ? 100 + s : 0 })
  // 2) Monto EXACTO: mismo importe aunque el banco use otro nombre del beneficiario
  //    (muy común: la empresa registra un apellido distinto). Suma un punto si además
  //    comparten alguna palabra, para desempatar montos iguales.
  pasada((p, b) => (cerca(p.monto, b.monto) ? 50 + puntaje(p.nombre, b.nombre) : 0))
  // 3) Última red: comparten al menos una palabra de nombre (nombre de pila).
  pasada((p, b) => puntaje(p.nombre, b.nombre))

  const soloMilePay = mp.filter((_, i) => !usadosP.has(i))
  const soloBanco = bk.filter((_, i) => !usadosB.has(i))
  const difs = emparejados.filter((e) => Math.abs(e.dif) > 0.01)

  const totMilePay = redondear(mp.reduce((a, p) => a + p.monto, 0))
  const totBanco = redondear(bk.reduce((a, b) => a + b.monto, 0))
  return {
    totMilePay, totBanco, diferencia: redondear(totMilePay - totBanco),
    cuadra: Math.abs(redondear(totMilePay - totBanco)) < 0.01,
    emparejados, difs, soloBanco, soloMilePay,
  }
}
