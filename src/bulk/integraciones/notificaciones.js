// ============================================================================
// BULK · Adaptador de notificaciones EXTERNAS (SMS y Push a apps cerradas).
// Estas SÍ requieren backend + cuentas (Twilio para SMS, FCM para Push). Aquí queda
// el punto de enchufe: si defines la URL del backend en VITE_BULK_NOTIFY_URL, se
// llamará; si no, la intención se registra en `bulk_notificaciones` para auditoría y
// para que un worker del backend la procese luego. La app funciona igual sin backend.
// ============================================================================
import { crear } from '../data/repo'

const ENDPOINT = import.meta.env.VITE_BULK_NOTIFY_URL || ''

async function registrar(tenantId, intento) {
  try { await crear('notificaciones', tenantId, { ...intento, ts: new Date().toISOString(), enviado: false }) } catch { /* noop */ }
}

async function llamarBackend(payload) {
  if (!ENDPOINT) return { ok: false, motivo: 'sin_backend' }
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    return { ok: r.ok }
  } catch (e) { return { ok: false, motivo: e.message } }
}

// Envía (o encola) un SMS. `tel` en formato E.164 (+1...). Requiere Twilio en el backend.
export async function enviarSMS(tenantId, tel, mensaje) {
  await registrar(tenantId, { canal: 'sms', destino: tel, mensaje })
  return llamarBackend({ canal: 'sms', destino: tel, mensaje })
}

// Envía (o encola) un push. `token` = registration token FCM del dispositivo.
export async function enviarPush(tenantId, token, titulo, cuerpo) {
  await registrar(tenantId, { canal: 'push', destino: token, titulo, cuerpo })
  return llamarBackend({ canal: 'push', destino: token, titulo, cuerpo })
}

export const notificacionesActivas = !!ENDPOINT
