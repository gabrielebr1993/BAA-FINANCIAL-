// ---------------------------------------------------------------------------
// FAST PAY del CHOFER (módulo Bulk/Freight): retiro instantáneo de sus ganancias
// vía Stripe Connect. BLINDADO como stripe-pagar: SOLO funciona en modo TEST
// (sk_test_); en producción los retiros reales están deshabilitados.
// Autenticación: idToken del propio chofer (custom claims bulkRole='chofer').
// acciones: estado | onboarding | retirar
//   estado     → estado de su cuenta Stripe + saldo (ganado − retirado) y comisión.
//   onboarding → crea (o reutiliza) su cuenta Express y devuelve el link de registro.
//   retirar    → transfiere el NETO (saldo − 3%) a su cuenta y registra bulk_retiros.
// ---------------------------------------------------------------------------
import { cargarAdmin, ensureAdmin, cargarStripe, esModoTest } from './_common.js'

const COMISION = 0.03
const FINALES = ['entregada', 'liberada', 'cerrada']
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

async function autorizarChofer(req, a) {
  const h = req.headers.authorization || ''
  const idToken = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!idToken) return { error: 'No autorizado (falta el token de sesión).', code: 401 }
  let d
  try { d = await a.getAuth().verifyIdToken(idToken) } catch { return { error: 'Token inválido o expirado. Vuelve a iniciar sesión.', code: 401 } }
  if (d.bulkRole !== 'chofer' || !d.bulkTenant) return { error: 'Solo el chofer puede usar Fast Pay.', code: 403 }
  return { uid: d.uid, tenant: d.bulkTenant, email: d.email || '' }
}

