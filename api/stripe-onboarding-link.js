// Genera el enlace de onboarding de Stripe para que el CHOFER registre sus datos
// bancarios directamente en Stripe (nosotros nunca los vemos). Solo owner/súper-admin.
import { cargarAdmin, ensureAdmin, cargarStripe, autorizar, cargarChoferAutorizado } from './_common.js'

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
    const { companyId, driverId, returnUrl, refreshUrl } = body
    const ch = await cargarChoferAutorizado(auth, companyId, driverId)
    if (ch.error) return res.status(ch.code).json({ ok: false, error: ch.error })

    const accountId = ch.driver.stripeAccountId
    if (!accountId) return res.status(400).json({ ok: false, error: 'El chofer no tiene cuenta Stripe. Créala primero ("Invitar a registrar pago").' })

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
