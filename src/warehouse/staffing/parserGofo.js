// ============================================================================
// PARSER del reporte semanal de staffing de GOFO (Warehouse / Staffing).
//
// Entrada: un workbook de SheetJS (leído con cellFormula:true y cellDates:true)
// Salida:  análisis por pestaña SIN tocar la base de datos — la UI decide qué
//          importar después de mostrar la vista previa.
//
// Reglas clave (ver spec del dueño):
// · Pestañas provisionales ("Shift 9", "Sheet10", …) se OMITEN por completo.
// · Solo se procesan pestañas con nombre de período definitivo (08.24-08.30)
//   Y datos completos. El año/fechas salen de los ENCABEZADOS, no del nombre.
// · Encabezados reconocidos por texto, no por posición fija.
// · Fórmulas sin resultado guardado se evalúan con un mini-motor; si no se
//   puede, el período queda pendiente con el motivo.
// · Filas de control (totales), encabezados repetidos y notas NO se importan
//   como trabajadores. Los ajustes se capturan por separado.
// · Nada se inventa: si falta un dato financiero necesario → pendiente.
// ============================================================================

// ── Utilidades de celdas (sin depender de XLSX: leemos el objeto crudo) ─────
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function colLetra(n) { // 0 → A
  let s = ''
  n = n + 1
  while (n > 0) { const r = (n - 1) % 26; s = LETRAS[r] + s; n = Math.floor((n - 1) / 26) }
  return s
}
export function letraCol(ref) { // 'AB' → 27
  let n = 0
  for (const ch of ref) n = n * 26 + (LETRAS.indexOf(ch) + 1)
  return n - 1
}
function celda(hoja, c, f) { return hoja[colLetra(c) + (f + 1)] }
function rangoHoja(hoja) {
  const ref = hoja['!ref']
  if (!ref) return { c2: -1, f2: -1 }
  const m = ref.split(':')
  const fin = m[1] || m[0]
  const mm = fin.match(/^([A-Z]+)(\d+)$/)
  if (!mm) return { c2: -1, f2: -1 }
  return { c2: letraCol(mm[1]), f2: parseInt(mm[2], 10) - 1 }
}

// ── Normalización ───────────────────────────────────────────────────────────
export function normalizarNombre(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toUpperCase()
}
// Para BUSCAR: sin acentos ni mayúsculas ("maria" encuentra "María").
// Solo para comparar en filtros; nunca cambia lo guardado.
export function paraBuscar(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
}
export function hashContenido(obj) {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj)
  let h1 = 5381, h2 = 52711
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = ((h1 * 33) ^ c) >>> 0
    h2 = ((h2 * 31) + c) >>> 0
  }
  return h1.toString(36) + '-' + h2.toString(36)
}

