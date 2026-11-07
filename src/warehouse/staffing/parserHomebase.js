// ============================================================================
// PARSER del timesheet de HOMEBASE (PDF) para Warehouse / Staffing.
//
// LÓGICA PURA (sin pdfjs): recibe las LÍNEAS de texto ya extraídas del PDF y
// devuelve el período y las personas con sus horas. La extracción del PDF en el
// navegador vive en ./pdfHomebase.js; así esta lógica se puede probar en Node.
//
// Formato real (Homebase "Staff 401/800"):
//   Encabezado:  "Staff 401 / 800 Mon Oct 26 - Sun Nov 1, 2026"
//   Columnas:    Date · Role · Wage rate · Time card · Scheduled · Actual vs. ·
//                Total paid hours · Regular · Unpaid breaks · OT · Est. wages · Tips
//   Por persona: una línea con el NOMBRE, luego filas diarias, luego
//                "Totals for <Nombre>  …números…".
//
// Observaciones del archivo real (importan para el cálculo):
//   · El rol casi siempre es vacío o "General Labor" → NO sirve como posición.
//     La posición se toma del SISTEMA (perfil/historial), no del archivo.
//   · OT siempre viene 0.00 → el reparto regular/OT lo hace MI regla (semanal),
//     nunca el archivo. Por eso guardo horasOT=0 y dejo que calcularPagos decida.
//   · "Total paid hours" es la columna que uso como horas de la persona.
// ============================================================================
import { normalizarNombre } from './parserGofo'

const DIAS_ABBR = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
const MESES = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

// Token que es un número con 1-2 decimales (horas). Excluye fechas (26), horas
// de reloj (6:56) y montos con $ ("$15.00/hr", "$1,006.65").
function esNumHoras(tok) { return /^[\d,]+\.\d{1,2}$/.test(tok) && !tok.includes(':') }
function aNum(tok) { return Number(String(tok).replace(/,/g, '')) }

