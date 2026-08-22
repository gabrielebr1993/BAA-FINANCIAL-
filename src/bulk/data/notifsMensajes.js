// ============================================================================
// BULK · Notificaciones internas de MENSAJES (toast). Estado compartido, sin UI:
//   1) Preferencias del usuario (sonido on/off + volumen), persistidas en el
//      dispositivo (localStorage). No viajan al servidor: son una comodidad local.
//   2) Conversación ACTIVA (la que el usuario está viendo ahora) — para NO mostrar
//      un toast de un chat que ya tiene abierto.
//   3) Bus para "abrir esta conversación" cuando el usuario toca un toast. Cualquier
//      superficie de mensajes (staff o portal) se suscribe y la abre.
// Reutiliza la mensajería en tiempo real existente (Firestore onSnapshot); NO crea
// un segundo canal de comunicación.
// ============================================================================

// ── 1) Preferencias ─────────────────────────────────────────────────────────
const LS = 'bulk_notif_msgs'
const DEFECTO = { sonido: true, volumen: 0.5 }
function cargar() {
  try { return { ...DEFECTO, ...(JSON.parse(localStorage.getItem(LS) || '{}') || {}) } } catch { return { ...DEFECTO } }
}
let prefs = cargar()
const subsPrefs = new Set()
export function getPrefsNotif() { return prefs }
export function setPrefsNotif(patch) {
  prefs = { ...prefs, ...patch }
  try { localStorage.setItem(LS, JSON.stringify(prefs)) } catch { /* noop */ }
  subsPrefs.forEach((f) => { try { f(prefs) } catch { /* noop */ } })
}
export function onPrefsNotif(cb) { subsPrefs.add(cb); return () => subsPrefs.delete(cb) }

// ── 2) Conversación activa ───────────────────────────────────────────────────
let convActiva = null
export function setConversacionActiva(key) { convActiva = key || null }
export function limpiarConversacionActiva(key) { if (!key || convActiva === key) convActiva = null }
export function getConversacionActiva() { return convActiva }

// ── 3) Abrir conversación (bus + pendiente) ──────────────────────────────────
// `pendiente` cubre el caso de navegar a otra ruta (staff): la superficie de
// mensajes, al montar, consume la conversación pendiente y la abre.
let pendiente = null
const subsAbrir = new Set()
export function pedirAbrirConversacion(key) {
  if (!key) return
  pendiente = key
  subsAbrir.forEach((f) => { try { f(key) } catch { /* noop */ } })
}
export function consumirConversacionPendiente() { const p = pendiente; pendiente = null; return p }
export function onAbrirConversacion(cb) { subsAbrir.add(cb); return () => subsAbrir.delete(cb) }
