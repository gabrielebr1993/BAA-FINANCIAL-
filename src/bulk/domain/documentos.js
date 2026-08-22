// ============================================================================
// BULK · Dominio · Documentos (facturas y material tickets). Lógica PURA.
// Normaliza los datos que muestran los documentos formales, reutilizando lo que ya
// existe en las órdenes/jobs/plantas/carriers/materiales (deriva) y permitiendo
// overrides por campos propios de la orden (supplier, camión, origen).
// NO recalcula montos: usa los que ya trae la factura/estado de cuenta.
// ============================================================================

// Prefijos de numeración correlativa por empresa.
export const PREFIJO = { factura: 'F', pago: 'EC', ticketCarga: 'TC', ticketEntrega: 'TE' }

// "CÓDIGO · Nombre" de un job a partir de su id.
export function jobLabel(jobId, jobsMap = {}) {
  const j = jobsMap[jobId]
  if (!j) return jobId ? String(jobId) : ''
  return `${j.codigo || ''}${j.nombre ? ` · ${j.nombre}` : ''}`.trim()
}

const primeraFecha = (...vals) => vals.find((v) => !!v) || null
// Ciudad aproximada a partir de una dirección "calle, ciudad, estado".
const ciudadDeDireccion = (dir) => {
  const p = String(dir || '').split(',').map((s) => s.trim()).filter(Boolean)
  return p.length >= 2 ? p[p.length - 2] : (p[0] || '')
}

// Campos ESTÁNDAR de un material ticket (etiquetas en inglés, estándar del sector).
// evento: 'Loaded' (carga en planta) | 'Received' (entrega/recepción en obra).
export function datosTicket(orden, evento, { jobsMap = {}, plantasMap = {}, carriersMap = {}, materialesMap = {} } = {}) {
  const job = jobsMap[orden?.jobId] || null
  const planta = plantasMap[orden?.plantaId] || null
  const carrier = carriersMap[orden?.transportistaId] || null
  const mat = materialesMap[(orden?.material || '').trim().toLowerCase()] || null
  const carga = evento === 'Loaded'
  const date = carga
    ? primeraFecha(orden?.hitos?.salidaPlanta, orden?.hitos?.tomada, orden?.hitos?.llegadaPlanta)
    : primeraFecha(orden?.hitos?.entrega, orden?.hitos?.llegadaDestino)
  return {
    ticketNumber: carga ? (orden?.ticketCarga || '') : (orden?.ticketEntrega || ''),
    ordenNumero: orden?.numero || '',
    jobLabel: jobLabel(orden?.jobId, jobsMap),
    date,
    event: evento,
    supplier: orden?.supplier || planta?.supplier || planta?.nombre || '',
    material: orden?.material || '',
    origin: orden?.origen || planta?.ciudad || ciudadDeDireccion(planta?.direccion) || '',
    batchPlant: planta?.nombre || '',
    quantity: orden?.pesoReal ?? orden?.pesoEstimado ?? 0,
    unit: orden?.unidad || mat?.unidad || 'Tons',
    carrier: carrier?.nombre || orden?.transportistaNombre || '',
    truck: orden?.camion || orden?.truck || '',
    // Extra para la plantilla:
    origen: planta?.nombre || '',
    destino: orden?.direccionEntrega || job?.destino || '',
    choferNombre: orden?.choferNombre || '',
    po: orden?.po || job?.po || '',
  }
}

// Columnas de la tabla de tickets (para reportes/exportación).
export const COLUMNAS_TICKET = [
  { key: 'ticketNumber', label: 'Ticket Number' },
  { key: 'jobLabel', label: 'Job' },
  { key: 'date', label: 'Date' },
  { key: 'event', label: 'Event' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'material', label: 'Material' },
  { key: 'origin', label: 'Origin' },
  { key: 'batchPlant', label: 'Batch Plant Location' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unit', label: 'Unit' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'truck', label: 'Truck #' },
]
