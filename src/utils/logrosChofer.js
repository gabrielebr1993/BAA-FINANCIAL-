// ============================================================================
// Logros del chofer (gamificación): rachas sin claims, récords personales,
// hitos de paquetes, insignias y el reto de la semana.
// Se calcula SOLO con los datos del propio chofer (driverStats), en el cliente;
// no escribe nada en Firestore ni mira datos de otros choferes.
// ============================================================================

const HITOS = [250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]

const sinClaims = (w) => (Number(w?.claimsTotales) || 0) === 0 && (Number(w?.paquetes) || 0) > 0

// semanas: driverStats del chofer ordenadas DESC por fecha (la más reciente primero).
export function logrosChofer(semanas = [], calif = null) {
  const lista = (semanas || []).filter((w) => (Number(w?.paquetes) || 0) > 0)
  const asc = [...lista].reverse()

  // Racha ACTUAL: semanas seguidas sin claims, contando desde la más reciente.
  let racha = 0
  for (const w of lista) { if (sinClaims(w)) racha++; else break }

  // Mejor racha de toda la historia.
  let mejorRacha = 0, cur = 0
  for (const w of asc) { cur = sinClaims(w) ? cur + 1 : 0; mejorRacha = Math.max(mejorRacha, cur) }

  // Récord de paquetes en una semana y cuántas veces lo superó (récords nuevos).
  let mejorSemana = null, recordsRotos = 0
  for (const w of asc) {
    const p = Number(w.paquetes) || 0
    if (!mejorSemana || p > (Number(mejorSemana.paquetes) || 0)) { if (mejorSemana) recordsRotos++; mejorSemana = w }
  }
  const ultima = lista[0] || null
  const esRecord = !!(ultima && mejorSemana && ultima === mejorSemana && lista.length > 1)

  // Hitos de paquetes (acumulado).
  const totalPaquetes = lista.reduce((a, w) => a + (Number(w.paquetes) || 0), 0)
  const siguienteHito = HITOS.find((h) => h > totalPaquetes) || null
  const hitoAnterior = [...HITOS].reverse().find((h) => h <= totalPaquetes) || 0
  const progresoHito = siguienteHito ? (totalPaquetes - hitoAnterior) / (siguienteHito - hitoAnterior) : 1

  const semanasPerfectas = lista.filter(sinClaims).length
  const prog = (v, meta) => Math.max(0, Math.min(1, v / meta))

  // Insignias: `ganada` y `progreso` (0–1) para mostrar cuánto falta.
  const insignias = [
    { k: 'primera', icono: 'truck', titulo: 'Primera semana', desc: 'Completaste tu primera semana de entregas.', ganada: lista.length >= 1, progreso: prog(lista.length, 1) },
    { k: 'perfecta', icono: 'target', titulo: 'Semana perfecta', desc: 'Una semana completa sin claims.', ganada: semanasPerfectas >= 1, progreso: prog(semanasPerfectas, 1) },
    { k: 'racha4', icono: 'flame', titulo: 'En llamas', desc: '4 semanas seguidas sin claims.', ganada: mejorRacha >= 4, progreso: prog(mejorRacha, 4) },
    { k: 'racha8', icono: 'shield', titulo: 'Intocable', desc: '8 semanas seguidas sin claims.', ganada: mejorRacha >= 8, progreso: prog(mejorRacha, 8) },
    { k: 'mil', icono: 'package', titulo: '1,000 paquetes', desc: 'Llegaste a 1,000 paquetes entregados.', ganada: totalPaquetes >= 1000, progreso: prog(totalPaquetes, 1000) },
    { k: 'cincomil', icono: 'medal', titulo: '5,000 paquetes', desc: 'Llegaste a 5,000 paquetes entregados.', ganada: totalPaquetes >= 5000, progreso: prog(totalPaquetes, 5000) },
    { k: 'record', icono: 'trophy', titulo: 'Rompe récords', desc: 'Superaste tu mejor semana de paquetes.', ganada: recordsRotos >= 1, progreso: prog(recordsRotos, 1) },
    { k: 'constancia', icono: 'calendar', titulo: 'Constancia', desc: '12 semanas trabajadas.', ganada: lista.length >= 12, progreso: prog(lista.length, 12) },
    { k: 'estrellas', icono: 'star', titulo: '5 estrellas', desc: 'Calificación de 5 estrellas.', ganada: (Number(calif?.estrellas) || 0) >= 5, progreso: prog(Number(calif?.estrellas) || 0, 5) },
  ]

  // Reto de la semana: un objetivo claro y alcanzable.
  let reto
  if (racha > 0) reto = { titulo: `Llega a ${racha + 1} semanas seguidas sin claims`, desc: 'Termina esta semana sin claims para alargar tu racha.' }
  else if (siguienteHito && siguienteHito - totalPaquetes <= 400) reto = { titulo: `Te faltan ${(siguienteHito - totalPaquetes).toLocaleString('en-US')} paquetes para ${siguienteHito.toLocaleString('en-US')}`, desc: 'Estás muy cerca de tu próximo hito.' }
  else reto = { titulo: 'Haz una semana sin claims', desc: 'Empieza una racha nueva: cuida cada entrega y cada foto de entrega.' }

  return {
    racha, mejorRacha, semanasPerfectas, totalPaquetes, siguienteHito, hitoAnterior, progresoHito,
    mejorSemana, esRecord, recordsRotos, insignias,
    ganadas: insignias.filter((i) => i.ganada).length,
    reto,
  }
}