// Mapeo base de posiciones (configurable desde la pantalla de Tarifas).
export const POSICIONES_BASE = {
  '分拣工': 'Sorter',
  '叉车工': 'Forklift',
  '清洁工': 'Cleaner',
}
// El reporte de Gofo agrega sufijos al nombre que NO son parte del nombre:
// números de turno/almacén ("Alberto Leon 3") y etiquetas de posición en
// chino ("Adrian Chacoa 叉车"). Se quitan SIEMPRE al importar, en bucle por
// si vienen combinados ("Nombre 叉车 3"). Un nombre chino REAL no se toca:
// solo se quita la última palabra cuando es una etiqueta de posición conocida
// y queda al menos una palabra de nombre. La migración en Trabajadores
// conserva el nombre viejo como alias para que nada se duplique.
// Regla general: si el resto del nombre tiene letras latinas, se quita del
// final CUALQUIER etiqueta del archivo:
// · palabras solo en chino (posición, turno, almacén, lo que sea)
// · mezclas sin letras latinas ("3(叉车", "(3)", "#12")
// · etiquetas de turno/posición en MAYÚSCULAS del reporte ("FLD", "ON"…)
// Un nombre totalmente chino (persona china real) nunca se toca.
const RX_CJK = /^[㐀-䶿一-鿿豈-﫿]+$/
const RX_LATINO = /[A-Za-zÀ-ÿ]/
const RX_SIN_LATINO = /^[^A-Za-zÀ-ÿ]+$/ // dígitos, paréntesis, chino, # …
const RX_TAG_ARCHIVO = /^(FLD|ON|OFF|AM|PM)$/ // exactas, solo en MAYÚSCULAS
export function limpiarNombrePersona(raw) {
  let s = String(raw || '').trim()
  let antes
  do {
    antes = s
    s = s.replace(/\s+#?\d{1,3}$/, '').trim()
    const partes = s.split(/\s+/)
    if (partes.length > 1) {
      const ultimo = partes[partes.length - 1]
      const pelado = ultimo.replace(/^[([【（]+|[)\]】）]+$/g, '')
      const restoConLatino = partes.slice(0, -1).some((p) => RX_LATINO.test(p))
      if (restoConLatino && (RX_CJK.test(pelado) || RX_SIN_LATINO.test(ultimo) || RX_TAG_ARCHIVO.test(pelado))) {
        s = partes.slice(0, -1).join(' ')
      }
    }
    s = s.trim()
  } while (s !== antes)
  return s
}

export function mapearPosicion(raw, mapa) {
  const texto = String(raw || '').trim()
  if (!texto) return ''
  const m = mapa || POSICIONES_BASE
  if (m[texto]) return m[texto]
  // tolerante: el valor puede venir con espacios o mezclado ("分拣工 Sorter")
  for (const k of Object.keys(m)) if (texto.includes(k)) return m[k]
  return texto // posición ya legible (p. ej. "Sorter"); se conserva tal cual
}

// ── Mini-motor de fórmulas ──────────────────────────────────────────────────
// Soporta: SUM, ROUND, IF, IFS, MAX, MIN, ABS, aritmética, comparaciones
// (también de TEXTO: F2="分拣工", como en las fórmulas reales de Gofo),
// cadenas entre comillas, TRUE/FALSE, referencias y rangos.
// Devuelve número o cadena; el llamador decide qué necesita.
export function evaluarFormula(hoja, formula, visitados) {
  const vis = visitados || new Set()
  const src = String(formula).replace(/^=/, '').replace(/_xlfn\./g, '')
  let i = 0
  const err = (m) => { const e = new Error(m); e.formula = formula; throw e }
  const num = (v) => {
    if (typeof v === 'number') return v
    if (typeof v === 'boolean') return v ? 1 : 0
    const n = parseFloat(String(v).replace(/[$,%\s]/g, ''))
    if (!Number.isFinite(n)) err('se esperaba un número y hay "' + v + '"')
    return n
  }
  const valorCelda = (ref) => {
    const limpio = ref.replace(/\$/g, '')
    if (vis.has(limpio)) err('referencia circular: ' + limpio)
    const cel = hoja[limpio]
    if (!cel) return 0 // celda vacía = 0 (igual que Excel)
    // stub (t:'z'): fórmula SIN resultado guardado — su v es un relleno falso,
    // NUNCA se interpreta como cero: se evalúa la fórmula.
    if (cel.f && (cel.t === 'z' || cel.v === undefined || cel.v === null)) {
      vis.add(limpio)
      const r0 = evaluarFormula(hoja, cel.f, vis)
      vis.delete(limpio)
      return r0
    }
    if (cel.v !== undefined && cel.v !== null) {
      if (typeof cel.v === 'number' || typeof cel.v === 'boolean') return cel.v
      return String(cel.v) // texto crudo: las comparaciones lo necesitan
    }
    return 0
  }
  const rango = (a, b) => {
    const ma = a.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/)
    const mb = b.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/)
    if (!ma || !mb) err('rango inválido')
    const c1 = letraCol(ma[1]), f1 = +ma[2], c2 = letraCol(mb[1]), f2 = +mb[2]
    if ((Math.abs(c2 - c1) + 1) * (Math.abs(f2 - f1) + 1) > 5000) err('rango demasiado grande')
    const vals = []
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      for (let f = Math.min(f1, f2); f <= Math.max(f1, f2); f++) {
        const cel = hoja[colLetra(c) + f]
        if (!cel) continue
        if (cel.f && (cel.t === 'z' || cel.v === undefined || cel.v === null)) {
          const r0 = valorCelda(colLetra(c) + f)
          if (typeof r0 === 'number') vals.push(r0)
          continue
        }
        if (cel.v !== undefined && cel.v !== null && cel.v !== '') {
          const n = typeof cel.v === 'number' ? cel.v : parseFloat(String(cel.v).replace(/[$,%\s]/g, ''))
          if (Number.isFinite(n)) vals.push(n)
        }
      }
    }
    return vals
  }
  const saltar = () => { while (i < src.length && (src[i] === ' ' || src[i] === '\n')) i++ }
  const iguales = (a, b) => {
    if (typeof a === 'string' || typeof b === 'string') return String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
    return num(a) === num(b)
  }
  function expr() {
    let v = term()
    for (;;) {
      saltar()
      const dos = src.slice(i, i + 2)
      if (dos === '>=' || dos === '<=' || dos === '<>') {
        i += 2; const b = term()
        v = dos === '>=' ? (num(v) >= num(b)) : dos === '<=' ? (num(v) <= num(b)) : !iguales(v, b)
        continue
      }
      const c = src[i]
      if (c === '+' || c === '-') { i++; const b = term(); v = c === '+' ? num(v) + num(b) : num(v) - num(b) }
      else if (c === '=') { i++; const b = term(); v = iguales(v, b) }
      else if (c === '>' || c === '<') { i++; const b = term(); v = c === '>' ? num(v) > num(b) : num(v) < num(b) }
      else if (c === '&') { i++; const b = term(); v = String(v) + String(b) }
      else break
    }
    return v
  }
  function term() {
    let v = factor()
    for (;;) {
      saltar()
      const c = src[i]
      if (c === '*' || c === '/') { i++; const b = factor(); v = c === '*' ? num(v) * num(b) : num(v) / num(b) }
      else break
    }
    return v
  }
  function factor() {
    saltar()
    const c = src[i]
    if (c === '(') { i++; const v = expr(); saltar(); if (src[i] !== ')') err('falta )'); i++; return v }
    if (c === '-') { i++; return -num(factor()) }
    if (c === '+') { i++; return num(factor()) }
    if (c === '"') { // cadena literal
      let j = i + 1, s = ''
      while (j < src.length && src[j] !== '"') { s += src[j]; j++ }
      if (src[j] !== '"') err('cadena sin cerrar')
      i = j + 1
      return s
    }
    const mNum = src.slice(i).match(/^\d+(\.\d+)?/)
    const mFun = src.slice(i).match(/^([A-Za-z]+)\(/)
    const mRef = src.slice(i).match(/^\$?[A-Z]+\$?\d+/)
    const mBool = src.slice(i).match(/^(TRUE|FALSE)\b/i)
    if (mFun && ['SUM', 'ROUND', 'IF', 'IFS', 'MAX', 'MIN', 'ABS'].includes(mFun[1].toUpperCase())) {
      const fn = mFun[1].toUpperCase()
      i += mFun[0].length
      const args = []
      for (;;) {
        saltar()
        if (src[i] === ')') { i++; break } // función sin argumentos restantes
        const mRango = src.slice(i).match(/^(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/)
        if (mRango) { args.push({ rango: rango(mRango[1], mRango[2]) }); i += mRango[0].length } else args.push({ valor: expr() })
        saltar()
        if (src[i] === ',') { i++; continue }
        if (src[i] === ')') { i++; break }
        err('argumentos inválidos en ' + fn)
      }
      const planos = args.flatMap((a) => (a.rango ? a.rango : [a.valor]))
      const verdad = (x) => (typeof x === 'boolean' ? x : typeof x === 'number' ? x !== 0 : String(x).toLowerCase() === 'true')
      if (fn === 'SUM') return planos.reduce((s, x) => s + num(x), 0)
      if (fn === 'MAX') return Math.max(...planos.map(num))
      if (fn === 'MIN') return Math.min(...planos.map(num))
      if (fn === 'ABS') return Math.abs(num(planos[0]))
      if (fn === 'ROUND') { const p = 10 ** (num(planos[1] || 0)); return Math.round(num(planos[0]) * p) / p }
      if (fn === 'IF') return verdad(planos[0]) ? planos[1] : (planos.length > 2 ? planos[2] : 0)
      if (fn === 'IFS') {
        for (let k = 0; k + 1 < planos.length; k += 2) if (verdad(planos[k])) return planos[k + 1]
        err('IFS sin condición verdadera')
      }
    }
    if (mRef) { i += mRef[0].length; return valorCelda(mRef[0]) }
    if (mNum) { i += mNum[0].length; return parseFloat(mNum[0]) }
    if (mBool) { i += mBool[0].length; return mBool[0].toUpperCase() === 'TRUE' }
    err('no entiendo la fórmula cerca de "' + src.slice(i, i + 12) + '"')
    return 0
  }
  const v = expr()
  saltar()
  if (i < src.length) err('sobra texto en la fórmula')
  if (typeof v === 'number' && !Number.isFinite(v)) err('resultado no numérico')
  return typeof v === 'boolean' ? (v ? 1 : 0) : v
}

// Lee un valor numérico de una celda: valor guardado → fórmula evaluada → null.
// Devuelve { valor, deFormula, error } — null de valor significa "no hay dato".
export function valorNumerico(hoja, c, f) {
  const cel = celda(hoja, c, f)
  if (!cel) return { valor: null }
  const evaluar = () => {
    try {
      const r = evaluarFormula(hoja, cel.f)
      if (typeof r === 'number') return { valor: r, deFormula: true }
      const n = parseFloat(String(r).replace(/[$,%\s]/g, ''))
      return Number.isFinite(n) ? { valor: n, deFormula: true } : { valor: null, texto: String(r) }
    } catch (e) { return { valor: null, error: 'fórmula sin resultado: =' + cel.f } }
  }
  // celda stub (t:'z' con fórmula): la copia no guardó el resultado — se
  // evalúa la fórmula; su v de relleno jamás se toma como cero.
  if (cel.f && (cel.t === 'z' || cel.v === undefined || cel.v === null || cel.v === '')) return evaluar()
  if (cel.v !== undefined && cel.v !== null && cel.v !== '') {
    if (typeof cel.v === 'number') return { valor: cel.v }
    const n = parseFloat(String(cel.v).replace(/[$,%\s]/g, ''))
    return Number.isFinite(n) ? { valor: n } : { valor: null, texto: String(cel.v) }
  }
  return { valor: null }
}
function textoCelda(hoja, c, f) {
  const cel = celda(hoja, c, f)
  if (!cel || cel.v === undefined || cel.v === null) return ''
  if (cel.t === 'z') return '' // stub de fórmula: su v es relleno, no texto
  return String(cel.v).trim()
}
// Busca el primer valor numérico a la derecha de una etiqueta (los reportes
// reales ponen el número 1-4 columnas después, p. ej. etiqueta en U y valor en X).
function valorCercano(hoja, f, c, maxCol) {
  for (let cc = c + 1; cc <= Math.min(c + 4, maxCol); cc++) {
    const v = valorNumerico(hoja, cc, f)
    if (v.valor !== null) return v.valor
  }
  return null
}

// ── Fechas ──────────────────────────────────────────────────────────────────
const MS_DIA = 86400000
function serialAFecha(n) { return new Date(Date.UTC(1899, 11, 30) + n * MS_DIA) }
function aISO(d) { return d.toISOString().slice(0, 10) }
// Interpreta el encabezado de una columna de día: Date | serial | "8/24" | "08.24" | "2025-08-24"
export function fechaDeEncabezado(cel, anoPista) {
  if (!cel) return null
  const v = cel.v
  if (v instanceof Date && !isNaN(v)) return aISO(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())))
  if (typeof v === 'number' && v > 20000 && v < 60000) return aISO(serialAFecha(v))
  const s = String(v || '').trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return aISO(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return aISO(new Date(Date.UTC(+m[3], +m[1] - 1, +m[2])))
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/) // sin año: solo con pista verificada
  if (m && anoPista) return aISO(new Date(Date.UTC(anoPista, +m[1] - 1, +m[2])))
  return null
}