// Números de horas (###.##) de una línea, en orden. Ignora $ y horas de reloj.
function numerosDe(tokens) {
  return tokens.filter((t) => !t.startsWith('$') && !/\//.test(t) && esNumHoras(t)).map(aNum)
}

// ¿La línea es un encabezado de tabla o del reporte (no datos de persona)?
function esEncabezado(ln) {
  const s = ln.trim()
  if (!s) return true
  if (/^Staff\b/i.test(s)) return true
  if (/^Date\b/i.test(s)) return true
  // segunda fila del encabezado ("rate ... hours scheduled ... breaks hours ...")
  if (/^(rate|hours|scheduled|breaks)\b/i.test(s) && !DIAS_ABBR.has(s.split(/\s+/)[0])) return true
  if (/Estimated\s+Cash/i.test(s)) return true
  if (/Total paid\s+Regular/i.test(s)) return true
  return false
}

// Extrae inicio/fin/año del encabezado "… Mon Oct 26 - Sun Nov 1, 2026".
export function periodoDeEncabezado(lineas) {
  for (const ln of lineas) {
    const m = ln.match(/\b[A-Z][a-z]{2}\s+([A-Z][a-z]{2})\s+(\d{1,2})\s*[-–—]\s*[A-Z][a-z]{2}\s+([A-Z][a-z]{2})\s+(\d{1,2}),?\s*(\d{4})/)
    if (m && MESES[m[1]] && MESES[m[3]]) {
      const mesI = MESES[m[1]], diaI = String(m[2]).padStart(2, '0')
      const mesF = MESES[m[3]], diaF = String(m[4]).padStart(2, '0')
      const anioF = m[5]
      // si el período cruza de diciembre a enero, el inicio es del año anterior
      const anioI = Number(mesI) > Number(mesF) ? String(Number(anioF) - 1) : anioF
      return { inicio: `${anioI}-${mesI}-${diaI}`, fin: `${anioF}-${mesF}-${diaF}`, anioInicio: anioI, anioFin: anioF, titulo: ln.trim() }
    }
  }
  return null
}

// ISO de una fila diaria "Mon Oct 26" dado el período (para elegir el año).
function fechaDiaISO(mesAbbr, dia, periodo) {
  const mes = MESES[mesAbbr]
  if (!mes) return null
  const anio = periodo ? (mes === periodo.fin.slice(5, 7) ? periodo.anioFin : periodo.anioInicio) : new Date().getFullYear()
  return `${anio}-${mes}-${String(dia).padStart(2, '0')}`
}

// Parser principal: líneas → { periodo, personas[], avisos[] }.
// personas: { nombre, nombreNorm, horasTotal, horasReg, horasOT, dias:{iso:h},
//             wage, roleArchivo, fila }
export function parsearHomebase(lineas) {
  const periodo = periodoDeEncabezado(lineas)
  const personas = []
  const avisos = []
  let actual = null
  let nFila = 0

  const cerrar = () => {
    if (!actual) return
    // horas de la persona: preferimos el total del archivo; si no, suma de días
    const sumaDias = Object.values(actual.dias).reduce((a, b) => a + b, 0)
    if (actual.horasTotal == null) actual.horasTotal = Math.round(sumaDias * 100) / 100
    else if (Math.abs(actual.horasTotal - sumaDias) > 0.05 && sumaDias > 0) {
      avisos.push(`${actual.nombre}: el total del archivo (${actual.horasTotal} h) no cuadra con la suma de días (${Math.round(sumaDias * 100) / 100} h).`)
    }
    // OT del archivo es 0: lo deja decidir MI regla en calcularPagos
    actual.horasReg = actual.horasTotal
    actual.horasOT = 0
    personas.push(actual)
    actual = null
  }

  // Máquina de estados que respeta la estructura real del archivo:
  //   NOMBRE → filas de días → "Totals for NOMBRE".
  // · Solo se ABRE una persona cuando una fila de día confirma el nombre
  //   pendiente. Así el ruido entre medio (cola de rol "Operator" de un turno
  //   de máquina, encabezados repetidos) NUNCA se toma como persona.
  // · El nombre se toma de la LÍNEA DE NOMBRE (completa), no del "Totals for"
  //   (que a veces se trunca al partirse en dos líneas). El "Totals" solo da
  //   las horas. Las colas sueltas ("Hernández", "Rivas") y el gran total del
  //   reporte ("Totals") quedan como candidatos que nunca confirma un día → se
  //   descartan (el último candidato antes de una fila de día es el que gana).
  let pendiente = null
  for (const raw of lineas) {
    const ln = (raw || '').trim()
    if (esEncabezado(ln)) continue
    const tokens = ln.split(/\s+/).filter(Boolean)
    if (!tokens.length) continue

    // ── fila de TOTALES: cierra la persona abierta y toma sus horas
    if (/^Totals for\b/i.test(ln)) {
      const partes = ln.replace(/^Totals for\s+/i, '').split(/\s+/)
      const nums = numerosDe(partes)
      // columnas: [scheduled, actual, totalPaid, regular, unpaidBreaks, OT]
      const totalPaid = nums.length >= 3 ? nums[2] : (nums.length ? nums[nums.length - 1] : null)
      if (actual) {
        if (totalPaid != null) actual.horasTotal = totalPaid
        cerrar()
      }
      pendiente = null
      continue
    }

    // ── fila DIARIA: empieza con día de la semana (Mon, Tue, …)
    if (DIAS_ABBR.has(tokens[0])) {
      if (!actual && pendiente) { // el día confirma al candidato como persona
        nFila++
        actual = { nombre: pendiente, nombreNorm: normalizarNombre(pendiente), dias: {}, wage: null, roleArchivo: '', fila: nFila }
        pendiente = null
      }
      if (!actual) continue // día suelto sin nombre: se ignora
      const mesAbbr = tokens[1], dia = tokens[2]
      const wageTok = tokens.find((t) => /^\$[\d.,]+\/hr$/i.test(t))
      if (wageTok && actual.wage == null) actual.wage = Number(wageTok.replace(/[^\d.]/g, '')) || null
      // rol = palabras entre la fecha y la tarifa (p. ej. "General Labor")
      if (!actual.roleArchivo && wageTok) {
        const rol = tokens.slice(3, tokens.indexOf(wageTok)).join(' ').trim()
        if (rol) actual.roleArchivo = rol
      }
      const nums = numerosDe(tokens)
      const horasDia = nums.length >= 3 ? nums[2] : (nums.length ? nums[nums.length - 1] : 0)
      const iso = fechaDiaISO(mesAbbr, dia, periodo)
      if (iso && horasDia > 0) actual.dias[iso] = Math.round(((actual.dias[iso] || 0) + horasDia) * 100) / 100
      continue
    }

    // ── línea de NOMBRE candidata: SOLO cuenta si NO estamos dentro de una
    // persona (si lo estamos, es ruido: cola de rol como "Operator").
    const esFragmento = /^(am|pm)$/i.test(ln) || /^[-–—]/.test(ln) || !/\p{L}{2,}/u.test(ln)
    if (!actual && !numerosDe(tokens).length && !tokens.some((t) => t.startsWith('$')) && !esFragmento) {
      pendiente = ln // el último candidato antes de la fila diaria gana (descarta colas)
    }
  }
  cerrar()

  // Descartar fragmentos: colas de nombres largos cuyo "Totals for" se partió en
  // dos líneas (ej. "…Mantilla" + "Hernández") y el gran total del reporte
  // ("Totals"). Una persona real SIEMPRE tiene al menos un día con horas.
  const reales = personas.filter((p) => Object.keys(p.dias).length > 0 || (p.horasTotal || 0) > 0)

  // de-duplicar: una misma persona no debería aparecer dos veces; si pasa, se suma
  const porNorm = {}
  for (const p of reales) {
    if (porNorm[p.nombreNorm]) {
      const q = porNorm[p.nombreNorm]
      q.horasTotal = Math.round((q.horasTotal + p.horasTotal) * 100) / 100
      q.horasReg = q.horasTotal
      Object.assign(q.dias, p.dias)
    } else porNorm[p.nombreNorm] = p
  }
  return { periodo, personas: Object.values(porNorm), avisos }
}
