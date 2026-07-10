// Dispara un pago (transfer) a la cuenta conectada del chofer. BLINDADO:
//   - SOLO funciona en modo TEST (sk_test_). En producción está deshabilitado.
//   - El chofer debe estar 'verificado' en Stripe.
// Solo owner/súper-admin de la empresa.
import { cargarAdmin, ensureAdmin, cargarStripe, esModoTest, autorizar, cargarChoferAutorizado } from './_common.js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })

    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_SERVICE_ACCOUNT' ? 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar: ' + (e?.message || '') })
    }
    let stripe
    try { stripe = await cargarStripe() } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_STRIPE_KEY' ? 'Falta STRIPE_SECRET_KEY en Vercel.' : 'Stripe no disponible: ' + (e?.message || '') })
    }

    // Blindaje: pagos reales deshabilitados. Solo se permite en modo TEST.
    if (!esModoTest()) {
      return res.status(403).json({ ok: false, error: 'Los pagos reales están DESHABILITADOS. Configura una clave de TEST (sk_test_) para probar.' })
    }

    const auth = await autorizar(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { companyId, driverId, monto, semana } = body
    const ch = await cargarChoferAutorizado(auth, companyId, driverId)
    if (ch.error) return res.status(ch.code).json({ ok: false, error: ch.error })

    if (ch.driver.stripeEstado !== 'verificado' || !ch.driver.stripeAccountId) {
      return res.status(400).json({ ok: false, error: 'El chofer no está verificado en Stripe; no puede recibir pago todavía.' })
    }
    const cents = Math.round(Number(monto || 0) * 100)
    if (!(cents > 0)) return res.status(400).json({ ok: false, error: 'Monto a pagar inválido.' })

    const tr = await stripe.transfers.create({
      amount: cents,
      currency: 'usd',
      destination: ch.driver.stripeAccountId,
      description: `Pago MilePay ${semana || ''} — ${ch.driver.nombre || ''}`.trim(),
      metadata: { companyId, driverId, semana: semana || '' },
    })
    return res.status(200).json({ ok: true, transferId: tr.id, test: true })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[stripe-pagar]', e?.stack || e?.message || e)
    return res.status(400).json({ ok: false, error: 'Error al pagar (test): ' + (e?.message || 'desconocido') })
  }
}
