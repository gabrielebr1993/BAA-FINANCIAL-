// ============================================================================
// BULK · Asignación / transferencia MANUAL de una orden a un chofer concreto.
// El dispatcher elige a quién dársela (aunque el motor automático no lo haya
// emparejado). Se OFRECE igual que una asignación automática: el chofer recibe
// push + pantalla de aceptación y confirma. Si la orden ya tenía chofer, se
// libera al anterior (transferencia). Todo queda en auditoría.
// ============================================================================
import { guardar } from './repo'
import { reservar, liberar } from './presencia'
import { asignarPagos } from './ordenPagos'
import { enviarPush } from '../integraciones/notificaciones'
import { ORDEN_ESTADO as E } from '../domain/constants'
import { auditar } from './auditoria'

const iso = () => new Date().toISOString()

// chofer: { uid?, id?, nombre, carrierId? }. Usa uid si existe (para que le llegue
// la pantalla de oferta); si no, cae al id del roster (su app la reconoce por
// nombre/roster y muestra la pantalla de aceptar igual). opts.pagoChofer fija el
// pago del chofer para esta carga (según la config del transportista).
export async function asignarOrdenManual(tenantId, orden, chofer, ctx = {}, opts = {}) {
  const choferId = chofer.uid || chofer.id
  if (!choferId) throw new Error('Chofer sin identificador')
  const prev = orden.choferId

  // Transferencia: suelta al chofer anterior (si lo había y es distinto).
  if (prev && prev !== choferId) { try { await liberar(prev) } catch { /* noop */ } }

  await guardar('orders', orden.id, {
    estado: E.NOTIFICANDO,
    transportistaId: chofer.carrierId || orden.transportistaId || null,
    choferId,
    choferNombre: chofer.nombre || orden.choferNombre || '',
    asignadoEn: iso(),
    // Manual: SIN contador. No vence ni se reencola solo — queda fijada a ESE chofer
    // hasta que acepte o rechace (el motor automático la respeta por asignacionManual).
    asignacionExpira: null,
    asignacionManual: true,
    // Al reasignar a mano, no arrastramos el veto anterior: damos vía libre.
    rechazadoPor: choferId ? (orden.rechazadoPor || []).filter((u) => u !== choferId) : (orden.rechazadoPor || []),
  })

  // Si está en línea, lo reservamos para que salga de la cola de disponibles.
  if (chofer.uid) { try { await reservar(chofer.uid, orden.id) } catch { /* noop */ } }
  // Inc.2: fija al dueño en los docs de pago (los importes ya están guardados).
  try { await asignarPagos(tenantId, orden.id, { transportistaId: chofer.carrierId, choferId, numero: orden.numero, ...(opts.pagoChofer != null ? { pagoChofer: opts.pagoChofer } : {}) }) } catch { /* noop */ }
  try { enviarPush(tenantId, `chofer:${choferId}`, 'Orden asignada', `Orden ${orden.numero} — ${orden.pesoEstimado ?? ''} ton ${orden.tipoEquipo ? `(${orden.tipoEquipo})` : ''}`) } catch { /* noop */ }
  try { await auditar(tenantId, { usuario: ctx.usuario?.email, rol: ctx.rol, accion: prev ? 'transferir_orden' : 'asignar_manual', entidad: 'orden', entidadId: orden.id, detalle: `→ ${chofer.nombre || choferId}${prev ? ' (transferida)' : ''}` }) } catch { /* noop */ }
}