// Nombre provisional: Shift/Sheet + número (cualquier espacio/caso) → se omite.
export function esNombreProvisional(nombre) {
  return /^\s*(shift|sheet)\s*\d+\s*$/i.test(String(nombre || ''))
}
// Nombre de período definitivo: "08.24-08.30", "9.28 - 10.04", "08.24–08.30"…
export function esNombrePeriodo(nombre) {
  return /^\s*\d{1,2}[._/]\d{1,2}\s*[-–—]\s*\d{1,2}[._/]\d{1,2}\s*$/.test(String(nombre || ''))
}

// ── Detección de encabezados por TEXTO (no por posición) ───────────────────
function detectarEncabezados(hoja, maxFila, maxCol, anoPista) {
  for (let f = 0; f < Math.min(maxFila + 1, 14); f++) {
    let cPay = -1, cOT = -1
    for (let c = 0; c <= maxCol; c++) {
      const t = textoCelda(hoja, c, f).toLowerCase()
      if (cPay < 0 && /pay\s*rate/.test(t) && !/ot/.test(t)) cPay = c
      if (cOT < 0 && /ot\s*rate|overtime\s*rate/.test(t)) cOT = c
    }
    if (cPay < 0 || cOT < 0) continue
    // esta es la fila de encabezados: mapear el resto por texto
    const cols = { payRate: cPay, otRate: cOT, dias: [] }
    for (let c = 0; c <= maxCol; c++) {
      const bruto = textoCelda(hoja, c, f)
      const t = bruto.toLowerCase()
      if (c < cPay && (/(name|nombre|employee|worker|姓名|员工)/.test(t) || (cols.nombre === undefined && c === 0 && !t))) {
        if (/(name|nombre|employee|worker|姓名|员工)/.test(t)) cols.nombre = c
      }
      if (/^(status|estado)/.test(t)) cols.estado = c
      if (/(agency|agencia)/.test(t)) cols.agencia = c
      if (/(position|posici|岗位|工种)/.test(t)) cols.posicion = c
      if (/(warehouse|almac|仓库)/.test(t)) cols.warehouse = c
      const fecha = fechaDeEncabezado(celda(hoja, c, f), anoPista)
      if (fecha && c > cPay) cols.dias.push({ col: c, fecha })
      if (/total\s*(hour|hrs|hora)/.test(t) && cols.totalHoras === undefined) cols.totalHoras = c
      if (/(^|\s)ot\s*(hour|hrs|hora)|overtime\s*hour/.test(t) && cols.otHoras === undefined) cols.otHoras = c
      // importes: acepta Amount/Pay/Salary/Wage/Cost (el real usa "Total RE
      // Cost" / "Total OT Cost" / "Total Cost")
      const esReg = /(regular|(^|\s)re)\s*(cost|amount|pay|salary|wage)/.test(t) || /(amount|pay)\s.*regular/.test(t)
      const esOT = /(ot|overtime)\s*(cost|amount|pay|salary|wage)/.test(t) && !/rate/.test(t)
      if (esReg && cols.importeReg === undefined) cols.importeReg = c
      if (esOT && cols.importeOT === undefined) cols.importeOT = c
      if (!esReg && !esOT && /(total|grand)\s*(cost|amount|pay|salary|importe|wage)/.test(t) && cols.importeTotal === undefined) cols.importeTotal = c
    }
    if (cols.nombre === undefined) cols.nombre = 0 // el nombre va antes del Pay Rate
    // respaldo con el layout documentado (A..S) si faltó algo por texto
    if (cols.posicion === undefined) cols.posicion = 5
    if (cols.estado === undefined) cols.estado = 3
    if (cols.agencia === undefined) cols.agencia = 4
    if (cols.warehouse === undefined) cols.warehouse = 6
    if (!cols.dias.length) {
      // intenta H..N aunque el encabezado de fecha no se haya reconocido
      for (let c = 7; c <= 13; c++) {
        const fecha = fechaDeEncabezado(celda(hoja, c, f), anoPista)
        if (fecha) cols.dias.push({ col: c, fecha })
      }
    }
    if (cols.totalHoras === undefined && cols.dias.length) cols.totalHoras = cols.dias[cols.dias.length - 1].col + 1
    if (cols.otHoras === undefined && cols.totalHoras !== undefined) cols.otHoras = cols.totalHoras + 1
    if (cols.importeReg === undefined && cols.otHoras !== undefined) cols.importeReg = cols.otHoras + 1
    if (cols.importeOT === undefined && cols.importeReg !== undefined) cols.importeOT = cols.importeReg + 1
    if (cols.importeTotal === undefined && cols.importeOT !== undefined) cols.importeTotal = cols.importeOT + 1
    return { fila: f, cols }
  }
  return null
}

