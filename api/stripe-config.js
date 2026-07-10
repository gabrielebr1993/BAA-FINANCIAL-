// Estado de la configuración de Stripe para mostrar en Configuración (sin exponer
// la clave): si está configurada y si es modo TEST o Producción. Solo owner/súper-admin.
import { cargarAdmin, ensureAdmin, autorizar, esModoTest } from './_common.js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_SERVICE_ACCOUNT' ? 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar: ' + (e?.message || '') })
    }
    const auth = await autorizar(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })
    if (!auth.esSuper && !(auth.caller && auth.caller.role === 'owner')) {
      return res.status(403).json({ ok: false, error: 'Solo owner/súper-admin.' })
    }
    const configurado = !!process.env.STRIPE_SECRET_KEY
    return res.status(200).json({ ok: true, configurado, test: esModoTest(), pagosRealesHabilitados: false })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Error: ' + (e?.message || 'desconocido') })
  }
}
