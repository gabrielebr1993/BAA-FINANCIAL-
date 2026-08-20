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
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

const ROLES = ['super_admin', 'admin', 'dispatcher', 'cliente', 'transportista', 'chofer', 'supervisor_planta']
const esAdminClaim = (t) => t && (t.bulkRole === 'super_admin' || t.bulkRole === 'admin')

// Historial de asignación (mismo modelo que domain/historialAsignacion.js del front):
// registra cada oferta y su desenlace en el arreglo `intentos` de la orden.
const INTENTO_MAX = 80
function agregarOfertaFn(intentos, choferId, choferNombre, ts) {
  const prev = Array.isArray(intentos) ? intentos : []
  const ronda = prev.filter((i) => i.choferId === choferId).length + 1
  return prev.concat([{ choferId: choferId || null, choferNombre: choferNombre || '', ronda, ofrecidoEn: ts || null, respondidoEn: null, estado: 'ofrecida' }]).slice(-INTENTO_MAX)
}
function cerrarOfertaFn(intentos, estado, ts) {
  const out = (Array.isArray(intentos) ? intentos : []).slice()
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].estado === 'ofrecida') { out[i] = Object.assign({}, out[i], { estado, respondidoEn: ts || null }); break }
  }
  return out
}

// Rol válido para asignar: built-in, o rol PERSONALIZADO definido por el tenant en
// bulk_roles/{tenantId}.roles (RBAC configurable). Los roles personalizados son de
// tipo staff (usan el panel); las reglas de Firestore los tratan como staff no-admin.
async function rolValido(tenantId, rol) {
  if (ROLES.includes(rol)) return true
  if (!tenantId || !rol) return false
  try {
    const s = await db.collection('bulk_roles').doc(tenantId).get()
    const roles = s.exists ? (s.data().roles || {}) : {}
    return !!roles[rol]
  } catch (e) { return false }
}

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
  if (!email || !password || !rol) throw new HttpsError('invalid-argument', 'Datos inválidos.')
  if (!(await rolValido(t.bulkTenant, rol))) throw new HttpsError('invalid-argument', 'Rol no reconocido.')
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
// bulkPushMensajes — PUSH REAL (FCM) por mensaje nuevo de chat (bulk_messages).
// Notifica a la OTRA parte de la conversación (no al autor):
//   • dm_c_<carrierId>  → el transporte y el staff.
//   • dm_d_<slug>       → el chofer (por nombre) y el staff.
//   • <orderId real>    → staff + el chofer y el transporte de esa orden.
// ============================================================================
const slugNombre = (s) => (s || '').trim().toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)