// Busca un año explícito en las primeras filas (título, encabezados con fecha completa).
function buscarAno(hoja, maxCol) {
  for (let f = 0; f < 8; f++) {
    for (let c = 0; c <= maxCol; c++) {
      const cel = celda(hoja, c, f)
      if (!cel) continue
      if (cel.v instanceof Date && !isNaN(cel.v)) return cel.v.getFullYear()
      if (typeof cel.v === 'number' && cel.v > 20000 && cel.v < 60000) return serialAFecha(cel.v).getUTCFullYear()
      const m = String(cel.v || '').match(/\b(20\d{2})\b/)
      if (m) return +m[1]
    }
  }
  return null
}

// ── Fórmulas COMPARTIDAS de Excel ───────────────────────────────────────────
// El archivo real de Gofo guarda la fórmula solo en la celda base de cada
// columna (<f t="shared">); las demás quedan vacías y SheetJS las entrega como
// stubs sin fórmula. Aquí se materializan: a cada stub se le asigna la fórmula
// base de SU columna desplazada por filas (las referencias con $ no se mueven).
function desplazarFilas(formula, delta) {
  return String(formula).replace(/(\$?[A-Z]+)(\$?)(\d+)/g, (m, col, abs, fila) => (abs === '$' ? m : col + (parseInt(fila, 10) + delta)))
}
export function expandirFormulasCompartidas(hoja) {
  const { c2, f2 } = rangoHoja(hoja)
  for (let c = 0; c <= c2; c++) {
    let base = null
    for (let f = 0; f <= f2; f++) {
      const cel = hoja[colLetra(c) + (f + 1)]
      if (!cel) continue
      if (cel.f) { base = { fila: f, f: cel.f }; continue }
      if (cel.t === 'z' && base && f - base.fila < 400) {
        cel.f = desplazarFilas(base.f, f - base.fila)
      } else if (cel.v !== undefined && cel.v !== null && cel.v !== '' && cel.t !== 'z') {
        // una celda con valor propio corta la cadena de la fórmula compartida
        base = null
      }
    }
  }
}

