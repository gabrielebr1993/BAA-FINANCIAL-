// BULK · Presencia de choferes (en línea / disponible) en `bulk_presence`.
// Un doc por chofer (id = uid). El chofer escribe la suya; el dispatcher la lee
// para emparejar y la actualiza al reservar/liberar. Los escritos se envuelven en
// try/catch para degradar sin romper si las reglas aún no están desplegadas.
import { crearConId, guardar } from './repo'

const ahora = () => new Date().toISOString()

// Marca al chofer EN LÍNEA (disponible) con el camión que maneja y los trabajos
// a los que está afiliado (para que solo le lleguen órdenes compatibles).
export async function conectar(tenantId, { uid, nombre, carrierId, carrierNombre, equipo, equipos, jobs }) {
  try {
    const lista = equipos && equipos.length ? equipos : (equipo ? [equipo] : [])
    await crearConId('presence', uid, tenantId, {
      uid, nombre: nombre || '', carrierId: carrierId || null, carrierNombre: carrierNombre || '',
      equipo: lista[0] || '', equipos: lista, jobs: jobs || [], enLinea: true, estado: 'libre', ordenId: null,
      desde: ahora(), heartbeat: ahora(),
    })
  } catch { /* reglas no desplegadas: degradar sin romper */ }
}

// Latido para mantener "viva" la presencia (el matcher descarta las obsoletas).
export async function latir(uid) { try { await guardar('presence', uid, { heartbeat: ahora() }) } catch { /* noop */ } }

// Reporta la ubicación EN VIVO del chofer mientras está en línea (aunque no tenga
// orden), para verlo en el Mapa en vivo. También sirve de latido.
export async function reportarUbicacion(uid, pos) {
  if (!pos || pos.lat == null) return latir(uid)
  try { await guardar('presence', uid, { lat: pos.lat, lng: pos.lng, posTs: ahora(), heartbeat: ahora() }) } catch { /* noop */ }
}

// Sale de línea (se desconecta manualmente o cierra la app).
export async function desconectar(uid) { try { await guardar('presence', uid, { enLinea: false, estado: 'offline', ordenId: null, heartbeat: ahora() }) } catch { /* noop */ } }

// Reserva: se le ofreció una orden; sigue en línea pero ya no se le empareja.
export async function reservar(uid, ordenId) { try { await guardar('presence', uid, { ordenId, estado: 'reservado', heartbeat: ahora() }) } catch { /* noop */ } }

// Ocupado: aceptó una orden; sale de la cola de disponibles hasta terminarla.
export async function ocupar(uid, ordenId) { try { await guardar('presence', uid, { ordenId, estado: 'ocupado', enLinea: true, heartbeat: ahora() }) } catch { /* noop */ } }

// Vuelve a la cola de disponibles, AL FINAL (desde = ahora) tras rechazo/timeout/entrega.
export async function liberar(uid) { try { await guardar('presence', uid, { ordenId: null, estado: 'libre', enLinea: true, desde: ahora(), heartbeat: ahora() }) } catch { /* noop */ } }
