// ============================================================================
// Posición COMO PROPIEDAD DEL TRABAJADOR (independiente del archivo).
//
// Para pagar con el archivo de Homebase (que NO trae posiciones) o completar el
// de Gofo, cada persona toma su puesto del SISTEMA, en este orden:
//   1) worker.posicion  → puesto fijo del perfil (lo más explícito; lo pones tú
//      en el perfil o al clasificar en la vista previa).
//   2) última posición de su HISTORIAL de registros (la más reciente con puesto).
//   3) nada → "sin clasificar" (lo clasificas en la vista previa antes de pagar).
// ============================================================================
import { normalizarNombre } from './parserGofo'
import { resolverWorker } from './datosStaff'

// { workerId → posicion } y { nombreNorm → posicion } con la posición MÁS
// RECIENTE (por fecha fin) de cada trabajador en su historial de registros.
export function mapaUltimaPosicion(registros) {
  const porId = {}
  const porNorm = {}
  const finDe = {}
  for (const r of registros || []) {
    const pos = (r.posicion || '').trim()
    if (!pos) continue
    const fin = r.fin || r.inicio || ''
    const kId = r.workerId || null
    const kN = r.nombreNorm || normalizarNombre(r.nombre)
    if (kId && (!finDe['id:' + kId] || fin >= finDe['id:' + kId])) { porId[kId] = pos; finDe['id:' + kId] = fin }
    if (kN && (!finDe['n:' + kN] || fin >= finDe['n:' + kN])) { porNorm[kN] = pos; finDe['n:' + kN] = fin }
  }
  return { porId, porNorm }
}

// Posición vigente de un trabajador: perfil → historial → ''.
export function posicionDeTrabajador(worker, ultima) {
  if (worker && worker.posicion) return worker.posicion
  if (worker && ultima) {
    if (ultima.porId && ultima.porId[worker.id]) return ultima.porId[worker.id]
    if (ultima.porNorm && ultima.porNorm[worker.nombreNorm]) return ultima.porNorm[worker.nombreNorm]
  }
  return ''
}

// Convierte las personas de Homebase en FILAS listas para calcularPagos,
// asignando la posición desde el sistema y marcando nuevos / posibles duplicados.
// personas: salida de parsearHomebase · workers: lista de perfiles
// ultima: mapaUltimaPosicion(registros)
// Devuelve [{ nombre, nombreNorm, posicion, posicionRaw:'', posicionFuente,
//   dias, horasTotal, horasReg, horasOT, warehouse, agencia, fila, wageHomebase,
//   workerId, nuevo, posibleDuplicadoDe, nombreDuplicado }]
export function resolverFilasHomebase(personas, workers, ultima) {
  const lista = workers || []
  return (personas || []).map((p, i) => {
    const res = resolverWorker(p.nombre, lista)
    const worker = res.nuevo ? null : lista.find((w) => w.id === res.id)
    const posicion = worker ? posicionDeTrabajador(worker, ultima) : ''
    const fuente = worker && worker.posicion ? 'perfil' : (posicion ? 'historial' : '')
    const dup = res.posibleDuplicadoDe ? lista.find((w) => w.id === res.posibleDuplicadoDe) : null
    return {
      nombre: p.nombre,
      nombreNorm: p.nombreNorm,
      posicion,
      posicionRaw: '',
      posicionFuente: fuente,
      dias: p.dias || {},
      horasTotal: p.horasTotal || 0,
      horasReg: p.horasTotal || 0, // OT lo decide MI regla en calcularPagos
      horasOT: 0,
      warehouse: '',
      agencia: '',
      fila: p.fila != null ? p.fila : i,
      wageHomebase: p.wage || null,
      roleArchivo: p.roleArchivo || '',
      workerId: worker ? worker.id : res.id,
      nuevo: !!res.nuevo,
      posibleDuplicadoDe: res.posibleDuplicadoDe || null,
      nombreDuplicado: dup ? dup.nombre : null,
    }
  })
}