const RX_CONTROL = /^(total|subtotal|sum|totales|合计|总计|小计)\b/i
const RX_AJUSTE = /(adjust|ajust|deduct|deducci|descuento|bonus|bono|penalt|reimburs|reembolso|correcci|make\s*up|makeup)/i

// ── Análisis de UNA pestaña ────────────────────────────────────────────────
export function analizarHoja(hoja, nombre, opciones) {
  const op = opciones || {}
  const posMap = op.posiciones || POSICIONES_BASE
  if (esNombreProvisional(nombre)) return { tipo: 'omitida', hoja: nombre, motivo: 'provisional (Shift/Sheet + número): Gofo aún no cierra este período' }
  const { c2, f2 } = rangoHoja(hoja)
  if (c2 < 0) return { tipo: 'omitida', hoja: nombre, motivo: 'pestaña vacía' }
  expandirFormulasCompartidas(hoja)
  const anoPista = buscarAno(hoja, c2)
  const enc = detectarEncabezados(hoja, f2, c2, anoPista)
  if (!enc) return { tipo: 'omitida', hoja: nombre, motivo: 'no es un reporte de facturación (sin encabezados Pay Rate / OT Rate)' }
  if (!esNombrePeriodo(nombre)) return { tipo: 'omitida', hoja: nombre, motivo: 'nombre de pestaña no definitivo (se esperan fechas, p. ej. 08.24-08.30)' }

  const motivos = []
  const avisos = []
  const cols = enc.cols
  if (!cols.dias.length) motivos.push('no se reconocieron las columnas de días con fecha en los encabezados')
  if (!anoPista && cols.dias.length && !cols.dias.every((d) => d.fecha.length === 10)) motivos.push('no se pudo verificar el año con los encabezados del archivo')

  // fechas del período según encabezados (autoridad) + cruce con el nombre
  const fechas = cols.dias.map((d) => d.fecha).sort()
  const inicio = fechas[0] || null
  const fin = fechas[fechas.length - 1] || null
  if (inicio && fin) {
    const mNom = String(nombre).match(/(\d{1,2})[._/](\d{1,2})\s*[-–—]\s*(\d{1,2})[._/](\d{1,2})/)
    if (mNom) {
      const [mi, di, mf, df] = [+mNom[1], +mNom[2], +mNom[3], +mNom[4]]
      const [ai, bi] = [inicio.slice(5, 7), inicio.slice(8, 10)].map(Number)
      const [af, bf] = [fin.slice(5, 7), fin.slice(8, 10)].map(Number)
      if (mi !== ai || di !== bi || mf !== af || df !== bf) {
        avisos.push(`el nombre de la pestaña (${nombre.trim()}) no coincide con las fechas de los encabezados (${inicio} a ${fin}); se usan las fechas de los encabezados`)
      }
    }
  } else motivos.push('no se pudieron determinar las fechas del período')

  // ── filas ──
  const filas = []
  const ajustes = []
  const controles = []
  let filasIncompletas = 0
  // Bloques de conciliación al pie del reporte real ("Paid / HOURS / Correct
  // Payment / OVERPAID" por semana anterior): son AJUSTES, no trabajadores.
  let bloqueOverpaid = null
  for (let f = enc.fila + 1; f <= f2; f++) {
    const nombreRaw = textoCelda(hoja, cols.nombre, f)
    const tienePay = valorNumerico(hoja, cols.payRate, f).valor !== null
    // ¿encabezado repetido?
    if (/pay\s*rate/i.test(textoCelda(hoja, cols.payRate, f))) continue
    // ¿arranca un bloque OVERPAID? (B="Paid", D~"Correct", E~"OVERPAID")
    const tB = textoCelda(hoja, 1, f).toLowerCase()
    const tD = textoCelda(hoja, 3, f).toLowerCase()
    const tE = textoCelda(hoja, 4, f).toLowerCase()
    if (/^paid\b/.test(tB) && (/overpaid/.test(tE) || /correct/.test(tD))) {
      bloqueOverpaid = { periodo: nombreRaw || '(sin período)' }
      continue
    }
    if (bloqueOverpaid) {
      const posEnBloque = textoCelda(hoja, cols.posicion, f)
      if (posEnBloque) {
        bloqueOverpaid = null // volvió la tabla normal: procesar abajo
      } else {
        if (!nombreRaw || /^total/i.test(nombreRaw) || /^total/i.test(tD)) continue
        const pagado = valorNumerico(hoja, 1, f).valor
        const horasB = valorNumerico(hoja, 2, f).valor
        const correcto = valorNumerico(hoja, 3, f).valor
        const sobre = valorNumerico(hoja, 4, f).valor
        if (sobre !== null && Math.abs(sobre) > 0.004) {
          ajustes.push({
            concepto: `OVERPAID ${bloqueOverpaid.periodo}: pagado $${pagado ?? '?'} vs correcto $${correcto ?? '?'} (${horasB ?? '?'} h)`,
            importe: -Math.abs(sobre), // lo sobrepagado se descuenta del ingreso
            personaRaw: nombreRaw,
            tipo: 'overpaid',
            periodoOrigenTexto: bloqueOverpaid.periodo,
            origen: { hoja: nombre, fila: f + 1 },
          })
        }
        continue
      }
    }
    // ¿fila de control/total?
    if (RX_CONTROL.test(nombreRaw) || (!nombreRaw && !tienePay)) {
      const tot = cols.importeTotal !== undefined ? valorNumerico(hoja, cols.importeTotal, f) : { valor: null }
      const hrs = cols.totalHoras !== undefined ? valorNumerico(hoja, cols.totalHoras, f) : { valor: null }
      if (RX_CONTROL.test(nombreRaw) && (tot.valor !== null || hrs.valor !== null)) controles.push({ fila: f + 1, horas: hrs.valor, importe: tot.valor })
      // ¿nota o ajuste suelto en la zona del nombre?
      if (nombreRaw && RX_AJUSTE.test(nombreRaw)) {
        const imp = buscarImporteEnFila(hoja, f, c2)
        if (imp !== null) ajustes.push(ajusteDesdeFila(nombreRaw, imp, nombre, f))
      }
      continue
    }
    if (!nombreRaw) continue
    // ¿la "fila de trabajador" es en realidad un AJUSTE de un período anterior?
    // (el archivo real los mete como filas con tarifa negativa y nombres tipo
    //  "Heaven Anderson 3 0803-0809 adjustment" / "0806 makeup")
    if (RX_AJUSTE.test(nombreRaw)) {
      const impAj = cols.importeTotal !== undefined ? valorNumerico(hoja, cols.importeTotal, f) : { valor: null }
      const imp = impAj.valor !== null ? impAj.valor : buscarImporteEnFila(hoja, f, c2)
      if (imp !== null) {
        const aj = ajusteDesdeFila(nombreRaw, imp, nombre, f)
        // nombre de la persona SIN el sufijo del ajuste ("0803-0809 adjustment")
        // para que enlace con su perfil; el concepto conserva el texto completo
        const personaLimpia = nombreRaw
          .replace(/(\d{1,2}[._/]\d{1,2}\s*[-\u2013\u2014]\s*\d{1,2}[._/]\d{1,2})|(\b\d{4}\s*[-\u2013\u2014]\s*\d{4}\b)|(\b\d{4}\b)/g, ' ')
          .replace(/\S*(adjust|ajust|deduct|deducci|descuento|bonus|bono|penalt|reimburs|reembolso|correcci|makeup)\S*/gi, ' ')
          .replace(/\bmake\s*up\b/gi, ' ')
          .replace(/\s+/g, ' ').trim()
        ajustes.push({ ...aj, tipo: 'fila', personaRaw: personaLimpia || nombreRaw })
      }
      continue
    }

    const payRate = valorNumerico(hoja, cols.payRate, f)
    const otRate = valorNumerico(hoja, cols.otRate, f)
    const dias = {}
    let sumaDias = 0
    for (const d of cols.dias) {
      const v = valorNumerico(hoja, d.col, f)
      if (v.valor !== null) { dias[d.fecha] = v.valor; sumaDias += v.valor } // día sin horas = simplemente no registrado (válido)
      if (v.error) avisos.push(`fila ${f + 1}: ${v.error}`)
    }
    const totalHoras = valorNumerico(hoja, cols.totalHoras, f)
    const otHoras = valorNumerico(hoja, cols.otHoras, f)
    const impReg = valorNumerico(hoja, cols.importeReg, f)
    const impOT = valorNumerico(hoja, cols.importeOT, f)
    const impTotal = valorNumerico(hoja, cols.importeTotal, f)

    const faltantes = []
    if (payRate.valor === null) faltantes.push('Pay Rate')
    if (otRate.valor === null) faltantes.push('OT Rate')
    if (totalHoras.valor === null) faltantes.push('total de horas')
    if (impTotal.valor === null) faltantes.push('importe total')
    for (const x of [payRate, otRate, totalHoras, otHoras, impReg, impOT, impTotal]) if (x.error) faltantes.push(x.error)
    if (faltantes.length) {
      filasIncompletas++
      motivos.push(`fila ${f + 1} (${nombreRaw}): falta ${[...new Set(faltantes)].join(', ')}`)
    }

    const horasTot = totalHoras.valor !== null ? totalHoras.valor : sumaDias
    const horasOT = otHoras.valor || 0
    const horasReg = Math.max(0, horasTot - horasOT)
    // cruces de control por fila
    if (totalHoras.valor !== null && cols.dias.length && Math.abs(sumaDias - totalHoras.valor) > 0.01) {
      avisos.push(`fila ${f + 1} (${nombreRaw}): la suma de días (${sumaDias.toFixed(2)}) no coincide con el total de horas (${totalHoras.valor})`)
    }
    if (payRate.valor !== null && otRate.valor !== null && impTotal.valor !== null) {
      const calc = horasReg * payRate.valor + horasOT * otRate.valor
      if (Math.abs(calc - impTotal.valor) > 0.05) avisos.push(`fila ${f + 1} (${nombreRaw}): horas × tarifas = $${calc.toFixed(2)} pero el importe del reporte es $${impTotal.valor.toFixed(2)}`)
    }

    const r2 = (x) => (x === null || x === undefined ? x : Math.round(x * 100) / 100)
    const nombreLimpio = limpiarNombrePersona(nombreRaw)
    filas.push({
      fila: f + 1,
      nombre: nombreLimpio,
      nombreNorm: normalizarNombre(nombreLimpio),
      estado: textoCelda(hoja, cols.estado, f),
      agencia: textoCelda(hoja, cols.agencia, f),
      posicionRaw: textoCelda(hoja, cols.posicion, f),
      posicion: mapearPosicion(textoCelda(hoja, cols.posicion, f), posMap),
      warehouse: textoCelda(hoja, cols.warehouse, f),
      tarifaGofoReg: r2(payRate.valor),
      tarifaGofoOT: r2(otRate.valor),
      dias: Object.fromEntries(Object.entries(dias).map(([k, v]) => [k, r2(v)])),
      horasTotal: r2(horasTot),
      horasOT: r2(horasOT),
      horasReg: r2(horasReg),
      importeGofoReg: r2(impReg.valor),
      importeGofoOT: r2(impOT.valor),
      importeGofo: r2(impTotal.valor),
    })

  }

  // Ajustes laterales (resúmenes U..X del ejemplo real): etiqueta con palabra
  // de ajuste/deducción y el VALOR 1-4 columnas a la derecha. Se capturan una
  // sola vez por celda, haya o no trabajador en esa fila.
  // La persona de un ajuste lateral solo es confiable si su NOMBRE aparece en
  // el texto (en el archivo real los resúmenes laterales caen sobre filas de
  // trabajadores ajenos: la posición de la fila NO identifica a nadie).
  const nombresFilas = [...new Map(filas.map((x) => [x.nombreNorm, x.nombre])).entries()]
  for (let f = enc.fila + 1; f <= f2; f++) {
    for (let c = (cols.importeTotal || 18) + 1; c <= c2; c++) {
      const etiqueta = textoCelda(hoja, c, f)
      if (!etiqueta || !RX_AJUSTE.test(etiqueta)) continue
      const v = valorCercano(hoja, f, c, c2)
      if (v !== null && Math.abs(v) > 0.004) {
        const aj = ajusteDesdeFila(etiqueta, v, nombre, f)
        // DEDUPLICACIÓN: si este lateral es el RESUMEN de los ajustes del
        // detalle (misma suma, por período o en total), se omite — nunca se
        // cuenta doble.
        const digitos = (x) => String(x || '').replace(/\D/g, '')
        const delDetalle = ajustes.filter((a) => a.tipo === 'fila')
        const sumaMismoPeriodo = aj.periodoOrigenTexto
          ? delDetalle.filter((a) => digitos(a.periodoOrigenTexto) === digitos(aj.periodoOrigenTexto)).reduce((s, a) => s + a.importe, 0)
          : null
        const sumaTodoDetalle = delDetalle.reduce((s, a) => s + a.importe, 0)
        if (Math.abs(v) > 0.05 && ((sumaMismoPeriodo !== null && Math.abs(sumaMismoPeriodo - v) <= 0.05) || (delDetalle.length > 0 && Math.abs(sumaTodoDetalle - v) <= 0.05))) {
          avisos.push(`resumen lateral "${aj.concepto}" omitido: su importe ($${v.toFixed(2)}) ya está en el detalle de ajustes`)
          continue
        }
        const etiquetaNorm = normalizarNombre(etiqueta)
        const persona = nombresFilas.find(([norm]) => norm.length > 4 && etiquetaNorm.includes(norm))
        ajustes.push(persona ? { ...aj, tipo: 'lateral', personaRaw: persona[1] } : { ...aj, tipo: 'lateral' })
      }
    }
  }

  if (!filas.length) motivos.push('la pestaña no tiene filas de trabajadores reconocibles')

  // ── totales + cruce con los controles del reporte ──
  const totHoras = filas.reduce((s, x) => s + (x.horasTotal || 0), 0)
  const totImporte = filas.reduce((s, x) => s + (x.importeGofo || 0), 0)
  // IMPORTANTE: los ajustes van POR SEPARADO; no se suman al detalle para no duplicar
  for (const ctl of controles) {
    if (ctl.importe !== null && Math.abs(ctl.importe - totImporte) > 0.05) {
      const conAjustes = totImporte + ajustes.reduce((s, a) => s + a.importe, 0)
      if (Math.abs(ctl.importe - conAjustes) <= 0.05) avisos.push(`el control de la fila ${ctl.fila} ($${ctl.importe.toFixed(2)}) coincide con detalle + ajustes; los ajustes se registran por separado`)
      else avisos.push(`el total de control de la fila ${ctl.fila} ($${ctl.importe.toFixed(2)}) difiere de la suma del detalle ($${totImporte.toFixed(2)})`)
    }
    if (ctl.horas !== null && Math.abs(ctl.horas - totHoras) > 0.05) avisos.push(`las horas de control de la fila ${ctl.fila} (${ctl.horas}) difieren de la suma del detalle (${totHoras.toFixed(2)})`)
  }

  const idPeriodo = inicio && fin ? `gofo_${inicio}_${fin}` : null
  const huella = hashContenido({ inicio, fin, filas: filas.map((x) => [x.nombreNorm, x.posicionRaw, x.agencia, x.warehouse, x.dias, x.horasTotal, x.horasOT, x.tarifaGofoReg, x.tarifaGofoOT, x.importeGofo]), ajustes: ajustes.map((a) => [a.concepto, a.importe]) })

  return {
    tipo: 'periodo',
    hoja: nombre,
    idPeriodo,
    inicio,
    fin,
    estado: motivos.length ? 'pendiente' : 'listo',
    motivos,
    avisos,
    filas,
    ajustes,
    controles,
    totales: {
      personas: new Set(filas.map((x) => x.nombreNorm)).size,
      filas: filas.length,
      horas: Math.round(totHoras * 100) / 100,
      horasOT: Math.round(filas.reduce((s, x) => s + (x.horasOT || 0), 0) * 100) / 100,
      ingresoGofo: Math.round(totImporte * 100) / 100,
      ajustes: Math.round(ajustes.reduce((s, a) => s + a.importe, 0) * 100) / 100,
    },
    agencias: [...new Set(filas.map((x) => x.agencia).filter(Boolean))],
    warehouses: [...new Set(filas.map((x) => x.warehouse).filter(Boolean))],
    posiciones: [...new Set(filas.map((x) => x.posicion).filter(Boolean))],
    huella,
  }
}

