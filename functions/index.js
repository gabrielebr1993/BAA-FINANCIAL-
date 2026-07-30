// ============================================================================
// BULK · Backend (Cloud Functions v2)
// - Gestión de usuarios con Firebase Auth + CUSTOM CLAIMS (bulkTenant, bulkRole,
//   bulkClienteId, bulkCarrierId) para que las reglas de Firestore aíslen por tenant/rol.
// - Worker de notificaciones (SMS por Twilio / Push por FCM) sobre `bulk_notificaciones`.
// - Hook de asignación con IA (opcional; sin key configurada, usa el motor de reglas).
//
// Config (firebase functions:config o variables de entorno / secrets):
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM   → SMS
//   (FCM usa las credenciales del propio proyecto vía Admin SDK)
//   MODEL_API_KEY, MODEL_URL                → IA de asignación (opcional)
// Desplegar:  cd functions && npm i && firebase deploy --only functions
// ============================================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

const ROLES = ['super_admin', 'admin', 'dispatcher', 'cliente', 'transportista', 'chofer', 'supervisor_planta']
const esAdminClaim = (t) => t && (t.bulkRole === 'super_admin' || t.bulkRole === 'admin')

// --- Claims que se copian al token del usuario -----------------------------
function claimsDe(perfil) {
  const c = { bulkTenant: perfil.tenantId, bulkRole: perfil.rol }
  if (perfil.clienteId) c.bulkClienteId = perfil.clienteId
  if (perfil.carrierId) c.bulkCarrierId = perfil.carrierId
  return c
}

// ============================================================================
// crearUsuarioBulk — crea (o actualiza) un usuario Bulk. Solo super_admin/admin.
// data: { nombre, email, password, rol, clienteId?, carrierId? }
// ============================================================================
exports.crearUsuarioBulk = onCall(async (req) => {
  const t = req.auth && req.auth.token
  if (!t || !t.bulkTenant) throw new HttpsError('permission-denied', 'No autorizado.')
  const { nombre, email, password, rol, clienteId, carrierId } = req.data || {}
  if (!email || !password || !ROLES.includes(rol)) throw new HttpsError('invalid-argument', 'Datos inválidos.')
  // Admin crea cualquiera; un transportista solo puede crear CHOFERES de su propio carrier.
  const esTransCreandoChofer = t.bulkRole === 'transportista' && rol === 'chofer' && carrierId && carrierId === t.bulkCarrierId
  if (!esAdminClaim(t) && !esTransCreandoChofer) throw new HttpsError('permission-denied', 'Sin permiso para crear este usuario.')

  let user
  try { user = await admin.auth().createUser({ email: String(email).toLowerCase(), password, displayName: nombre }) }
  catch (e) { throw new HttpsError('already-exists', e.message) }

  const perfil = {
    nombre: nombre || '', email: String(email).toLowerCase(), rol, tenantId: t.bulkTenant,
    clienteId: clienteId || null, carrierId: carrierId || null, activo: true,
    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
  }
  await admin.auth().setCustomUserClaims(user.uid, claimsDe(perfil))
  await db.collection('bulk_users').doc(user.uid).set(perfil, { merge: true })
  return { uid: user.uid }
})

// ============================================================================
// bootstrapMasterBulk — crea el PRIMER super administrador si aún no existe.
// Idempotente y sin auth (solo funciona mientras no haya ningún super_admin).
// data: { nombre, email, password }
// ============================================================================
exports.bootstrapMasterBulk = onCall(async (req) => {
  const yaHay = await db.collection('bulk_users').where('rol', '==', 'super_admin').limit(1).get()
  if (!yaHay.empty) throw new HttpsError('failed-precondition', 'Ya existe un super administrador.')
  const { nombre, email, password } = req.data || {}
  if (!email || !password) throw new HttpsError('invalid-argument', 'Correo y contraseña requeridos.')

  const tenantId = 't_' + Date.now().toString(36)
  const user = await admin.auth().createUser({ email: String(email).toLowerCase(), password, displayName: nombre })
  const perfil = { nombre: nombre || 'Super Admin', email: String(email).toLowerCase(), rol: 'super_admin', tenantId, activo: true, empresa: 'My Pay', creadoEn: admin.firestore.FieldValue.serverTimestamp() }
  await admin.auth().setCustomUserClaims(user.uid, claimsDe(perfil))
  await db.collection('bulk_users').doc(user.uid).set(perfil)
  return { uid: user.uid, tenantId }
})

