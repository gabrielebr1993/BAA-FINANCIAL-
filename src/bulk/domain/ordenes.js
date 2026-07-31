// ============================================================================
// BULK · Dominio · Órdenes (lógica pura, sin dependencias de UI ni Firestore)
// ============================================================================
import { MAX_TON_POR_VIAJE } from './constants'

// Divide una cantidad total de material en viajes individuales que NUNCA superan
// `maxPorViaje` toneladas. Devuelve un arreglo con el peso estimado de cada viaje.
//   dividirEnViajes(500)      -> [25, 25, ... 20 veces]
//   dividirEnViajes(510)      -> [25 ×20, 10]
//   dividirEnViajes(24)       -> [24]
//   dividirEnViajes(0)        -> []
export function dividirEnViajes(totalTon, maxPorViaje = MAX_TON_POR_VIAJE) {
  const total = Math.max(0, Number(totalTon) || 0)
  const max = Math.max(0.0001, Number(maxPorViaje) || MAX_TON_POR_VIAJE)
  if (total <= 0) return []
  const viajes = []
  let restante = total
  // Redondeo a 2 decimales para evitar arrastre de flotantes.
  const r2 = (n) => Math.round(n * 100) / 100
  while (restante > 0.00001) {
    const peso = restante >= max ? max : r2(restante)
    viajes.push(r2(peso))
    restante = r2(restante - peso)
  }
  return viajes
}

// Cuántos viajes hacen falta para una cantidad (sin construir el arreglo).
export function contarViajes(totalTon, maxPorViaje = MAX_TON_POR_VIAJE) {
  const total = Math.max(0, Number(totalTon) || 0)
  const max = Math.max(0.0001, Number(maxPorViaje) || MAX_TON_POR_VIAJE)
  return Math.ceil(total / max)
}

// ¿El transportista puede tomar una orden que exige `tipoEquipoReq`?
// `equiposDelTransportista` = arreglo de tipos de equipo que registró disponibles.
// La compatibilidad es OBLIGATORIA: si no coincide, jamás se le puede asignar.
export function transportistaCompatible(equiposDelTransportista, tipoEquipoReq) {
  if (!tipoEquipoReq) return true // orden sin requisito de equipo → cualquiera
  const lista = (equiposDelTransportista || []).map((e) => String(e).trim().toLowerCase())
  return lista.includes(String(tipoEquipoReq).trim().toLowerCase())
}

// Filtra una lista de transportistas dejando SOLO los compatibles con el equipo
// requerido. Se usa igual para asignación manual y automática.
export function transportistasCompatibles(transportistas, tipoEquipoReq) {
  return (transportistas || []).filter((t) => transportistaCompatible(t.equipos, tipoEquipoReq))
}

// Transportistas ELEGIBLES para una orden de cierto trabajo: compatibles por
// equipo Y autorizados en el trabajo. `autorizados` = job.transportistasAutorizados
// (arreglo de ids). Si el trabajo no tiene lista (vacía/indefinida) se cae a la
// compatibilidad por equipo — así los trabajos viejos siguen funcionando.
export function transportistasElegibles(transportistas, tipoEquipoReq, autorizados) {
  const compat = transportistasCompatibles(transportistas, tipoEquipoReq)
  const permitidos = Array.isArray(autorizados) && autorizados.length ? autorizados : null
  return permitidos ? compat.filter((c) => permitidos.includes(c.id)) : compat
}

// ¿Este transportista puede recibir órdenes de este trabajo? (equipo + autorización)
export function transportistaElegible(carrier, tipoEquipoReq, autorizados) {
  if (!carrier) return false
  if (!transportistaCompatible(carrier.equipos, tipoEquipoReq)) return false
  const permitidos = Array.isArray(autorizados) && autorizados.length ? autorizados : null
  return permitidos ? permitidos.includes(carrier.id) : true
}

// Genera los objetos-orden base a partir de un Job y una cantidad solicitada.
// NO escribe en base de datos: solo arma la estructura para que la capa de datos
// la persista. `seq` permite continuar la numeración de un job existente.
export function generarOrdenesDeJob(job, cantidadTon, opts = {}) {
  const max = opts.maxPorViaje || MAX_TON_POR_VIAJE
  const inicio = opts.seqInicial || 1
  const pesos = dividirEnViajes(cantidadTon, max)
  return pesos.map((peso, i) => ({
    numero: `${job.codigo || 'JOB'}-${String(inicio + i).padStart(4, '0')}`,
    jobId: job.id,
    clienteId: job.clienteId,
    plantaId: job.plantaId,
    // Dirección de entrega (lo que ve el chofer) y PO, heredados del trabajo.
    direccionEntrega: job.destino || '',
    po: job.po || '',
    material: opts.material || (job.materiales || [])[0] || '',
    // El equipo requerido sale del MATERIAL (opts.tipoEquipo) si está definido;
    // si no, cae al equipo del trabajo. Así una orden de grava exige End Dump, etc.
    tipoEquipo: opts.tipoEquipo || job.tipoEquipo || '',
    pesoEstimado: peso,
    pesoReal: null,
    transportistaId: null,
    choferId: null,
    estado: 'creada',
    // niveles de pago (se completan con el motor de tarifas / asignación)
    precioCliente: opts.precioCliente ?? null,
    precioTransportista: opts.precioTransportista ?? null,
    pagoChofer: opts.pagoChofer ?? null,
  }))
}