// Saldo del chofer: ganado (pagos de órdenes ENTREGADAS/LIBERADAS/CERRADAS, desde
// bulk_orderPay_chofer y, para órdenes viejas, el pagoChofer del propio doc) menos
// lo ya retirado (bulk_retiros.montoBase). Reutiliza los montos ya calculados.
async function calcularSaldo(db, uid) {
  const gan = new Map()
  const pagos = await db.collection('bulk_orderPay_chofer').where('choferId', '==', uid).get()
  const ids = pagos.docs.map((p) => p.id)
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100)
    const ordenes = await db.getAll(...lote.map((oid) => db.collection('bulk_orders').doc(oid)))
    ordenes.forEach((o, j) => {
      if (!o.exists || !FINALES.includes((o.data() || {}).estado)) return
      const monto = Number(pagos.docs[i + j].data().pagoChofer) || 0
      if (monto > 0) gan.set(o.id, monto)
    })
  }
  const directas = await db.collection('bulk_orders').where('choferId', '==', uid).where('estado', 'in', FINALES).get()
  directas.forEach((o) => { const v = Number((o.data() || {}).pagoChofer) || 0; if (v > 0 && !gan.has(o.id)) gan.set(o.id, v) })
  const ganado = r2([...gan.values()].reduce((a, b) => a + b, 0))
  const rets = await db.collection('bulk_retiros').where('choferId', '==', uid).get()
  const retirado = r2(rets.docs.reduce((a, r) => a + (Number(r.data().montoBase) || 0), 0))
  return { ganado, retirado, disponible: Math.max(0, r2(ganado - retirado)) }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })

    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_SERVICE_ACCOUNT' ? 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar: ' + (e?.message || '') })
    }
    const auth = await autorizarChofer(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })
    const db = a.getFirestore()
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { accion } = body
    const uref = db.collection('bulk_users').doc(auth.uid)
    const usnap = await uref.get()
    const perfil = usnap.exists ? usnap.data() : {}

    if (accion === 'estado') {
      const saldo = await calcularSaldo(db, auth.uid)
      let estado = 'sin_registrar'
      if (perfil.stripeAccountId) {
        try {
          const stripe = await cargarStripe()
          const acct = await stripe.accounts.retrieve(perfil.stripeAccountId)
          estado = (acct.payouts_enabled && acct.charges_enabled) ? 'verificado' : acct.details_submitted ? 'en_revision' : 'pendiente'
          await uref.set({ stripeEstado: estado, stripeActualizado: a.FieldValue.serverTimestamp() }, { merge: true })
        } catch { estado = perfil.stripeEstado || 'pendiente' }
      }
      return res.status(200).json({ ok: true, estado, ...saldo, comisionPct: COMISION, test: esModoTest() })
    }

    if (accion === 'onboarding') {
      let stripe
      try { stripe = await cargarStripe() } catch (e) {
        return res.status(503).json({ ok: false, error: e?.message === 'SIN_STRIPE_KEY' ? 'Falta STRIPE_SECRET_KEY en Vercel (usa una clave de TEST para probar).' : 'Stripe no disponible: ' + (e?.message || '') })
      }
      let accountId = perfil.stripeAccountId || ''
      if (!accountId) {
        const acct = await stripe.accounts.create({
          type: 'express', country: 'US', email: auth.email || undefined, business_type: 'individual',
          capabilities: { transfers: { requested: true } },
          business_profile: { product_description: 'Freight driver (1099)' },
          metadata: { bulkUid: auth.uid, tenant: auth.tenant },
        })
        accountId = acct.id
        await uref.set({ stripeAccountId: accountId, stripeEstado: 'pendiente', stripeTest: esModoTest(), stripeActualizado: a.FieldValue.serverTimestamp() }, { merge: true })
      }
      const origen = req.headers.origin || 'https://www.milepay.io'
      const link = await stripe.accountLinks.create({ account: accountId, type: 'account_onboarding', refresh_url: origen + '/bulk', return_url: origen + '/bulk' })
      return res.status(200).json({ ok: true, url: link.url, test: esModoTest() })
    }

    if (accion === 'retirar') {
      // Blindaje: retiros reales deshabilitados; solo modo TEST (igual que stripe-pagar).
      if (!esModoTest()) return res.status(403).json({ ok: false, error: 'Los retiros reales están DESHABILITADOS. Configura una clave de TEST (sk_test_) para probar.' })
      if (perfil.stripeEstado !== 'verificado' || !perfil.stripeAccountId) {
        return res.status(400).json({ ok: false, error: 'Tu cuenta de cobro aún no está verificada; completa el registro primero.' })
      }
      const saldo = await calcularSaldo(db, auth.uid)
      if (!(saldo.disponible > 0)) return res.status(400).json({ ok: false, error: 'No tienes saldo disponible para retirar.' })
      const stripe = await cargarStripe()
      const base = saldo.disponible
      const comision = r2(base * COMISION)
      const neto = r2(base - comision)
      const tr = await stripe.transfers.create({
        amount: Math.round(neto * 100), currency: 'usd', destination: perfil.stripeAccountId,
        description: `Fast Pay MilePay — ${perfil.nombre || auth.email || auth.uid}`,
        metadata: { bulkUid: auth.uid, tenant: auth.tenant, base: String(base), comision: String(comision) },
      })
      const ts = new Date().toISOString()
      await db.collection('bulk_retiros').add({ tenantId: auth.tenant, choferId: auth.uid, choferNombre: perfil.nombre || '', montoBase: base, comision, neto, transferId: tr.id, estado: 'pagado', ts, test: true })
      await db.collection('bulk_audit').add({ tenantId: auth.tenant, usuario: perfil.nombre || auth.email || auth.uid, accion: 'fastpay_retiro', entidad: 'pago', detalle: `Fast Pay $${neto} (base $${base}, comisión $${comision}) · ${tr.id}`, ts }).catch(() => {})
      return res.status(200).json({ ok: true, base, comision, neto, transferId: tr.id, test: true })
    }

    return res.status(400).json({ ok: false, error: 'Acción no reconocida.' })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[bulk-fastpay]', e?.stack || e?.message || e)
    return res.status(400).json({ ok: false, error: 'Error de Fast Pay: ' + (e?.message || 'desconocido') })
  }
}
