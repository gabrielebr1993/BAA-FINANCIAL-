// Crea (o reutiliza) la cuenta conectada Express del chofer en Stripe. Guarda SOLO
// el stripeAccountId y el estado en Firestore. NUNCA datos bancarios (esos viven en
// Stripe). Solo owner/súper-admin de la empresa.
import { cargarAdmin, ensureAdmin, cargarStripe, esModoTest, autorizar, cargarChoferAutorizado } from './_common.js'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })

    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_SERVICE_ACCOUNT' ? 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar el servidor: ' + (e?.message || '') })
    }
    let stripe
    try { stripe = await cargarStripe() } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_STRIPE_KEY' ? 'Falta STRIPE_SECRET_KEY en Vercel (usa una clave de TEST para probar).' : 'Stripe no disponible: ' + (e?.message || '') })
    }

    const auth = await autorizar(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { companyId, driverId, driverNombre, email } = body
    const ch = await cargarChoferAutorizado(auth, companyId, driverId)
    if (ch.error) return res.status(ch.code).json({ ok: false, error: ch.error })

    let accountId = ch.driver.stripeAccountId || ''
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: email || undefined,
        business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        business_profile: { product_description: 'Delivery contractor (1099)' },
        metadata: { companyId, driverId, driverNombre: driverNombre || '' },
      })
      accountId = acct.id
      await ch.dref.set(
        { stripeAccountId: accountId, stripeEstado: 'pendiente', stripeTest: esModoTest(), stripeActualizado: a.FieldValue.serverTimestamp() },
        { merge: true }
      )
    }
    return res.status(200).json({ ok: true, stripeAccountId: accountId, test: esModoTest() })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[stripe-crear-cuenta]', e?.stack || e?.message || e)
    return res.status(400).json({ ok: false, error: 'Error al crear la cuenta de pago: ' + (e?.message || 'desconocido') })
  }
}
