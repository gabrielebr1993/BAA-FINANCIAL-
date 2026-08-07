// BULK · Preferencia de SONIDO del chofer (avisos de mensajes/nuevas órdenes).
// Se guarda en localStorage por dispositivo. Por defecto ENCENDIDO.
const K = 'bulk_chofer_sonido'

export function sonidoActivo() {
  try { return localStorage.getItem(K) !== 'off' } catch { return true }
}
export function setSonido(on) {
  try { localStorage.setItem(K, on ? 'on' : 'off') } catch { /* noop */ }
}