function buscarImporteEnFila(hoja, f, maxCol) {
  for (let c = maxCol; c >= 0; c--) {
    const v = valorNumerico(hoja, c, f)
    if (v.valor !== null && v.valor !== 0) return v.valor
  }
  return null
}
function ajusteDesdeFila(concepto, importe, hojaNombre, f) {
  // período original si el concepto lo menciona: "08.17-08.23", "08/17-08/23",
  // "0803-0809" o una fecha suelta "0806"
  const s = String(concepto)
  const m = s.match(/(\d{1,2}[._/]\d{1,2})\s*[-–—]\s*(\d{1,2}[._/]\d{1,2})/) || s.match(/\b(\d{4})\s*[-–—]\s*(\d{4})\b/)
  const m1 = !m && s.match(/\b(\d{4})\b/)
  return {
    concepto: s.trim(),
    importe: Math.round(importe * 100) / 100,
    periodoOrigenTexto: m ? `${m[1]}-${m[2]}` : (m1 ? m1[1] : null),
    origen: { hoja: hojaNombre, fila: f + 1 },
  }
}

// ── Hoja de ASISTENCIA (la provisional trae el ID del empleado 工号) ────────
// De aquí NUNCA se crean perfiles, horas ni pagos (es provisional): solo se
// extrae el mapa nombre → ID de empleado como fuente autorizada del ID, para
// que el dueño lo aplique a los perfiles EXISTENTES si quiere.
export function extraerAsistencia(hoja) {
  const { c2, f2 } = rangoHoja(hoja)
  if (c2 < 0) return null
  // fila de encabezados con columna de ID (工号 / employee id / worker id)
  for (let f = 0; f < Math.min(f2 + 1, 10); f++) {
    let cId = -1, cNombre = -1
    for (let c = 0; c <= c2; c++) {
      const t = textoCelda(hoja, c, f).toLowerCase()
      if (cId < 0 && (/工号/.test(t) || /(employee|worker|emp)\s*id/.test(t) || t === 'id')) cId = c
      if (cNombre < 0 && /(姓名|员工|name|nombre)/.test(t)) cNombre = c
    }
    if (cId < 0 || cNombre < 0) continue
    const ids = new Map()
    for (let ff = f + 1; ff <= f2; ff++) {
      const nombreRaw = limpiarNombrePersona(textoCelda(hoja, cNombre, ff))
      const id = textoCelda(hoja, cId, ff)
      if (!nombreRaw || !id) continue
      const norm = normalizarNombre(nombreRaw)
      const previo = ids.get(norm)
      if (previo && previo.idEmpleado !== id) previo.conflicto = true
      else if (!previo) ids.set(norm, { nombre: nombreRaw, nombreNorm: norm, idEmpleado: id })
    }
    if (ids.size) return [...ids.values()]
    return null
  }
  return null
}

// ── Análisis del LIBRO completo ────────────────────────────────────────────
export function analizarLibro(wb, opciones) {
  const periodos = []
  const omitidas = []
  const idsEmpleado = new Map()
  for (const nombre of wb.SheetNames) {
    const r = analizarHoja(wb.Sheets[nombre], nombre, opciones)
    if (r.tipo === 'omitida') {
      omitidas.push(r)
      // la hoja provisional suele ser el reporte de asistencia con el 工号
      const asis = extraerAsistencia(wb.Sheets[nombre])
      if (asis) for (const a of asis) if (!idsEmpleado.has(a.nombreNorm)) idsEmpleado.set(a.nombreNorm, { ...a, hoja: nombre })
    } else periodos.push(r)
  }
  // orden por fecha de inicio
  periodos.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))
  return { periodos, omitidas, idsEmpleado: [...idsEmpleado.values()] }
}