// ============================================================================
// repararMisClaims — el usuario autenticado re-aplica sus propios custom claims
// (bulkTenant/bulkRole) a partir de su perfil en bulk_users. Arregla el caso en que
// los claims se asignaron después del último login o el perfil quedó a medias.
// Seguro: solo actúa sobre el propio uid; no puede promover a otros.
// ============================================================================
exports.repararMisClaims = onCall(async (req) => {
  const auth = req.auth
  if (!auth || !auth.uid) throw new HttpsError('unauthenticated', 'Inicia sesión primero.')
  const uid = auth.uid
  const email = String(auth.token.email || '').toLowerCase()
  const usersCol = db.collection('bulk_users')

  let snap = await usersCol.doc(uid).get()
  let perfil = snap.exists ? snap.data() : null
  // Si no hay perfil bajo este uid, búscalo por correo (usuario recreado / uid distinto).
  if (!perfil && email) {
    const q = await usersCol.where('email', '==', email).limit(1).get()
    if (!q.empty) perfil = q.docs[0].data()
  }
  // Sin perfil: solo crea super_admin si aún NO existe ninguno (primer arranque).
  if (!perfil) {
    const yaSuper = await usersCol.where('rol', '==', 'super_admin').limit(1).get()
    if (!yaSuper.empty) throw new HttpsError('failed-precondition', 'Tu usuario no tiene perfil. Pide a un administrador que te cree.')
    perfil = { nombre: auth.token.name || 'Super Admin', email, rol: 'super_admin', tenantId: 't_' + uid.slice(0, 10).toLowerCase(), activo: true, empresa: 'B&A American group', creadoEn: admin.firestore.FieldValue.serverTimestamp() }
  }
  // Refleja el perfil bajo el uid actual y aplica los claims al token.
  await usersCol.doc(uid).set(perfil, { merge: true })
  const claims = { bulkTenant: perfil.tenantId, bulkRole: perfil.rol || 'super_admin' }
  if (perfil.clienteId) claims.bulkClienteId = perfil.clienteId
  if (perfil.carrierId) claims.bulkCarrierId = perfil.carrierId
  await admin.auth().setCustomUserClaims(uid, claims)
  return { ok: true, rol: claims.bulkRole, tenantId: claims.bulkTenant }
})

// ============================================================================
// procesarNotificacion — dispara al crearse un doc en bulk_notificaciones.
// Envía SMS (Twilio) o Push (FCM) y marca `enviado`.
// ============================================================================
exports.procesarNotificacion = onDocumentCreated('bulk_notificaciones/{id}', async (event) => {
  const snap = event.data
  if (!snap) return
  const n = snap.data() || {}
  let ok = false, error = null
  try {
    if (n.canal === 'sms') {
      const sid = process.env.TWILIO_SID, token = process.env.TWILIO_TOKEN, from = process.env.TWILIO_FROM
      if (!sid || !token || !from) throw new Error('Twilio no configurado')
      const twilio = require('twilio')(sid, token)
      await twilio.messages.create({ to: n.destino, from, body: n.mensaje || '' })
      ok = true
    } else if (n.canal === 'push') {
      // n.destino puede ser un token FCM real o una referencia (ej. "carrier:<id>")
      // que el backend resuelve a los tokens de los dispositivos del transportista.
      if (String(n.destino || '').includes(':')) throw new Error('Referencia sin resolver (implementar lookup de tokens)')
      await admin.messaging().send({ token: n.destino, notification: { title: n.titulo || 'Bulk', body: n.cuerpo || '' } })
      ok = true
    }
  } catch (e) { error = e.message }
  await snap.ref.set({ enviado: ok, error, procesadoEn: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
})

// ============================================================================
// bulkPushOrdenes — PUSH REAL (FCM) por cambios de una orden:
//   • Asignada / reasignada (→ notificando) → push a los CHOFERES del transporte
//     y aviso al staff.
//   • Aceptada  → push al staff (super_admin/admin/dispatcher).
//   • Rechazada → push al staff.
// Los tokens salen de `bulk_pushTokens` (los registra la app al iniciar sesión).
// ============================================================================
async function tokensDe(tenantId, filtro) {
  const snap = await db.collection('bulk_pushTokens').where('tenantId', '==', tenantId).get()
  const out = []
  snap.forEach((d) => { const x = d.data(); if (x.token && filtro(x)) out.push({ id: d.id, token: x.token }) })
  return out
}
async function enviarAPI(destinos, title, body, url) {
  if (!destinos.length) return
  const tokens = [...new Set(destinos.map((d) => d.token))]
  try {
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: { fcmOptions: url ? { link: url } : undefined },
      data: url ? { url } : {},
    })
    // Limpia tokens inválidos.
    const borrar = []
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') {
        const t = tokens[i]; const d = destinos.find((x) => x.token === t); if (d) borrar.push(d.id)
      }
    })
    await Promise.all(borrar.map((id) => db.collection('bulk_pushTokens').doc(id).delete().catch(() => {})))
  } catch (e) { console.error('push error', e.message) }
}
const STAFF = ['super_admin', 'admin', 'dispatcher']

