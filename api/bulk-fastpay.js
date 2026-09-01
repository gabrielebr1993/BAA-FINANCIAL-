// ---------------------------------------------------------------------------
// FAST PAY (módulo Bulk/Freight): retiro instantáneo de ganancias vía Stripe
// Connect, para CHOFERES y TRANSPORTISTAS (carriers).
//
// Diseño financiero (una sola fuente de verdad):
//   ganado    = pagos de órdenes ENTREGADAS/LIBERADAS/CERRADAS (bulk_orderPay_*)
//   retirado  = ledger transaccional bulk_fpLedger/{tenant_tipo_id} (autoridad),
//               sembrado desde bulk_retiros y actualizado SOLO en transacciones.
//   disponible= ganado - retirado
//   elegible  = min(disponible, max(0, ganado * %FastPay - retirado))
//
// Configuración (bulk_settings/{tenantId}.fastPay, la edita el admin en la app):
//   { activo, porcentaje (0-100), comisionPct, chofer, carrier, modoReal }
//
// Seguridad / integridad:
//   · IDEMPOTENCIA: cada retiro lleva un opId del cliente; el doc de retiro usa
//     ese id (fp_<opId>). Doble clic / refresh / reintento de red devuelven el
//     MISMO resultado sin ejecutar dos transferencias.
//   · ANTI-DOBLE-RETIRO: la validación de saldo y la reserva del monto ocurren
//     en UNA transacción sobre el ledger (dos retiros concurrentes se serializan).
//   · MODO REAL: con clave sk_test_ nunca se mueve dinero real. Con clave
//     sk_live_ SOLO opera si el admin activó `modoReal` en la configuración
//     (doble opt-in). Todo queda en bulk_retiros + bulk_audit.
//   · REVERSO: un admin puede revertir un retiro (reversal de la transferencia,
//     estado 'revertido', ledger decrementado, factura des-aplicada). El registro
//     histórico NUNCA se borra.
//
// acciones: estado | onboarding | retirar { monto, opId } | revertir { retiroId }
// ---------------------------------------------------------------------------
import { cargarAdmin, ensureAdmin, cargarStripe, esModoTest } from './_common.js'

const FINALES = ['entregada', 'liberada', 'cerrada']
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const ACTIVOS = ['procesando', 'pagado'] // estados de retiro que cuentan como dinero salido

// Config del tenant con defaults seguros (si el admin aún no configura nada,
// Fast Pay funciona como hasta ahora: 100% del saldo, 3% de comisión, ambos roles).
async function configDe(db, tenantId) {
  let c = {}
  try {
    const s = await db.collection('bulk_settings').doc(tenantId).get()
    c = (s.exists && s.data().fastPay) || {}
  } catch { /* sin doc */ }
  const pct = Math.min(100, Math.max(0, Number(c.porcentaje)))
  return {
    activo: c.activo !== false,
    porcentaje: Number.isFinite(pct) ? pct : 100,
    comisionPct: Math.min(50, Math.max(0, Number(c.comisionPct ?? 3))) || 0,
    chofer: c.chofer !== false,
    carrier: c.carrier !== false,
    modoReal: c.modoReal === true,
  }
}

// ¿La cuenta conectada tiene un destino de cobro INSTANTÁNEO (tarjeta de débito
// elegible, o banco que Stripe admita en instantáneo)? Fast Pay es solo
// instantáneo: sin esto el retiro se bloquea ANTES de mover dinero. Si la
// consulta a Stripe falla (red), devolvemos null = no concluyente y no se
// bloquea (el fallback tras la transferencia cubre ese caso raro).
async function destinosInstant(stripe, accountId) {
  try {
    const [cards, banks] = await Promise.all([
      stripe.accounts.listExternalAccounts(accountId, { object: 'card', limit: 10 }),
      stripe.accounts.listExternalAccounts(accountId, { object: 'bank_account', limit: 10 }),
    ])
    const todos = [...(cards.data || []), ...(banks.data || [])]
    return todos.filter((x) => (x.available_payout_methods || []).includes('instant'))
  } catch { return null }
}
async function tieneDestinoInstant(stripe, accountId) {
  const d = await destinosInstant(stripe, accountId)
  return d == null ? null : d.length > 0
}