exports.bulkPushMensajes = onDocumentCreated('bulk_messages/{id}', async (event) => {
  const m = (event.data && event.data.data()) || {}
  const tenantId = m.tenantId
  const orderId = String(m.orderId || '')
  if (!tenantId || !orderId) return
  const autorId = m.autorId
  const titulo = m.autorNombre ? `Mensaje de ${m.autorNombre}` : 'Nuevo mensaje'
  const cuerpo = m.texto || (m.tipo === 'foto' ? '📷 Foto' : m.tipo === 'ubicacion' ? '📍 Ubicación' : 'Nuevo mensaje')

  let filtro, url
  if (orderId.startsWith('dm_c_')) {
    const carrierId = orderId.slice(5)
    filtro = (x) => x.uid !== autorId && ((x.rol === 'transportista' && x.carrierId === carrierId) || STAFF.includes(x.rol))
    url = 'https://www.milepay.io/bulk/mensajes'
  } else if (orderId.startsWith('dm_d_')) {
    const slug = orderId.slice(5)
    filtro = (x) => x.uid !== autorId && ((x.rol === 'chofer' && slugNombre(x.nombre) === slug) || STAFF.includes(x.rol))
    url = 'https://www.milepay.io/bulk/mensajes'
  } else {
    const ord = (await db.collection('bulk_orders').doc(orderId).get()).data() || {}
    const choferSlug = slugNombre(ord.choferNombre)
    const carrierId = ord.transportistaId
    filtro = (x) => x.uid !== autorId && (STAFF.includes(x.rol)
      || (x.rol === 'chofer' && choferSlug && slugNombre(x.nombre) === choferSlug)
      || (x.rol === 'transportista' && carrierId && x.carrierId === carrierId))
    url = 'https://www.milepay.io/bulk/ordenes/' + orderId
  }
  const dest = await tokensDe(tenantId, filtro)
  await enviarAPI(dest, titulo, cuerpo, url)
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

// ============================================================================
// MATCHING SERVER-SIDE — asigna órdenes a choferes en línea SIN depender de que un
// staff tenga la app abierta, con reserva TRANSACCIONAL (sin dobles asignaciones) y
// expiración programada de ofertas.
//
// ACTIVACIÓN por tenant vía la señal `bulk_signals/matching { serverSide:true }`
// (se enciende desde Modo test). Mientras esté apagada, estas funciones no hacen
// nada y el motor del navegador sigue a cargo → despliegue reversible y sin choques.
// ============================================================================
const FieldValue = admin.firestore.FieldValue
const PRESENCIA_TTL_MS = 90 * 1000
const ESPERA_RESPUESTA_MS = 120 * 1000
const PENDIENTES = ['creada', 'en_cola']
const NORM = (s) => String(s == null ? '' : s).trim().toLowerCase()
function tsMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Date.parse(v); return isNaN(n) ? 0 : n }
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v.seconds) return v.seconds * 1000
  return 0
}
function equipoCompatible(equipos, req) {
  if (!req) return true
  const lista = Array.isArray(equipos) ? equipos : (equipos ? [equipos] : [])
  return lista.map(NORM).includes(NORM(req))
}
function trabajoCompatible(jobs, jobId) {
  if (!jobs || !jobs.length) return true
  return !!jobId && jobs.includes(jobId)
}
function presenciaViva(p, now) {
  return !!p && p.enLinea === true && !p.ordenId && (!p.estado || p.estado === 'libre')
    && (now - tsMs(p.heartbeat || p.desde)) <= PRESENCIA_TTL_MS && !p.demo
}
// ¿El matching server-side está encendido para este tenant?
async function serverSideOn(tenantId) {
  try {
    const s = await db.collection('bulk_signals').doc('matching').get()
    const d = s.exists ? s.data() : null
    return !!d && d.serverSide === true && d.tenantId === tenantId
  } catch (e) { return false }
}

// Ofrece UNA orden a UN chofer de forma ATÓMICA (evita dobles asignaciones).
async function ofrecerTx(orderId, presenceId) {
  return db.runTransaction(async (tx) => {
    const oref = db.collection('bulk_orders').doc(orderId)
    const pref = db.collection('bulk_presence').doc(presenceId)
    const [os, ps] = await Promise.all([tx.get(oref), tx.get(pref)])
    if (!os.exists) return null
    const o = os.data()
    if (!PENDIENTES.includes(o.estado)) return null
    const p = ps.exists ? ps.data() : null
    if (!presenciaViva(p, Date.now())) return null
    const nowIso = new Date().toISOString()
    tx.update(oref, {
      estado: 'notificando', transportistaId: p.carrierId || null, choferId: p.uid || presenceId,
      choferNombre: p.nombre || '', asignadoEn: nowIso,
      asignacionExpira: new Date(Date.now() + ESPERA_RESPUESTA_MS).toISOString(),
      intentos: agregarOfertaFn(o.intentos, p.uid || presenceId, p.nombre || '', nowIso),
      actualizadoEn: FieldValue.serverTimestamp(),
    })
    tx.set(pref, { ordenId: orderId, estado: 'reservado', heartbeat: nowIso, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true })
    return { transportistaId: p.carrierId || null, choferId: p.uid || presenceId }
  })
}

// Empareja la cola de un tenant con sus choferes en línea (FIFO, 1 orden→1 chofer).
async function matchTenant(tenantId) {
  if (!tenantId || !(await serverSideOn(tenantId))) return
  const [ordSnap, presSnap] = await Promise.all([
    db.collection('bulk_orders').where('tenantId', '==', tenantId).get(),
    db.collection('bulk_presence').where('tenantId', '==', tenantId).get(),
  ])
  const now = Date.now()
  const cola = ordSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => PENDIENTES.includes(o.estado))
    .sort((a, b) => tsMs(a.creadoEn || a.numero) - tsMs(b.creadoEn || b.numero))
  if (!cola.length) return
  const libres = presSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => presenciaViva(p, now))
  const usados = new Set()
  for (const orden of cola) {
    const rech = orden.rechazadoPor || []
    const cand = libres
      .filter((p) => !usados.has(p.id) && !rech.includes(p.uid || p.id))
      .filter((p) => equipoCompatible(p.equipos || p.equipo, orden.tipoEquipo))
      .filter((p) => trabajoCompatible(p.jobs, orden.jobId))
      .sort((a, b) => tsMs(a.desde) - tsMs(b.desde))
    if (!cand.length) continue
    const res = await ofrecerTx(orden.id, cand[0].id)
    if (res) {
      usados.add(cand[0].id)
      try {
        await db.collection('bulk_orderPay_carrier').doc(orden.id).set({ transportistaId: res.transportistaId, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true })
        await db.collection('bulk_orderPay_chofer').doc(orden.id).set({ choferId: res.choferId, transportistaId: res.transportistaId, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true })
      } catch (e) { /* aditivo */ }
    }
  }
}

