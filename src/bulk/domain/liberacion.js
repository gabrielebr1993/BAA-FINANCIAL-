// ============================================================================
// BULK · Dominio · Liberación INTELIGENTE de carga (lógica pura, testeable).
// Reemplaza la dependencia del código de 4 dígitos por un motor de decisión por
// NIVELES DE CONFIANZA a partir de las evidencias de la entrega. No decide solo:
// el supervisor conserva la liberación manual; esto automatiza el caso seguro.
//
// Niveles: 'alta' (liberar auto), 'media' (pedir validación extra),
//          'baja' (bloquear y escalar), 'critico' (no liberar + alerta).
// Todo explicable: devuelve las señales evaluadas y las razones.
// ============================================================================

const n = (v) => (v == null || isNaN(Number(v)) ? null : Number(v))

// Código de liberación de 4 dígitos (ÚNICA fuente: lo usan el chofer al entregar,
// el staff al marcar 'entregada' a mano y el portal del supervisor al sanear
// órdenes entregadas que llegaron sin código).
export const nuevoCodigoLiberacion = () => String(Math.floor(1000 + Math.random() * 9000))

// Evalúa una orden ENTREGADA y decide el nivel de confianza para liberar.
// orden: { ticket?, pod?, pesoEstimado?, pesoReal?, gps_entrega? , ... }
// ctx: { dentroGeocercaEntrega?: boolean|null, tolerancia?: número (def 0.1) }
export function evaluarLiberacion(orden = {}, ctx = {}) {
  const tol = ctx.tolerancia != null ? ctx.tolerancia : 0.10
  const razones = []

  // — Señales —
  const ticketFoto = !!(orden.ticket && orden.ticket.foto)
  const pesoTicket = (orden.ticket && n(orden.ticket.peso) != null) || n(orden.pesoReal) != null
  const podFoto = !!(orden.pod && orden.pod.foto)
  const podFirma = !!(orden.pod && orden.pod.firma)
  const pod = podFoto && podFirma
  const geo = ctx.dentroGeocercaEntrega // true | false | null (desconocido)
  const gps = !!orden.gps_entrega

  // — Peso vs esperado (fuente de disputas y fraude) —
  const est = n(orden.pesoEstimado)
  const real = n(orden.pesoReal != null ? orden.pesoReal : (orden.ticket && orden.ticket.peso))
  let desviacion = null
  if (est && est > 0 && real != null) desviacion = Math.abs(real - est) / est
  const pesoEnTolerancia = desviacion == null ? null : desviacion <= tol
  const pesoCritico = desviacion != null && desviacion > Math.max(0.5, tol * 5)

  const señales = { ticketFoto, pesoTicket, pod, podFoto, podFirma, geocerca: geo, gps, desviacion, pesoEnTolerancia }

  // — Motor de decisión (reglas explícitas y ordenadas por severidad) —
  if (pesoCritico) {
    razones.push(`Peso muy fuera de lo esperado (${Math.round(desviacion * 100)}%)`)
    return { nivel: 'critico', señales, razones, requiere: ['revision_obligatoria'] }
  }
  if (!ticketFoto || !pod) {
    if (!ticketFoto) razones.push('Falta el ticket de báscula (foto)')
    if (!podFoto) razones.push('Falta la foto de entrega')
    if (!podFirma) razones.push('Falta la firma de entrega')
    return { nivel: 'baja', señales, razones, requiere: ['completar_evidencia', 'escalar'] }
  }
  if (pesoEnTolerancia === false) {
    razones.push(`Peso fuera de tolerancia (${Math.round(desviacion * 100)}% > ${Math.round(tol * 100)}%)`)
    return { nivel: 'media', señales, razones, requiere: ['excepcion_peso'] }
  }
  if (geo === false) {
    razones.push('La entrega no se registró dentro de la zona de destino')
    return { nivel: 'media', señales, razones, requiere: ['validacion_ubicacion'] }
  }
  if (geo == null || !gps) {
    razones.push(geo == null ? 'No hay geocerca de destino para validar la ubicación' : 'Sin GPS en la entrega')
    return { nivel: 'media', señales, razones, requiere: ['confirmacion_sitio'] }
  }
  // Todas las señales fuertes presentes.
  razones.push('Ticket, entrega, ubicación y peso consistentes')
  return { nivel: 'alta', señales, razones, requiere: [] }
}

// ¿Se puede liberar automáticamente? (solo confianza alta)
export function liberacionAutomatica(evaluacion) {
  return !!evaluacion && evaluacion.nivel === 'alta'
}

export const NIVEL_LABEL = {
  alta: 'Confianza alta',
  media: 'Confianza media',
  baja: 'Confianza baja',
  critico: 'Riesgo crítico',
}