// Autoriza al llamador. Devuelve { uid, tenant, rol, tipo, quienId, email } o error.
//   chofer        → tipo 'chofer',  quienId = uid
//   transportista → tipo 'carrier', quienId = bulkCarrierId
//   admin         → solo para la acción 'revertir'
async function autorizarFP(req, a) {
  const h = req.headers.authorization || ''
  const idToken = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!idToken) return { error: 'No autorizado (falta el token de sesión).', code: 401 }
  let d
  try { d = await a.getAuth().verifyIdToken(idToken) } catch { return { error: 'Token inválido o expirado. Vuelve a iniciar sesión.', code: 401 } }
  if (!d.bulkTenant) return { error: 'No autorizado.', code: 403 }
  const base = { uid: d.uid, tenant: d.bulkTenant, rol: d.bulkRole, email: d.email || '' }
  if (d.bulkRole === 'chofer') return { ...base, tipo: 'chofer', quienId: d.uid, carrierId: d.bulkCarrierId || null }
  if (d.bulkRole === 'transportista') {
    if (!d.bulkCarrierId) return { error: 'Tu cuenta no está ligada a un transportista.', code: 403 }
    return { ...base, tipo: 'carrier', quienId: d.bulkCarrierId }
  }
  if (d.bulkRole === 'super_admin' || d.bulkRole === 'admin') return { ...base, tipo: 'admin', quienId: d.uid }
  return { error: 'Tu rol no puede usar Fast Pay.', code: 403 }
}

// Ganado del CHOFER: bulk_orderPay_chofer (doc id = orderId) de órdenes finales +
// fallback pagoChofer inline en órdenes viejas. Reutiliza los montos ya calculados.
async function ganadoChofer(db, uid) {
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
  return r2([...gan.values()].reduce((a, b) => a + b, 0))
}

// Ganado del CARRIER: bulk_orderPay_carrier de órdenes finales + fallback inline.
async function ganadoCarrier(db, carrierId) {
  const gan = new Map()
  const pagos = await db.collection('bulk_orderPay_carrier').where('transportistaId', '==', carrierId).get()
  const ids = pagos.docs.map((p) => p.id)
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100)
    const ordenes = await db.getAll(...lote.map((oid) => db.collection('bulk_orders').doc(oid)))
    ordenes.forEach((o, j) => {
      if (!o.exists || !FINALES.includes((o.data() || {}).estado)) return
      const monto = Number(pagos.docs[i + j].data().precioTransportista) || 0
      if (monto > 0) gan.set(o.id, monto)
    })
  }
  const directas = await db.collection('bulk_orders').where('transportistaId', '==', carrierId).where('estado', 'in', FINALES).get()
  directas.forEach((o) => { const v = Number((o.data() || {}).precioTransportista) || 0; if (v > 0 && !gan.has(o.id)) gan.set(o.id, v) })
  return r2([...gan.values()].reduce((a, b) => a + b, 0))
}

// Retirado HISTÓRICO desde bulk_retiros (siembra del ledger la primera vez).
// Cuenta 'procesando' y 'pagado'; los 'error'/'revertido' no salen del balance.
async function retiradoDeHistorial(db, tipo, quienId) {
  const q = tipo === 'carrier'
    ? db.collection('bulk_retiros').where('carrierId', '==', quienId).where('tipo', '==', 'carrier')
    : db.collection('bulk_retiros').where('choferId', '==', quienId)
  const rs = await q.get()
  return r2(rs.docs.reduce((a, r) => {
    const d = r.data() || {}
    // Docs viejos sin tipo/estado = retiros de chofer pagados.
    const estado = d.estado || 'pagado'
    if (tipo === 'chofer' && d.tipo === 'carrier') return a
    return ACTIVOS.includes(estado) ? a + (Number(d.montoBase) || 0) : a
  }, 0))
}

