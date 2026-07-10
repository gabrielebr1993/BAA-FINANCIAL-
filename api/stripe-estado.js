// Consulta en Stripe si el chofer ya completó su registro bancario y está listo
// para recibir pagos. Actualiza el estado en Firestore. Solo owner/súper-admin.
//   estado: 'sin_registrar' | 'pendiente' | 'en_revision' | 'verificado'
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

    const auth = await autorizar(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { companyId, driverId } = body
    const ch = await cargarChoferAutorizado(auth, companyId, driverId)
    if (ch.error) return res.status(ch.code).json({ ok: false, error: ch.error })

    const accountId = ch.driver.stripeAccountId
    if (!accountId) return res.status(200).json({ ok: true, estado: 'sin_registrar' })

    const acct = await stripe.accounts.retrieve(accountId)
    const listo = !!acct.payouts_enabled && !!acct.charges_enabled
    const estado = listo ? 'verificado' : acct.details_submitted ? 'en_revision' : 'pendiente'
    await ch.dref.set(
      { stripeEstado: estado, stripeTest: esModoTest(), stripeActualizado: a.FieldValue.serverTimestamp() },
      { merge: true }
    )
    return res.status(200).json({ ok: true, estado, detailsSubmitted: !!acct.details_submitted, payoutsEnabled: !!acct.payouts_enabled, test: esModoTest() })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[stripe-estado]', e?.stack || e?.message || e)
    return res.status(400).json({ ok: false, error: 'Error al consultar el estado: ' + (e?.message || 'desconocido') })
  }
}
