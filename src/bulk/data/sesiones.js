// BULK · Cierre de sesión forzado por el admin, vía una "señal" en Firestore.
// El admin marca un timestamp (a todos, por rol, o por usuario); cada sesión
// abierta escucha la señal y, si le aplica y es posterior a su inicio, cierra.
import { crearConId } from './repo'

const ahoraMs = () => Date.now()

// Fuerza cierre a TODOS los usuarios del tenant.
export async function cerrarTodos(tenantId) {
  try { await crearConId('signals', 'logout', tenantId, { all: ahoraMs() }) } catch { /* noop */ }
}
// Fuerza cierre a todos los de un ROL (chofer, transportista, dispatcher, admin, …).
export async function cerrarPorRol(tenantId, rol) {
  try { await crearConId('signals', 'logout', tenantId, { roles: { [rol]: ahoraMs() } }) } catch { /* noop */ }
}
// Fuerza cierre a UN usuario (por su uid).
export async function cerrarUsuario(tenantId, uid) {
  try { await crearConId('signals', 'logout', tenantId, { uids: { [uid]: ahoraMs() } }) } catch { /* noop */ }
}

// Timestamp de logout que APLICA a este usuario (el mayor entre all/rol/uid).
export function logoutAplicable(signalDoc, rol, uid) {
  if (!signalDoc) return 0
  return Math.max(Number(signalDoc.all) || 0, Number(signalDoc.roles?.[rol]) || 0, Number(signalDoc.uids?.[uid]) || 0)
}