const ledgerId = (tenant, tipo, quienId) => `${tenant}_${tipo}_${quienId}`
const elegibleDe = (ganado, retirado, pct) => {
  const disponible = Math.max(0, r2(ganado - retirado))
  const porPct = Math.max(0, r2(ganado * (pct / 100) - retirado))
  return { disponible, elegible: r2(Math.min(disponible, porPct)) }
}

// Titular de la cuenta Stripe: el chofer (bulk_users/{uid}) o el carrier (bulk_carriers/{id}).
function refTitular(db, auth) {
  return auth.tipo === 'carrier' ? db.collection('bulk_carriers').doc(auth.quienId) : db.collection('bulk_users').doc(auth.uid)
}

// Aplica un retiro de CARRIER a sus avisos de pago pendientes (FIFO) para que las
// facturas muestren «Total − Fast Pay = Balance». Devuelve lo aplicado por aviso.
async function aplicarAStatements(db, a, auth, retiro) {
  const aplicado = []
  try {
    const snap = await db.collection('bulk_carrierStatements').where('carrierId', '==', auth.quienId).get()
    const pendientes = snap.docs
      .map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) }))
      .filter((s) => s.estado !== 'pagado')
      .filter((s) => (Number(s.total) || 0) - (Number(s.fastPayAplicado) || 0) > 0.004)
      .sort((x, y) => (x.ts || '').localeCompare(y.ts || ''))
    let restante = retiro.montoBase
    const batch = db.batch()
    for (const s of pendientes) {
      if (restante <= 0.004) break
      const saldoAntes = r2((Number(s.total) || 0) - (Number(s.fastPayAplicado) || 0))
      const x = r2(Math.min(restante, saldoAntes))
      const mov = {
        retiroId: retiro.id, numero: retiro.numero, ts: retiro.ts, monto: x,
        usuario: retiro.usuario, balanceAntes: saldoAntes, balanceDespues: r2(saldoAntes - x),
      }
      batch.set(s.ref, {
        fastPayAplicado: r2((Number(s.fastPayAplicado) || 0) + x),
        fastPayMovs: a.FieldValue.arrayUnion(mov),
        actualizadoEn: a.FieldValue.serverTimestamp(),
      }, { merge: true })
      aplicado.push({ statementId: s.id, numero: s.numero || '', monto: x })
      restante = r2(restante - x)
    }
    if (aplicado.length) await batch.commit()
  } catch (e) {
    // La aplicación a facturas es informativa; el ledger sigue siendo la verdad.
    // eslint-disable-next-line no-console
    console.error('[bulk-fastpay] aplicarAStatements', e?.message || e)
  }
  return aplicado
}

