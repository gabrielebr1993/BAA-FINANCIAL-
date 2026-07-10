// Convierte un texto con cifras/símbolos a "texto hablable" (números y símbolos
// en PALABRAS) para que la voz (ElevenLabs / navegador) los pronuncie natural.
// Solo se usa para el AUDIO; en pantalla se sigue mostrando con $, %, comas.
// Maneja: moneda ($1,234.56), porcentajes (20.4%), decimales, miles y códigos
// alfanuméricos (DFW01-080). Español e inglés.

const ES_U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const ES_T = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const ES_C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']
const EN_U = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_T = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function es99(n) { if (n < 30) return ES_U[n]; const d = (n / 10) | 0, u = n % 10; return u ? ES_T[d] + ' y ' + ES_U[u] : ES_T[d] }
function es999(n) { if (n === 0) return ''; if (n === 100) return 'cien'; const c = (n / 100) | 0, r = n % 100; return ((c ? ES_C[c] : '') + (c && r ? ' ' : '') + (r ? es99(r) : '')).trim() }
function esNum(n) {
  n = Math.floor(Math.abs(n)); if (n === 0) return 'cero'
  const mill = (n / 1e6) | 0, mil = ((n % 1e6) / 1e3) | 0, r = n % 1000; const p = []
  if (mill) p.push(mill === 1 ? 'un millón' : esNum(mill) + ' millones')
  if (mil) p.push(mil === 1 ? 'mil' : es999(mil).replace(/uno$/, 'ún') + ' mil')
  if (r) p.push(es999(r))
  return p.join(' ').trim()
}
function en99(n) { if (n < 20) return EN_U[n]; const d = (n / 10) | 0, u = n % 10; return u ? EN_T[d] + '-' + EN_U[u] : EN_T[d] }
function en999(n) { if (n === 0) return ''; const c = (n / 100) | 0, r = n % 100; return ((c ? EN_U[c] + ' hundred' : '') + (c && r ? ' ' : '') + (r ? en99(r) : '')).trim() }
function enNum(n) {
  n = Math.floor(Math.abs(n)); if (n === 0) return 'zero'
  const mill = (n / 1e6) | 0, th = ((n % 1e6) / 1e3) | 0, r = n % 1000; const p = []
  if (mill) p.push(en999(mill) + ' million')
  if (th) p.push(en999(th) + ' thousand')
  if (r) p.push(en999(r))
  return p.join(' ').trim()
}

const intAPalabras = (n, es) => (es ? esNum(n) : enNum(n))
const DIG = (es) => (es ? ES_U.slice(0, 10) : EN_U.slice(0, 10))

// Número (posible decimal/miles) a palabras. Decimal → "punto/point" + dígitos.
function numAPalabras(str, es) {
  const clean = String(str).replace(/,/g, '')
  const [ip, dp] = clean.split('.')
  let w = intAPalabras(parseInt(ip || '0', 10), es)
  if (dp && dp.length) w += (es ? ' punto ' : ' point ') + dp.split('').map((d) => DIG(es)[+d]).join(' ')
  return w
}

export function aHablable(texto, idioma = 'es') {
  const es = !idioma || idioma.startsWith('es')
  let s = String(texto || '')

  // 1) Moneda: $1,234.56 → "... dólares con ... centavos"
  s = s.replace(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/g, (_m, intp, dec) => {
    const entero = parseInt(intp.replace(/,/g, ''), 10)
    const cents = dec ? parseInt(dec.padEnd(2, '0'), 10) : 0
    if (es) {
      let out = intAPalabras(entero, true) + (entero === 1 ? ' dólar' : ' dólares')
      if (cents) out += ' con ' + esNum(cents) + (cents === 1 ? ' centavo' : ' centavos')
      return out
    }
    let out = enNum(entero) + (entero === 1 ? ' dollar' : ' dollars')
    if (cents) out += ' and ' + enNum(cents) + (cents === 1 ? ' cent' : ' cents')
    return out
  })

  // 2) Porcentajes: 20.4% → "veinte punto cuatro por ciento"
  s = s.replace(/(\d+(?:[.,]\d+)?)\s?%/g, (_m, n) => numAPalabras(n.replace(',', '.'), es) + (es ? ' por ciento' : ' percent'))

  // 3) Códigos alfanuméricos: DFW01-080 → "DFW cero uno guion cero ocho cero"
  s = s.replace(/\b([A-Za-z]{2,})(\d[\w-]*)\b/g, (_m, letras, resto) => {
    const cola = resto.split('').map((ch) => /\d/.test(ch) ? DIG(es)[+ch] : ch === '-' ? (es ? 'guion' : 'dash') : ch).join(' ')
    return letras + ' ' + cola
  })

  // 4) Números con miles (1,234) y decimales (20.4) y enteros sueltos.
  s = s.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, (m) => numAPalabras(m, es))
  s = s.replace(/\b\d+\.\d+\b/g, (m) => numAPalabras(m, es))
  s = s.replace(/\b\d+\b/g, (m) => numAPalabras(m, es))

  return s
}
