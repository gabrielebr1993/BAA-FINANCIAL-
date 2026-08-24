// ============================================================================
// BULK · TOTP de liberación de entregas (RFC 6238 sobre HOTP/RFC 4226).
// Lógica PURA y testeable (sin Firebase): la usan las Cloud Functions y las
// pruebas unitarias. Cada supervisor tiene su PROPIO secreto (nunca un código
// estático compartido); el código de 6 dígitos rota cada `periodo` segundos
// (30/60/120, configurable) y también puede rotarse a mano regenerando el
// secreto (el anterior deja de valer al instante).
// ============================================================================
const crypto = require('crypto')

// Secreto criptográficamente seguro (20 bytes = 160 bits, el estándar TOTP).
function generarSecreto() {
  return crypto.randomBytes(20).toString('hex')
}

// Paso de tiempo actual (contador TOTP) para un periodo dado.
function timestep(periodoSeg, ahoraMs = Date.now()) {
  return Math.floor(ahoraMs / 1000 / Math.max(1, periodoSeg))
}

// HOTP (RFC 4226): HMAC-SHA1(secreto, contador) → truncado dinámico → 6 dígitos.
function hotp(secretoHex, contador) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(contador))
  const h = crypto.createHmac('sha1', Buffer.from(secretoHex, 'hex')).update(buf).digest()
  const off = h[h.length - 1] & 0x0f
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]
  return String(bin % 1000000).padStart(6, '0')
}

// Código TOTP vigente para un secreto/periodo (o un timestep explícito).
function codigoTotp(secretoHex, periodoSeg, ahoraMs = Date.now()) {
  return hotp(secretoHex, timestep(periodoSeg, ahoraMs))
}

// Segundos que le quedan de vida al código actual.
function segundosRestantes(periodoSeg, ahoraMs = Date.now()) {
  const p = Math.max(1, periodoSeg)
  return p - (Math.floor(ahoraMs / 1000) % p)
}

// Valida un token contra un secreto con VENTANA de tolerancia (±1 paso por
// defecto, para desfase de reloj y códigos tecleados al filo del cambio).
// Comparación en tiempo constante. Devuelve { ok, timestep } — el timestep
// aceptado queda registrado en la autorización (auditoría/anti-replay).
function validarTotp(secretoHex, token, { periodo = 60, ventana = 1, ahoraMs = Date.now() } = {}) {
  const limpio = String(token || '').replace(/\D/g, '')
  if (limpio.length !== 6 || !secretoHex) return { ok: false, timestep: null }
  const base = timestep(periodo, ahoraMs)
  for (let d = -ventana; d <= ventana; d++) {
    const esperado = hotp(secretoHex, base + d)
    const a = Buffer.from(esperado), b = Buffer.from(limpio)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true, timestep: base + d }
  }
  return { ok: false, timestep: null }
}

// Normaliza el periodo configurado a los valores soportados.
const PERIODOS = [30, 60, 120]
function periodoValido(v) {
  const n = Number(v)
  return PERIODOS.includes(n) ? n : 60
}

module.exports = { generarSecreto, timestep, hotp, codigoTotp, segundosRestantes, validarTotp, periodoValido, PERIODOS }