// Deshace la aplicación a avisos de un retiro revertido.
async function desaplicarDeStatements(db, a, retiro) {
  try {
    const batch = db.batch()
    for (const ap of retiro.aplicadoA || []) {
      const ref = db.collection('bulk_carrierStatements').doc(ap.statementId)
      const s = await ref.get()
      if (!s.exists) continue
      const d = s.data() || {}
      batch.set(ref, {
        fastPayAplicado: Math.max(0, r2((Number(d.fastPayAplicado) || 0) - ap.monto)),
        fastPayMovs: (d.fastPayMovs || []).filter((m) => m.retiroId !== retiro.id),
        actualizadoEn: a.FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    await batch.commit()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[bulk-fastpay] desaplicar', e?.message || e)
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })

    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_SERVICE_ACCOUNT' ? 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar: ' + (e?.message || '') })
    }
    const auth = await autorizarFP(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })
    const db = a.getFirestore()
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { accion } = body
    const cfg = await configDe(db, auth.tenant)
    const test = esModoTest()

    // ── REVERTIR (solo admin): reversal en Stripe + estado 'revertido' + ledger ──
    if (accion === 'revertir') {
      if (auth.tipo !== 'admin') return res.status(403).json({ ok: false, error: 'Solo un administrador puede revertir un retiro.' })
      const retiroId = String(body.retiroId || '')
      const rref = db.collection('bulk_retiros').doc(retiroId)
      const rsnap = await rref.get()
      if (!rsnap.exists) return res.status(404).json({ ok: false, error: 'Retiro no encontrado.' })
      const retiro = { id: rsnap.id, ...rsnap.data() }
      if (retiro.tenantId !== auth.tenant) return res.status(403).json({ ok: false, error: 'Ese retiro no es de tu empresa.' })
      if (retiro.estado !== 'pagado') return res.status(400).json({ ok: false, error: `Solo se revierte un retiro pagado (este está «${retiro.estado}»).` })
      let reversalId = ''
      if (retiro.transferId) {
        try {
          const stripe = await cargarStripe()
          const rev = await stripe.transfers.createReversal(retiro.transferId)
          reversalId = rev.id
        } catch (e) {
          return res.status(400).json({ ok: false, error: 'Stripe no pudo revertir la transferencia: ' + (e?.message || '') })
        }
      }
      const ts = new Date().toISOString()
      const lref = db.collection('bulk_fpLedger').doc(ledgerId(retiro.tenantId, retiro.tipo || 'chofer', retiro.tipo === 'carrier' ? retiro.carrierId : retiro.choferId))
      await db.runTransaction(async (tx) => {
        const ls = await tx.get(lref)
        const cur = ls.exists ? Number(ls.data().retirado) || 0 : 0
        tx.set(lref, { retirado: Math.max(0, r2(cur - (Number(retiro.montoBase) || 0))), actualizadoEn: a.FieldValue.serverTimestamp() }, { merge: true })
        tx.set(rref, { estado: 'revertido', revertidoEn: ts, revertidoPor: auth.email || auth.uid, reversalId }, { merge: true })
      })
      if (retiro.tipo === 'carrier') await desaplicarDeStatements(db, a, retiro)
      await db.collection('bulk_audit').add({ tenantId: auth.tenant, usuario: auth.email || auth.uid, accion: 'fastpay_reverso', entidad: 'pago', detalle: `${retiro.numero || retiro.id} · ${retiro.nombre || ''} · $${retiro.montoBase} revertido`, ts }).catch(() => {})
      return res.status(200).json({ ok: true, estado: 'revertido', reversalId })
    }

    // ── Resto de acciones: chofer o carrier ─────────────────────────────────
    if (auth.tipo !== 'chofer' && auth.tipo !== 'carrier') {
      return res.status(403).json({ ok: false, error: 'Acción no disponible para tu rol.' })
    }
    const aplicaRol = auth.tipo === 'chofer' ? cfg.chofer : cfg.carrier
    const tref = refTitular(db, auth)
    const tsnap = await tref.get()
    const titular = tsnap.exists ? tsnap.data() : {}
    const nombreTitular = titular.nombre || auth.email || auth.uid

    // Saldos (fuente única): ganado por órdenes − retirado del ledger.
    const ganado = auth.tipo === 'chofer' ? await ganadoChofer(db, auth.uid) : await ganadoCarrier(db, auth.quienId)
    const lref = db.collection('bulk_fpLedger').doc(ledgerId(auth.tenant, auth.tipo, auth.quienId))
    const lsnap = await lref.get()
    const retirado = lsnap.exists ? r2(Number(lsnap.data().retirado) || 0) : await retiradoDeHistorial(db, auth.tipo, auth.quienId)
    const { disponible, elegible } = elegibleDe(ganado, retirado, cfg.porcentaje)

    if (accion === 'estado') {
      let estado = 'sin_registrar'
      let instantListo = null // true/false; null = sin cuenta o no se pudo consultar
      if (titular.stripeAccountId) {
        try {
          const stripe = await cargarStripe()
          const acct = await stripe.accounts.retrieve(titular.stripeAccountId)
          estado = (acct.payouts_enabled && acct.charges_enabled) ? 'verificado' : acct.details_submitted ? 'en_revision' : 'pendiente'
          await tref.set({ stripeEstado: estado, stripeActualizado: a.FieldValue.serverTimestamp() }, { merge: true })
          if (estado === 'verificado') instantListo = await tieneDestinoInstant(stripe, titular.stripeAccountId)
        } catch { estado = titular.stripeEstado || 'pendiente' }
      }
      return res.status(200).json({
        ok: true, estado, instantListo, ganado, retirado, disponible, elegible,
        porcentaje: cfg.porcentaje, comisionPct: cfg.comisionPct, activo: cfg.activo, aplicaRol,
        test, modoReal: cfg.modoReal, tipo: auth.tipo,
      })
    }

    // Llave publicable de Stripe (pk_...) para el formulario de tarjeta EN la app.
    // Es pública por diseño (va en el navegador); la secreta jamás sale de aquí.
    if (accion === 'pk') {
      return res.status(200).json({ ok: true, pk: process.env.STRIPE_PUBLISHABLE_KEY || '' })
    }

    // Agregar TARJETA DE DÉBITO desde la app: el navegador tokeniza la tarjeta
    // con Stripe.js (el número nunca pasa por nuestro servidor) y aquí solo se
    // adjunta el token a la cuenta conectada del titular.
    if (accion === 'agregarTarjeta') {
      if (!titular.stripeAccountId) return res.status(400).json({ ok: false, error: 'Primero configura tu cuenta de cobro.' })
      const tok = String(body.token || '')
      if (!/^tok_[A-Za-z0-9]+$/.test(tok)) return res.status(400).json({ ok: false, error: 'Token de tarjeta inválido. Actualiza la app.' })
      try {
        const stripe = await cargarStripe()
        const card = await stripe.accounts.createExternalAccount(titular.stripeAccountId, { external_account: tok })
        const instantListo = await tieneDestinoInstant(stripe, titular.stripeAccountId)
        await db.collection('bulk_audit').add({ tenantId: auth.tenant, usuario: auth.email || auth.uid, accion: 'fastpay_tarjeta', entidad: 'pago', detalle: `${nombreTitular} agregó tarjeta ${card.brand || ''} ····${card.last4 || ''} (instant: ${instantListo === true ? 'sí' : 'aún no'})`, ts: new Date().toISOString() }).catch(() => {})
        return res.status(200).json({ ok: true, marca: card.brand || '', ultimos4: card.last4 || '', instantListo })
      } catch (e) {
        return res.status(400).json({ ok: false, error: 'Stripe no aceptó la tarjeta: ' + (e?.message || '') })
      }
    }

    // Enlace de entrada al panel Stripe Express del titular (para agregar o
    // cambiar su tarjeta de débito sin esperar el correo de Stripe).
    if (accion === 'panel') {
      if (!titular.stripeAccountId) return res.status(400).json({ ok: false, error: 'Primero configura tu cuenta de cobro.' })
      try {
        const stripe = await cargarStripe()
        const link = await stripe.accounts.createLoginLink(titular.stripeAccountId)
        return res.status(200).json({ ok: true, url: link.url })
      } catch (e) {
        return res.status(400).json({ ok: false, error: 'No se pudo abrir tu panel de Stripe: ' + (e?.message || '') })
      }
    }

    if (accion === 'onboarding') {
      let stripe
      try { stripe = await cargarStripe() } catch (e) {
        return res.status(503).json({ ok: false, error: e?.message === 'SIN_STRIPE_KEY' ? 'Falta STRIPE_SECRET_KEY en Vercel.' : 'Stripe no disponible: ' + (e?.message || '') })
      }
      let accountId = titular.stripeAccountId || ''
      if (!accountId) {
        const acct = await stripe.accounts.create({
          type: 'express', country: 'US', email: auth.email || undefined, business_type: 'individual',
          capabilities: { transfers: { requested: true } },
          business_profile: { product_description: auth.tipo === 'carrier' ? 'Freight carrier' : 'Freight driver (1099)' },
          metadata: { bulkUid: auth.uid, tenant: auth.tenant, tipo: auth.tipo, quienId: auth.quienId },
        })
        accountId = acct.id
        await tref.set({ stripeAccountId: accountId, stripeEstado: 'pendiente', stripeTest: test, stripeActualizado: a.FieldValue.serverTimestamp() }, { merge: true })
      }
      const origen = req.headers.origin || 'https://www.milepay.io'
      const link = await stripe.accountLinks.create({ account: accountId, type: 'account_onboarding', refresh_url: origen + '/bulk', return_url: origen + '/bulk' })
      return res.status(200).json({ ok: true, url: link.url, test })
    }

    if (accion === 'retirar') {
      // ── Validaciones de negocio ──
      if (!cfg.activo) return res.status(403).json({ ok: false, error: 'Fast Pay está desactivado por el administrador.' })
      if (!aplicaRol) return res.status(403).json({ ok: false, error: 'Fast Pay no está habilitado para tu perfil.' })
      if (!test && !cfg.modoReal) {
        return res.status(403).json({ ok: false, error: 'Fast Pay está en modo prueba: el administrador aún no activa el modo real en Fast Pay → Configuración.' })
      }
      if (titular.stripeEstado !== 'verificado' || !titular.stripeAccountId) {
        return res.status(400).json({ ok: false, error: 'Tu cuenta de cobro aún no está verificada; completa el registro primero.' })
      }
      // Fast Pay es SOLO instantáneo: sin tarjeta de débito elegible no se retira
      // (se verifica ANTES de mover dinero; en modo prueba no se exige porque las
      // cuentas de test no traen tarjetas instantáneas). null = consulta fallida:
      // no bloqueamos, el fallback posterior a la transferencia lo cubre.
      if (!test) {
        const stripeChk = await cargarStripe()
        const puedeInstant = await tieneDestinoInstant(stripeChk, titular.stripeAccountId)
        if (puedeInstant === false) {
          return res.status(400).json({ ok: false, code: 'SIN_TARJETA', error: 'Fast Pay envía tu dinero en minutos a una TARJETA DE DÉBITO. Agrega la tuya en tu panel de Stripe y vuelve a intentar.' })
        }
      }
      const opId = String(body.opId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
      if (opId.length < 8) return res.status(400).json({ ok: false, error: 'Falta el identificador de la operación (opId). Actualiza la app.' })
      const monto = r2(body.monto != null ? Number(body.monto) : elegible)
      if (!(monto > 0)) return res.status(400).json({ ok: false, error: 'Indica un monto mayor a cero.' })
      if (!(elegible > 0)) return res.status(400).json({ ok: false, error: 'No tienes saldo elegible para Fast Pay en este momento.' })

      const rref = db.collection('bulk_retiros').doc('fp_' + opId)
      const comision = r2(monto * (cfg.comisionPct / 100))
      const neto = r2(monto - comision)
      const ts = new Date().toISOString()

      // ── Transacción: idempotencia + reserva en el ledger + folio FP- ──
      let previo = null
      let retiro = null
      await db.runTransaction(async (tx) => {
        const ex = await tx.get(rref)
        if (ex.exists) { previo = { id: ex.id, ...ex.data() }; return }
        const ls = await tx.get(lref)
        const retiradoTx = ls.exists ? r2(Number(ls.data().retirado) || 0) : retirado
        const { elegible: elegTx, disponible: dispTx } = elegibleDe(ganado, retiradoTx, cfg.porcentaje)
        if (monto > elegTx + 0.004) throw new Error(`El monto supera tu saldo elegible (${elegTx.toFixed(2)}).`)
        const cref = db.collection('bulk_counters').doc(auth.tenant)
        const cs = await tx.get(cref)
        const next = (Number((cs.exists ? cs.data() : {}).fastpay) || 0) + 1
        tx.set(cref, { tenantId: auth.tenant, fastpay: next, actualizadoEn: a.FieldValue.serverTimestamp() }, { merge: true })
        tx.set(lref, { tenantId: auth.tenant, tipo: auth.tipo, quienId: auth.quienId, retirado: r2(retiradoTx + monto), actualizadoEn: a.FieldValue.serverTimestamp() }, { merge: true })
        retiro = {
          numero: 'FP-' + String(next).padStart(6, '0'), opId,
          tenantId: auth.tenant, tipo: auth.tipo,
          choferId: auth.tipo === 'chofer' ? auth.uid : null,
          // El retiro del CHOFER también registra su carrier: así el transportista
          // lo ve y se lo descuenta al pagarle (herramienta de pago del carrier).
          carrierId: auth.tipo === 'carrier' ? auth.quienId : (auth.carrierId || null),
          nombre: nombreTitular, usuario: auth.email || auth.uid,
          ganadoTotal: ganado, disponibleAntes: dispTx, elegibleAntes: elegTx, porcentaje: cfg.porcentaje,
          montoBase: monto, comisionPct: cfg.comisionPct, comision, neto,
          balanceDespues: r2(dispTx - monto),
          estado: 'procesando', transferId: '', ts, test,
        }
        tx.set(rref, retiro)
      }).catch((e) => {
        if (!previo) throw e
      })

      // Reintento idempotente: la operación YA existe → devolver su resultado tal cual.
      if (previo) {
        if (previo.estado === 'pagado' || previo.estado === 'procesando') {
          return res.status(200).json({ ok: true, idempotente: true, numero: previo.numero, base: previo.montoBase, comision: previo.comision, neto: previo.neto, transferId: previo.transferId || '', balanceDespues: previo.balanceDespues, estado: previo.estado, instant: previo.instant === true, instantMotivo: previo.instantMotivo || '', test: previo.test === true })
        }
        return res.status(400).json({ ok: false, error: `Esta operación terminó en «${previo.estado}». Vuelve a intentar con un retiro nuevo.` })
      }

      // ── Transferencia Stripe (fuera de la transacción) ──
      try {
        const stripe = await cargarStripe()
        const tr = await stripe.transfers.create({
          amount: Math.round(neto * 100), currency: 'usd', destination: titular.stripeAccountId,
          description: `Fast Pay MilePay ${retiro.numero} — ${nombreTitular}`,
          metadata: { bulkUid: auth.uid, tenant: auth.tenant, tipo: auth.tipo, opId, numero: retiro.numero, base: String(monto), comision: String(comision) },
        }, { idempotencyKey: 'fp_' + opId })
        retiro.transferId = tr.id

        // ── INSTANT PAYOUT: empujar el dinero a la TARJETA DE DÉBITO ya mismo ──
        // La transferencia deja el neto en la cuenta Stripe del titular; sin este
        // paso, Stripe lo deposita al banco en 1-2 días hábiles. Aquí pedimos el
        // envío instantáneo (~30 min, tarjeta de débito elegible). Se retira TODO
        // el instant_available (incluye restos de retiros previos). La comisión de
        // Stripe por instantáneo la cobra a la cuenta del titular: si el monto
        // completo no cabe (balance_insufficient), se reintenta dejando margen de
        // 2% + $0.50. Si la cuenta no es elegible (sin tarjeta de débito, cuenta
        // recién creada), NO es un error del retiro: queda 'pagado' con depósito
        // estándar y la app le explica al titular cómo activar lo instantáneo.
        let instant = false, instantId = '', instantMotivo = ''
        try {
          const bal = await stripe.balance.retrieve({ stripeAccount: titular.stripeAccountId })
          const inst = ((bal.instant_available || []).find((b) => b.currency === 'usd') || {}).amount || 0
          if (inst > 0) {
            // Destino explícito: la tarjeta de débito elegible (si el default de
            // la cuenta es el banco, sin esto el payout instantáneo fallaría).
            const dst = await destinosInstant(stripe, titular.stripeAccountId)
            const dstId = ((dst || []).find((x) => x.object === 'card') || (dst || [])[0] || {}).id || null
            const intentos = [inst, inst - Math.max(50, Math.ceil(inst * 0.02) + 50)]
            for (const cent of intentos) {
              if (!(cent > 0)) break
              try {
                const po = await stripe.payouts.create(
                  { amount: cent, currency: 'usd', method: 'instant', ...(dstId ? { destination: dstId } : {}), description: `Fast Pay MilePay ${retiro.numero}`, metadata: { opId, numero: retiro.numero } },
                  { stripeAccount: titular.stripeAccountId, idempotencyKey: 'fpi_' + opId + '_' + cent },
                )
                instant = true; instantId = po.id; break
              } catch (pe) {
                if (pe?.code === 'balance_insufficient') continue
                instantMotivo = pe?.message || 'no elegible'; break
              }
            }
            if (!instant && !instantMotivo) instantMotivo = 'saldo instantáneo insuficiente'
          } else {
            instantMotivo = 'SIN_TARJETA'
          }
        } catch (pe) { instantMotivo = pe?.message || 'no disponible' }

        const aplicadoA = auth.tipo === 'carrier' ? await aplicarAStatements(db, a, auth, { ...retiro, id: rref.id }) : []
        await rref.set({ estado: 'pagado', transferId: tr.id, aplicadoA, instant, instantId, instantMotivo, pagadoEn: new Date().toISOString() }, { merge: true })
        await db.collection('bulk_audit').add({
          tenantId: auth.tenant, usuario: auth.email || auth.uid, accion: 'fastpay_retiro', entidad: 'pago',
          detalle: `${retiro.numero} · ${nombreTitular} (${auth.tipo}) · base $${monto} (${cfg.porcentaje}% eleg.) · comisión $${comision} · neto $${neto} · saldo ${retiro.disponibleAntes}→${retiro.balanceDespues} · ${tr.id}${instant ? ` · instant ${instantId}` : ' · depósito estándar'}${test ? ' · TEST' : ''}`, ts,
        }).catch(() => {})
        return res.status(200).json({ ok: true, numero: retiro.numero, base: monto, comision, neto, transferId: tr.id, balanceDespues: retiro.balanceDespues, estado: 'pagado', instant, instantMotivo, test })
      } catch (e) {
        // Falló Stripe: liberar el monto reservado y dejar el intento en el historial.
        await db.runTransaction(async (tx) => {
          const ls = await tx.get(lref)
          const cur = ls.exists ? Number(ls.data().retirado) || 0 : 0
          tx.set(lref, { retirado: Math.max(0, r2(cur - monto)), actualizadoEn: a.FieldValue.serverTimestamp() }, { merge: true })
          tx.set(rref, { estado: 'error', error: e?.message || 'stripe', actualizadoEn: a.FieldValue.serverTimestamp() }, { merge: true })
        }).catch(() => {})
        return res.status(400).json({ ok: false, error: 'No se pudo completar la transferencia: ' + (e?.message || 'error de Stripe') })
      }
    }

    return res.status(400).json({ ok: false, error: 'Acción no reconocida.' })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[bulk-fastpay]', e?.stack || e?.message || e)
    return res.status(400).json({ ok: false, error: 'Error de Fast Pay: ' + (e?.message || 'desconocido') })
  }
}
