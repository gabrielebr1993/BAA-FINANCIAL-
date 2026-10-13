// ============================================================================
// PRINT CHECK · Lógica pura (sin Firebase, 100% testeable).
//
// · numeroEnPalabras: importe → texto bancario en inglés ("ONE THOUSAND TWO
//   HUNDRED THIRTY-FOUR AND 56/100 DOLLARS"), como exige el cheque físico.
// · planearLote: a partir de los registros/ajustes de una semana importada y
//   de los cheques ya existentes, arma la lista de pagos netos por trabajador
//   y marca quién YA tiene un cheque activo (candado antiduplicados: nunca se
//   emite un segundo pago por la misma obligación).
// · asignarNumeros: numeración consecutiva desde la secuencia de la cuenta.
// ============================================================================

const UNIDADES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
const DECENAS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']
const GRUPOS = ['', ' THOUSAND', ' MILLION', ' BILLION']

function tresCifras(n) {
  let s = ''
  const c = Math.floor(n / 100)
  const r = n % 100
  if (c) s += UNIDADES[c] + ' HUNDRED'
  if (r) {
    if (s) s += ' '
    if (r < 20) s += UNIDADES[r]
    else s += DECENAS[Math.floor(r / 10)] + (r % 10 ? '-' + UNIDADES[r % 10] : '')
  }
  return s
}

// Importe en palabras para la línea escrita del cheque. null si no es válido.
export function numeroEnPalabras(importe) {
  const n = Number(importe)
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return null
  const entero = Math.floor(n + 1e-9)
  const centavos = Math.round((n - entero) * 100)
  let palabras = ''
  if (entero === 0) palabras = 'ZERO'
  else {
    const partes = []
    let resto = entero
    let g = 0
    while (resto > 0) {
      const tres = resto % 1000
      if (tres) partes.unshift(tresCifras(tres) + GRUPOS[g])
      resto = Math.floor(resto / 1000)
      g++
    }
    palabras = partes.join(' ')
  }
  return `${palabras} AND ${String(centavos).padStart(2, '0')}/100 DOLLARS`
}

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// ¿Este cheque (existente) cubre al trabajador en el período y sigue activo?
export function chequeActivoDe(cheque, workerId, periodoId) {
  if (!cheque || cheque.estado === 'cancelado') return false
  if (cheque.workerId !== workerId) return false
  return (cheque.distribucion || []).some((d) => d.periodoId === periodoId)
}

// Plan del lote: pagos netos por trabajador de UNA semana, con candado.
// registros: de wh_staff_registros del período · ajustes: del período ·
// cheques: todos los existentes (para dedupe) · workers: lista de perfiles.
export function planearLote({ periodoId, registros, ajustes, cheques, workers }) {
  const porWorker = {}
  for (const r of registros || []) {
    const k = r.workerId || r.nombreNorm
    porWorker[k] = porWorker[k] || { workerId: r.workerId || null, nombre: r.nombre, neto: 0, horas: 0, pendienteTarifa: false, detalle: [] }
    porWorker[k].neto += r.miPago || 0
    porWorker[k].horas += r.horasTotal || 0
    porWorker[k].pendienteTarifa = porWorker[k].pendienteTarifa || !!r.pendienteTarifa
    porWorker[k].detalle.push({ posicion: r.posicion, horas: r.horasTotal, pago: r.miPago })
  }
  for (const a of ajustes || []) {
    if (!a.workerId || a.estado === 'revision') continue
    if (porWorker[a.workerId]) {
      porWorker[a.workerId].neto += a.importe || 0
      porWorker[a.workerId].detalle.push({ posicion: `Ajuste: ${a.concepto}`, horas: null, pago: a.importe })
    }
  }
  const mapaW = Object.fromEntries((workers || []).map((w) => [w.id, w]))
  return Object.values(porWorker).map((x) => {
    const existente = (cheques || []).find((c) => chequeActivoDe(c, x.workerId, periodoId))
    const w = x.workerId ? mapaW[x.workerId] : null
    return {
      ...x,
      // el nombre del PERFIL manda (ya limpio de sufijos del archivo)
      nombre: (w && w.nombre) || x.nombre,
      neto: r2(x.neto),
      idEmpleado: w?.idEmpleado || null,
      yaTiene: existente ? (existente.numeroRaw || existente.numeroNorm) : null,
      elegible: !existente && !x.pendienteTarifa && r2(x.neto) > 0,
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre))
}

// Números consecutivos desde la secuencia de la cuenta.
export function asignarNumeros(seleccion, siguiente) {
  const inicio = Number(siguiente) || 1
  return (seleccion || []).map((x, i) => ({ ...x, numero: String(inicio + i) }))
}

// Línea MICR (aproximada con los símbolos ⑈ on-us y ⑆ transit; el cheque
// NEGOCIABLE requiere fuente E-13B y tóner magnético, o papel preimpreso).
export function lineaMICR({ numero, routing, cuenta }) {
  const num = String(numero || '').padStart(6, '0')
  return `⑈${num}⑈ ⑆${routing || ''}⑆ ${cuenta || ''}⑈`
}

// Enmascarar número de cuenta para la interfaz (solo últimos 4 visibles).
export function enmascarar(cuenta) {
  const s = String(cuenta || '')
  if (s.length <= 4) return s
  return '•••• ' + s.slice(-4)
}
