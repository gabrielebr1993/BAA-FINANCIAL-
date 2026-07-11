// "Asesor" del chofer: un consejo motivador basado en SUS números reales
// (claims vs. la semana pasada, paquetes, calificación, cercanía a un hito) con
// una frase de ánimo rotativa. Es estable por semana (no cambia en cada refresco).
// No usa IA de servidor: se calcula en el cliente a partir de sus propias métricas.

// Hash simple y estable de un texto (para elegir frase por semana sin aleatorio real).
function hash(s) {
  let h = 0
  const t = String(s || '')
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) & 0x7fffffff
  return h
}

const FRASES = [
  'Cada entrega cuenta. ¡Sigue rodando! 🚚',
  'La constancia es lo que te hace grande. 💪',
  'Un día a la vez, un paquete a la vez. 📦',
  'Tu esfuerzo se nota en los números. 🙌',
  'Hoy es un buen día para batir tu récord. 🔥',
  'Los mejores choferes se construyen semana a semana. ⭐',
  'Maneja seguro y termina fuerte. 🛣️',
  'Pequeñas mejoras, grandes resultados. 📈',
]

// semanas: driverStats del chofer ordenadas DESC por fecha. calif: calificación de la última.
export function consejoChofer(semanas = [], calif = null) {
  const u = semanas[0] || null
  const prev = semanas[1] || null
  if (!u) {
    return { titulo: '¡Bienvenido!', mensaje: 'Cuando tu empresa cargue tu primera semana, aquí verás tu desempeño y consejos para mejorar.', tono: 'neutro' }
  }

  const partes = []
  let tono = 'bien' // bien | ojo | neutro

  const c0 = Number(u.claimsTotales) || 0
  const c1 = prev ? Number(prev.claimsTotales) || 0 : null
  const p0 = Number(u.paquetes) || 0
  const p1 = prev ? Number(prev.paquetes) || 0 : null

  // Claims (lo más importante para su calificación y su pago).
  if (c0 === 0) {
    partes.push('¡Cero claims esta semana! Impecable. 🌟')
  } else if (c1 != null && c0 < c1) {
    partes.push(`Bajaste tus claims de ${c1} a ${c0} frente a la semana pasada. ¡Excelente, vas mejorando! 👏`)
  } else if (c1 != null && c0 > c1) {
    partes.push(`Esta semana tuviste ${c0} claims (antes ${c1}). Un poco más de cuidado y los bajas. 💪`)
    tono = 'ojo'
  } else {
    partes.push(`Llevas ${c0} claim${c0 === 1 ? '' : 's'} esta semana. Mantén el foco en entregar sin novedades.`)
  }

  // Paquetes / volumen.
  if (p1 != null && p0 > p1) partes.push(`Además entregaste ${p0} paquetes, más que los ${p1} de la semana anterior. 📦`)
  else if (p0 > 0) partes.push(`Entregaste ${p0} paquetes esta semana.`)

  // Hito por total acumulado de paquetes (le da una meta cercana).
  const totalPaq = semanas.reduce((a, w) => a + (Number(w.paquetes) || 0), 0)
  if (totalPaq > 0) {
    const paso = totalPaq < 500 ? 500 : 1000
    const siguiente = Math.ceil((totalPaq + 1) / paso) * paso
    const faltan = siguiente - totalPaq
    if (faltan > 0 && faltan <= Math.max(60, paso * 0.12)) {
      partes.push(`Estás a solo ${faltan} paquetes de llegar a ${siguiente.toLocaleString('es')} entregas en total. ¡Ya casi! 🎯`)
    }
  }

  // Calificación.
  if (calif) {
    if (calif.nivel === 'bueno') partes.push('Tu calificación está en verde: eres de los choferes más confiables. 🟢')
    else if (calif.nivel === 'regular') partes.push('Tu calificación va bien; cuidando los claims subes a verde. 🟡')
    else { partes.push('Enfócate en reducir claims para subir tu calificación. Tú puedes. 🔴'); tono = 'ojo' }
  }

  // Frase de ánimo estable por semana.
  partes.push(FRASES[hash(u.semana || u.fechaInicioISO) % FRASES.length])

  const titulo = tono === 'ojo' ? 'Tu asesor: vas por buen camino' : '¡Vas muy bien esta semana!'
  return { titulo, mensaje: partes.join(' '), tono }
}
