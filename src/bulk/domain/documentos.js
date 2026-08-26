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
// hh:mm de un timestamp ISO (para Time In / Time Out de báscula).
const horaCorta = (ts) => { if (!ts) return ''; try { return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) } catch { return '' } }
// Diferencia mm:ss→"hh:mm" entre dos ISO (Total en báscula), o ''.
const duracion = (a, b) => {
  if (!a || !b) return ''
  const ms = new Date(b).getTime() - new Date(a).getTime()
  if (!(ms > 0)) return ''
  const min = Math.floor(ms / 60000)
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
const r2n = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 100) / 100)
// Toneladas ↔ libras (short ton = 2,000 lb, estándar del sector en EE. UU.).
const aLbs = (tons) => (tons == null ? null : Math.round(tons * 2000))

export function datosTicket(orden, evento, { jobsMap = {}, plantasMap = {}, carriersMap = {}, materialesMap = {}, clientesMap = {}, ordenesJob = null } = {}) {
  const job = jobsMap[orden?.jobId] || null
  const planta = plantasMap[orden?.plantaId] || null
  const carrier = carriersMap[orden?.transportistaId] || null
  const cliente = clientesMap[orden?.clienteId] || null
  const mat = materialesMap[(orden?.material || '').trim().toLowerCase()] || null
  const carga = evento === 'Loaded'
  const date = carga
    ? primeraFecha(orden?.hitos?.salidaPlanta, orden?.hitos?.tomada, orden?.hitos?.llegadaPlanta)
    : primeraFecha(orden?.hitos?.entrega, orden?.hitos?.llegadaDestino)
  // Time In / Time Out de báscula: en carga, llegada→salida de planta; en
  // entrega, llegada a destino→entrega confirmada.
  const tIn = carga ? orden?.hitos?.llegadaPlanta : orden?.hitos?.llegadaDestino
  const tOut = carga ? orden?.hitos?.salidaPlanta : orden?.hitos?.entrega
  // Peso: Gross/Tare del ticket de báscula (OCR) si se capturaron; Net = peso real.
  const netT = r2n(orden?.pesoReal ?? orden?.pesoEstimado)
  const grossT = r2n(orden?.pesoBruto)
  const tareT = r2n(orden?.tara ?? (grossT != null && netT != null ? grossT - netT : null))
  // Control del pedido (Ordered → Received): job.cantidadTon como total pedido y
  // la suma de pesos reales de las órdenes ENTREGADAS del job (si el llamador
  // puede verlas todas; si no, el bloque se omite y queda el del snapshot staff).
  let pedido = null
  if (Array.isArray(ordenesJob) && orden?.jobId) {
    const delJob = ordenesJob.filter((o) => o.jobId === orden.jobId)
    const hechas = delJob.filter((o) => ['entregada', 'liberada', 'cerrada'].includes(o.estado))
    const received = r2n(hechas.reduce((a, o) => a + (Number(o.pesoReal ?? o.pesoEstimado) || 0), 0)) || 0
    const ordered = r2n(job?.cantidadTon) || r2n(delJob.reduce((a, o) => a + (Number(o.pesoEstimado) || 0), 0)) || null
    pedido = { ordered, received, remaining: ordered != null ? r2n(Math.max(0, ordered - received)) : null, loads: hechas.length }
  }
  return {
    // Identificación y tiempos
    ticketNumber: carga ? (orden?.ticketCarga || '') : (orden?.ticketEntrega || ''),
    ordenNumero: orden?.numero || '',
    jobLabel: jobLabel(orden?.jobId, jobsMap),
    date,
    event: evento,
    timeIn: horaCorta(tIn), timeOut: horaCorta(tOut), timeTotal: duracion(tIn, tOut),
    po: orden?.po || job?.po || '',
    // Cadena de 3 partes
    supplier: orden?.supplier || planta?.supplier || planta?.nombre || '',
    customer: cliente?.nombre || orden?.clienteNombre || '',
    deliveryTo: orden?.direccionEntrega || job?.destino || '',
    // Material y transporte
    material: orden?.material || '',
    origin: orden?.origen || planta?.ciudad || ciudadDeDireccion(planta?.direccion) || '',
    batchPlant: planta?.nombre || '',
    quantity: netT ?? 0,
    unit: orden?.unidad || mat?.unidad || 'Tons',
    carrier: carrier?.nombre || orden?.transportistaNombre || '',
    truck: orden?.camion || orden?.truck || orden?.placa || '',
    license: orden?.licencia || '',
    weighmaster: orden?.weighmaster || (carga ? (orden?.liberadaPor || '') : ''),
    salesStatus: orden?.salesStatus || '',
    // Peso (tabla Gross/Tare/Net en lb y tons)
    pesos: { grossT, tareT, netT, grossLb: aLbs(grossT), tareLb: aLbs(tareT), netLb: aLbs(netT) },
    // Control del pedido
    pedido,
    // Firma
    receivedBy: carga ? (orden?.liberadaPor || '') : (orden?.pod?.firmante || orden?.choferNombre || ''),
    firmaImg: !carga ? (orden?.pod?.firma || null) : null,
    // Extra para la plantilla:
    origen: planta?.nombre || '',
    destino: orden?.direccionEntrega || job?.destino || '',
    choferNombre: orden?.choferNombre || '',
  }
}

// Columnas de la tabla de tickets (para reportes/exportación).
export const COLUMNAS_TICKET = [
  { key: 'ticketNumber', label: 'Ticket / BOL' },
  { key: 'jobLabel', label: 'Job' },
  { key: 'date', label: 'Date' },
  { key: 'event', label: 'Event' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'customer', label: 'Customer' },
  { key: 'deliveryTo', label: 'Delivery To' },
  { key: 'material', label: 'Material' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'truck', label: 'Truck #' },
  { key: 'netTons', label: 'Net (Tons)' },
  { key: 'loads', label: 'Loads' },
]
// Fila de exportación/reportes a partir de un `datosTicket()`.
export function filaTicket(d) {
  return {
    ticketNumber: d.ticketNumber || d.ordenNumero, jobLabel: d.jobLabel, date: d.date, event: d.event,
    supplier: d.supplier, customer: d.customer, deliveryTo: d.deliveryTo, material: d.material,
    carrier: d.carrier, truck: d.truck, netTons: d.pesos?.netT ?? d.quantity, loads: d.pedido?.loads ?? '',
  }
}