exports.bulkPushOrdenes = onDocumentUpdated('bulk_orders/{id}', async (event) => {
  const before = event.data.before.data() || {}
  const after = event.data.after.data() || {}
  const tenantId = after.tenantId
  if (!tenantId) return
  const num = after.numero || ''
  const base = 'https://www.milepay.io/bulk/ordenes/' + event.params.id

  // Asignación / reasignación
  if (after.estado === 'notificando' && before.estado !== 'notificando' && after.transportistaId) {
    const choferes = await tokensDe(tenantId, (x) => x.rol === 'chofer' && x.carrierId === after.transportistaId)
    await enviarAPI(choferes, 'Nueva orden', `${num} — ${after.pesoEstimado || ''} ton (${after.tipoEquipo || ''})`, base)
    const staff = await tokensDe(tenantId, (x) => STAFF.includes(x.rol))
    await enviarAPI(staff, 'Orden asignada', `${num}`, base)
  }
  // Aceptada
  if (after.estado === 'aceptada' && before.estado !== 'aceptada') {
    const staff = await tokensDe(tenantId, (x) => STAFF.includes(x.rol))
    await enviarAPI(staff, 'Orden aceptada', `${num} — ${after.choferNombre || ''}`, base)
  }
  // Rechazada (cambió rechazo.ts)
  const rtA = after.rechazo && after.rechazo.ts, rtB = before.rechazo && before.rechazo.ts
  if (rtA && rtA !== rtB) {
    const staff = await tokensDe(tenantId, (x) => STAFF.includes(x.rol))
    const motivo = after.rechazo && after.rechazo.motivo ? ` · ${after.rechazo.motivo}` : ''
    await enviarAPI(staff, 'Orden rechazada', `${num} — ${(after.rechazo && after.rechazo.por) || ''}${motivo}`, base)
  }
})

// ============================================================================
// recomendarAsignacionIA — hook opcional de IA. Si no hay modelo configurado,
// responde que se use el motor de reglas del front (domain/asignacion.js).
// data: { orden, candidatos }  →  { usarReglas } | { ranking }
// ============================================================================
exports.recomendarAsignacionIA = onCall(async (req) => {
  const t = req.auth && req.auth.token
  if (!t || !t.bulkTenant) throw new HttpsError('permission-denied', 'No autorizado.')
  const key = process.env.MODEL_API_KEY, url = process.env.MODEL_URL
  if (!key || !url) return { usarReglas: true }
  // TODO: llamar al modelo con fetch(url, { headers:{Authorization:`Bearer ${key}`}, ... })
  // y devolver { ranking: [{carrierId, score, motivo}] }. Contrato igual al de reglas.
  return { usarReglas: true }
})
