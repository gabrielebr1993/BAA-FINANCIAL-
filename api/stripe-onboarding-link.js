// Onboarding de Stripe para que el CHOFER registre sus datos bancarios en Stripe.
// Dos modos:
//   - por defecto: enlace de onboarding (hosted, redirige a Stripe).
//   - modo:'embedded': Account Session (client_secret) para el registro INCRUSTADO
//     dentro de la app. Crea la cuenta Express si aún no existe. Solo owner/súper-admin.
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
    const { companyId, driverId, driverNombre, returnUrl, refreshUrl, modo } = body
    const ch = await cargarChoferAutorizado(auth, companyId, driverId)
    if (ch.error) return res.status(ch.code).json({ ok: false, error: ch.error })

    // Asegura la cuenta conectada (la crea si no existe).
    let accountId = ch.driver.stripeAccountId || ''
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: 'express', country: 'US', email: ch.driver.verificacion?.email || undefined, business_type: 'individual',
        capabilities: { transfers: { requested: true } }, business_profile: { product_description: 'Delivery contractor (1099)' },
        metadata: { companyId, driverId, driverNombre: driverNombre || ch.driver.nombre || '' },
      })
      accountId = acct.id
      await ch.dref.set({ stripeAccountId: accountId, stripeEstado: 'pendiente', stripeTest: esModoTest(), stripeActualizado: a.FieldValue.serverTimestamp() }, { merge: true })
    }

    // Modo INCRUSTADO: devuelve el client_secret del Account Session.
    if (modo === 'embedded') {
      const session = await stripe.accountSessions.create({ account: accountId, components: { account_onboarding: { enabled: true } } })
      return res.status(200).json({ ok: true, clientSecret: session.client_secret, stripeAccountId: accountId, test: esModoTest() })
    }

    const origin = req.headers.origin || `https://${req.headers.host || 'baa-financial.vercel.app'}`
    const volver = returnUrl || `${origin}/choferes/${encodeURIComponent(ch.driver.nombre || '')}`
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl || volver,
      return_url: volver,
      type: 'account_onboarding',
    })
    return res.status(200).json({ ok: true, url: link.url })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[stripe-onboarding-link]', e?.stack || e?.message || e)
    return res.status(400).json({ ok: false, error: 'Error al generar el enlace: ' + (e?.message || 'desconocido') })
  }
}