// Reencola una oferta vencida y libera al chofer (lo agrega a rechazadoPor).
async function reofertar(orderId) {
  const info = await db.runTransaction(async (tx) => {
    const oref = db.collection('bulk_orders').doc(orderId)
    const os = await tx.get(oref)
    if (!os.exists) return null
    const o = os.data()
    if (o.estado !== 'notificando') return null
    const uid = o.choferId || null
    const rechazadoPor = Array.from(new Set([...(o.rechazadoPor || []), uid].filter(Boolean)))
    tx.update(oref, {
      estado: 'creada', transportistaId: null, choferId: null, asignacionExpira: null, rechazadoPor,
      ultimoRechazo: { por: o.choferNombre || '', motivo: 'timeout', ts: new Date().toISOString() },
      intentos: cerrarOfertaFn(o.intentos, 'expirada', new Date().toISOString()),
      actualizadoEn: FieldValue.serverTimestamp(),
    })
    return { tenantId: o.tenantId, uid }
  })
  if (info && info.uid) {
    const nowIso = new Date().toISOString()
    try { await db.collection('bulk_presence').doc(info.uid).set({ ordenId: null, estado: 'libre', enLinea: true, desde: nowIso, heartbeat: nowIso }, { merge: true }) } catch (e) { /* noop */ }
    try {
      await db.collection('bulk_orderPay_carrier').doc(orderId).set({ transportistaId: null }, { merge: true })
      await db.collection('bulk_orderPay_chofer').doc(orderId).set({ choferId: null }, { merge: true })
    } catch (e) { /* noop */ }
  }
  return info
}

// Trigger: nueva orden o cambio → si está en cola, intenta emparejar su tenant.
exports.bulkAutoAsignar = onDocumentWritten('bulk_orders/{id}', async (event) => {
  const after = event.data && event.data.after && event.data.after.data()
  if (!after || !PENDIENTES.includes(after.estado)) return
  await matchTenant(after.tenantId)
})

// Trigger: un chofer PASA a disponible (se conecta o se libera) → empareja su tenant.
// (Se ignoran los latidos: no dispara en cada heartbeat.)
exports.bulkPresenciaMatch = onDocumentWritten('bulk_presence/{id}', async (event) => {
  const before = event.data && event.data.before && event.data.before.data()
  const after = event.data && event.data.after && event.data.after.data()
  if (!after) return
  const dispo = after.enLinea === true && !after.ordenId && (!after.estado || after.estado === 'libre')
  const antesDispo = !!before && before.enLinea === true && !before.ordenId && (!before.estado || before.estado === 'libre')
  if (!dispo || antesDispo) return
  await matchTenant(after.tenantId)
})

// Programada (cada minuto): vence ofertas sin respuesta y barre la cola pendiente.
exports.bulkExpirarOfertas = onSchedule('every 1 minutes', async () => {
  const now = Date.now()
  const notif = await db.collection('bulk_orders').where('estado', '==', 'notificando').get()
  const tenants = new Set()
  for (const d of notif.docs) {
    const o = d.data()
    if (o.asignacionExpira && tsMs(o.asignacionExpira) >= now) continue
    const info = await reofertar(d.id)
    if (info && info.tenantId) tenants.add(info.tenantId)
  }
  const pend = await db.collection('bulk_orders').where('estado', 'in', PENDIENTES).get()
  for (const d of pend.docs) { const tid = d.data().tenantId; if (tid) tenants.add(tid) }
  for (const tid of tenants) { await matchTenant(tid) }
})
