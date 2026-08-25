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
  // Ficha de DIRECTORIO (no sensible) para el descubrimiento de contactos del chat
  // interno: la pueden leer todos los miembros del tenant (incl. choferes). El `codigo`
  // (ID de 8 dígitos) se rellena al asignarse; aquí puede ir ausente.
  try {
    await db.collection('bulk_directorio').doc(user.uid).set({
      tenantId: t.bulkTenant, uid: user.uid, nombre: perfil.nombre || '', rol,
      carrierId: carrierId || null, clienteId: clienteId || null,
    }, { merge: true })
  } catch (e) { /* no bloquea el alta */ }
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
  // CHOFER: el carrier AUTORITATIVO es el del ROSTER que lo contiene (por uid). Así,
  // si el claim/perfil quedó con un carrierId desalineado, se corrige al carrier real
  // y su presencia/órdenes vuelven a coincidir con las de su transportista.
  if ((perfil.rol || '') === 'chofer' && perfil.tenantId) {
    try {
      const cs = await db.collection('bulk_carriers').where('tenantId', '==', perfil.tenantId).get()
      let carrierReal = null
      cs.forEach((d) => { const ch = (d.data().choferes || []); if (ch.some((x) => x && x.uid === uid)) carrierReal = d.id })
      if (carrierReal) perfil.carrierId = carrierReal
    } catch (e) { /* noop */ }
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
// bulkGrupoOp — operaciones de GRUPOS de chat, validadas 100% en el backend.
// Un solo callable con `accion`. Reglas de negocio (requisito):
//   - El CHOFER no puede CREAR grupos (sí puede ser invitado y aceptar).
//   - Solo el CREADOR o un ADMIN pueden invitar, expulsar, renombrar o disolver.
//   - Cada invitado acepta/rechaza SU invitación; cada miembro puede SALIR.
//   - Todos los uids deben pertenecer al MISMO tenant (aislamiento estricto).
// Los datos del grupo (miembros/invitados/roles/nombres/fotos) se guardan
// desnormalizados para pintar integrantes con su rol y foto sin más lecturas.
// data: { accion, grupoId?, nombre?, invitados?:[uid], uid? }
// ============================================================================
const _perfilBulk = async (uid) => {
  const s = await db.collection('bulk_users').doc(uid).get()
  return s.exists ? s.data() : null
}
const _fotoBulk = async (uid) => {
  try { const s = await db.collection('bulk_driverProfiles').doc(uid).get(); return s.exists ? (s.data().foto || null) : null } catch { return null }
}
// Añade a un grupo (en memoria) los datos desnormalizados de un uid del tenant.
async function _enriquecer(g, uid, tenant) {
  const p = await _perfilBulk(uid)
  if (!p || p.tenantId !== tenant) throw new HttpsError('invalid-argument', 'Usuario no pertenece a tu empresa.')
  g.roles = g.roles || {}; g.nombres = g.nombres || {}; g.fotos = g.fotos || {}
  g.roles[uid] = p.rol || ''
  g.nombres[uid] = p.nombre || p.email || 'Usuario'
  if (!(uid in g.fotos)) g.fotos[uid] = await _fotoBulk(uid)
}

exports.bulkGrupoOp = onCall(async (req) => {
  const t = req.auth && req.auth.token
  const uid = req.auth && req.auth.uid
  if (!t || !t.bulkTenant || !uid) throw new HttpsError('permission-denied', 'No autorizado.')
  const tenant = t.bulkTenant
  const esAdmin = esAdminClaim(t)
  const { accion, grupoId } = req.data || {}
  const col = db.collection('bulk_groups')
  const now = admin.firestore.FieldValue.serverTimestamp()

  const cargar = async () => {
    if (!grupoId) throw new HttpsError('invalid-argument', 'Falta grupoId.')
    const s = await col.doc(grupoId).get()
    if (!s.exists) throw new HttpsError('not-found', 'Grupo no encontrado.')
    const g = s.data()
    if (g.tenantId !== tenant) throw new HttpsError('permission-denied', 'Grupo de otra empresa.')
    return g
  }
  const esGestor = (g) => esAdmin || g.creadorId === uid

  // Un CHOFER puede crear/gestionar grupos con choferes de SU mismo transporte O con
  // sus CONTACTOS (agregados por ID con consentimiento). Valida contra bulk_users.
  const validarInvitadosChofer = async (lista) => {
    if (t.bulkRole !== 'chofer') return
    const mis = await _getContactos(uid)
    const contactos = new Set((mis && mis.contactos) || [])
    for (const iu of lista) {
      const p = await _perfilBulk(iu)
      if (!p || p.tenantId !== tenant) throw new HttpsError('invalid-argument', 'Invitado no válido.')
      const mismoCarrier = p.rol === 'chofer' && t.bulkCarrierId && (p.carrierId || null) === t.bulkCarrierId
      const esContacto = p.rol === 'chofer' && contactos.has(iu)
      if (!mismoCarrier && !esContacto) {
        throw new HttpsError('permission-denied', 'Un chofer solo puede agrupar a choferes de su transporte o a sus contactos.')
      }
    }
  }

  if (accion === 'crear') {
    const nombre = String((req.data.nombre || '')).trim().slice(0, 80)
    if (!nombre) throw new HttpsError('invalid-argument', 'El grupo necesita un nombre.')
    const invitados = [...new Set((req.data.invitados || []).filter((x) => x && x !== uid))].slice(0, 100)
    await validarInvitadosChofer(invitados)
    const g = { tenantId: tenant, nombre, creadorId: uid, miembros: [uid], invitados, roles: {}, nombres: {}, fotos: {}, activo: true, creadoEn: now, actualizadoEn: now }
    await _enriquecer(g, uid, tenant)
    for (const iu of invitados) await _enriquecer(g, iu, tenant)
    const ref = await col.add(g)
    return { grupoId: ref.id }
  }
  if (accion === 'invitar') {
    const g = await cargar()
    if (!esGestor(g)) throw new HttpsError('permission-denied', 'Solo el creador o un admin invitan.')
    const nuevos = [...new Set((req.data.invitados || []).filter(Boolean))].filter((x) => !(g.miembros || []).includes(x) && !(g.invitados || []).includes(x))
    await validarInvitadosChofer(nuevos)
    for (const iu of nuevos) await _enriquecer(g, iu, tenant)
    await col.doc(grupoId).update({ invitados: [...(g.invitados || []), ...nuevos], roles: g.roles, nombres: g.nombres, fotos: g.fotos, actualizadoEn: now })
    return { ok: true, invitados: nuevos.length }
  }
  if (accion === 'aceptar') {
    const g = await cargar()
    if (!(g.invitados || []).includes(uid)) throw new HttpsError('permission-denied', 'No tienes una invitación pendiente.')
    await col.doc(grupoId).update({ miembros: [...(g.miembros || []), uid], invitados: (g.invitados || []).filter((x) => x !== uid), actualizadoEn: now })
    return { ok: true }
  }
  if (accion === 'rechazar') {
    const g = await cargar()
    await col.doc(grupoId).update({ invitados: (g.invitados || []).filter((x) => x !== uid), actualizadoEn: now })
    return { ok: true }
  }
  if (accion === 'salir') {
    const g = await cargar()
    if (g.creadorId === uid) throw new HttpsError('failed-precondition', 'El creador no puede salir; disuelve el grupo o transfiérelo.')
    await col.doc(grupoId).update({ miembros: (g.miembros || []).filter((x) => x !== uid), invitados: (g.invitados || []).filter((x) => x !== uid), actualizadoEn: now })
    return { ok: true }
  }
  if (accion === 'expulsar') {
    const g = await cargar()
    if (!esGestor(g)) throw new HttpsError('permission-denied', 'Solo el creador o un admin gestionan integrantes.')
    const quitar = req.data.uid
    if (!quitar || quitar === g.creadorId) throw new HttpsError('invalid-argument', 'No se puede quitar a ese integrante.')
    await col.doc(grupoId).update({ miembros: (g.miembros || []).filter((x) => x !== quitar), invitados: (g.invitados || []).filter((x) => x !== quitar), actualizadoEn: now })
    return { ok: true }
  }
  if (accion === 'renombrar') {
    const g = await cargar()
    if (!esGestor(g)) throw new HttpsError('permission-denied', 'Solo el creador o un admin renombran.')
    const nombre = String((req.data.nombre || '')).trim().slice(0, 80)
    if (!nombre) throw new HttpsError('invalid-argument', 'Nombre inválido.')
    await col.doc(grupoId).update({ nombre, actualizadoEn: now })
    return { ok: true }
  }
  if (accion === 'disolver') {
    const g = await cargar()
    if (!esGestor(g)) throw new HttpsError('permission-denied', 'Solo el creador o un admin disuelven el grupo.')
    // Borra el grupo y todos sus mensajes (grp_<id>).
    const msgs = await db.collection('bulk_messages').where('tenantId', '==', tenant).where('orderId', '==', 'grp_' + grupoId).get()
    const batch = db.batch()
    msgs.forEach((m) => batch.delete(m.ref))
    batch.delete(col.doc(grupoId))
    await batch.commit()
    return { ok: true }
  }
  throw new HttpsError('invalid-argument', 'Acción no reconocida.')
})

// ============================================================================
// bulkChatPrivado — abre (o recupera) un chat PRIVADO 1-a-1 entre dos personas,
// validando en el BACKEND la MATRIZ de comunicación por roles y la MISMA compañía.
// Espejo de src/bulk/domain/comunicacion.js (mantener ambos en sincronía). Fuente de
// verdad: bulk_users (nunca se confía en datos que envíe el cliente). Crea el registro
// idempotente en bulk_conversaciones (clave pv_ ordenada → nunca se duplica). El envío
// de mensajes usa bulk_messages con `participantes`, cuya lectura ya aíslan las reglas.
// data: { paraUid }
// ============================================================================
const _ROLES_CADENA = ['cliente', 'transportista', 'chofer', 'supervisor_planta']
const _esStaffRol = (rol) => !!rol && !_ROLES_CADENA.includes(rol)
const _clavePar = (a, b) => [a || '', b || ''].sort().join('|')
function _permisoDefecto(a, b) {
  if (!a || !b) return false
  if (_esStaffRol(a) || _esStaffRol(b)) return true
  const set = new Set([a, b])
  const soloDe = (roles) => [...set].every((r) => roles.includes(r))
  if (soloDe(['chofer', 'transportista'])) return true
  if (set.has('supervisor_planta') && soloDe(['supervisor_planta', 'chofer', 'transportista'])) return true
  return false
}
function _puedeChatearRol(a, b, matriz) {
  const pares = (matriz && matriz.pares) || {}
  const k = _clavePar(a, b)
  if (Object.prototype.hasOwnProperty.call(pares, k)) return !!pares[k]
  return _permisoDefecto(a, b)
}
function _mismaCompania(yo, otro) {
  if (!yo || !otro) return false
  if (_esStaffRol(yo.rol) || _esStaffRol(otro.rol)) return true
  if (yo.rol === 'supervisor_planta' || otro.rol === 'supervisor_planta') return true
  if ((yo.rol === 'chofer' || yo.rol === 'transportista') && (otro.rol === 'chofer' || otro.rol === 'transportista')) {
    return !!yo.carrierId && yo.carrierId === otro.carrierId
  }
  return false
}
exports.bulkChatPrivado = onCall(async (req) => {
  const t = req.auth && req.auth.token
  const uid = req.auth && req.auth.uid
  if (!t || !t.bulkTenant || !uid) throw new HttpsError('permission-denied', 'No autorizado.')
  const tenant = t.bulkTenant
  const paraUid = req.data && req.data.paraUid
  if (!paraUid || paraUid === uid) throw new HttpsError('invalid-argument', 'Destinatario inválido.')
  const [yoP, otroP] = await Promise.all([_perfilBulk(uid), _perfilBulk(paraUid)])
  if (!yoP) throw new HttpsError('failed-precondition', 'Tu perfil no está disponible.')
  if (!otroP) throw new HttpsError('not-found', 'El contacto no existe.')
  if (yoP.tenantId !== tenant || otroP.tenantId !== tenant) throw new HttpsError('permission-denied', 'No puedes contactar usuarios de otra empresa.')
  const yo = { uid, rol: yoP.rol, carrierId: yoP.carrierId || null, clienteId: yoP.clienteId || null }
  const otro = { uid: paraUid, rol: otroP.rol, carrierId: otroP.carrierId || null, clienteId: otroP.clienteId || null }
  let matriz = {}
  try { const s = await db.collection('bulk_comMatrix').doc(tenant).get(); if (s.exists) matriz = s.data() || {} } catch (e) { /* usa defaults */ }
  if (!_puedeChatearRol(yo.rol, otro.rol, matriz) || !_mismaCompania(yo, otro)) {
    throw new HttpsError('permission-denied', 'La comunicación entre estos perfiles no está permitida.')
  }
  const participantes = [uid, paraUid].sort()
  const key = 'pv_' + participantes.join('__')
  const now = admin.firestore.FieldValue.serverTimestamp()
  await db.collection('bulk_conversaciones').doc(key).set({
    tenantId: tenant, tipo: 'privado', key, participantes,
    roles: { [uid]: yo.rol, [paraUid]: otro.rol },
    nombres: { [uid]: yoP.nombre || yoP.email || 'Usuario', [paraUid]: otroP.nombre || otroP.email || 'Usuario' },
    creadoPor: uid, creadoEn: now, actualizadoEn: now,
  }, { merge: true })
  return { key, participantes, otro: { uid: paraUid, nombre: otroP.nombre || otroP.email || 'Usuario', rol: otro.rol } }
})

// ============================================================================
// bulkContacto — red de CONTACTOS entre CHOFERES (agregar por ID con consentimiento,
// solicitudes, bloquear, reportar, restringir). Todo validado en el backend. Alcance:
// cualquier chofer del MISMO tenant (empresa); el consentimiento (solicitud aceptada)
// es la autorización, y crea el registro de conversación privada (bulk_conversaciones)
// que habilita el chat pv_. El receptor puede activar "no recibir solicitudes".
// data: { accion, codigo?, paraUid?, requestId?, aceptar?, valor?, motivo? }
// ============================================================================
const _contactosRef = (uid) => db.collection('bulk_contacts').doc(uid)
async function _getContactos(uid) { const s = await _contactosRef(uid).get(); return s.exists ? s.data() : null }
const _pvKey = (a, b) => 'pv_' + [a, b].sort().join('__')
async function _choferPorCodigo(tenant, codigo) {
  const q = await db.collection('bulk_users').where('tenantId', '==', tenant).where('codigo', '==', String(codigo)).limit(3).get()
  const docs = q.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.rol === 'chofer')
  return docs[0] || null
}
async function _agregarContactoMutuo(tenant, a, b, aP, bP) {
  const AU = admin.firestore.FieldValue.arrayUnion
  await _contactosRef(a).set({ tenantId: tenant, uid: a, contactos: AU(b) }, { merge: true })
  await _contactosRef(b).set({ tenantId: tenant, uid: b, contactos: AU(a) }, { merge: true })
  const now = admin.firestore.FieldValue.serverTimestamp()
  const key = _pvKey(a, b)
  // Autoriza el chat privado pv_ (registro que exigen las reglas de bulk_messages).
  await db.collection('bulk_conversaciones').doc(key).set({
    tenantId: tenant, tipo: 'privado', key, participantes: [a, b].sort(),
    roles: { [a]: 'chofer', [b]: 'chofer' },
    nombres: { [a]: (aP && aP.nombre) || 'Chofer', [b]: (bP && bP.nombre) || 'Chofer' },
    creadoPor: a, creadoEn: now, actualizadoEn: now,
  }, { merge: true })
}
async function _quitarContactoMutuo(a, b) {
  const AR = admin.firestore.FieldValue.arrayRemove
  await _contactosRef(a).set({ contactos: AR(b) }, { merge: true }).catch(() => {})
  await _contactosRef(b).set({ contactos: AR(a) }, { merge: true }).catch(() => {})
}

exports.bulkContacto = onCall(async (req) => {
  const t = req.auth && req.auth.token
  const uid = req.auth && req.auth.uid
  if (!t || !t.bulkTenant || !uid) throw new HttpsError('permission-denied', 'No autorizado.')
  if (t.bulkRole !== 'chofer') throw new HttpsError('permission-denied', 'La red de contactos es solo para choferes.')
  const tenant = t.bulkTenant
  const { accion } = req.data || {}
  const now = admin.firestore.FieldValue.serverTimestamp()
  const yo = await _perfilBulk(uid)
  if (!yo) throw new HttpsError('failed-precondition', 'Tu perfil no está disponible.')
  const reqs = db.collection('bulk_contactRequests')

  if (accion === 'buscar') {
    const codigo = String(req.data.codigo || '').trim()
    if (!codigo) throw new HttpsError('invalid-argument', 'Ingresa un ID de chofer.')
    const c = await _choferPorCodigo(tenant, codigo)
    if (!c) return { encontrado: false }
    if (c.uid === uid) return { encontrado: false, esYo: true }
    return { encontrado: true, chofer: { uid: c.uid, nombre: c.nombre || 'Chofer', codigo: c.codigo || null } }
  }

  const resolverTarget = async () => {
    if (req.data.paraUid) { const p = await _perfilBulk(req.data.paraUid); return p ? { uid: req.data.paraUid, ...p } : null }
    if (req.data.codigo) return await _choferPorCodigo(tenant, String(req.data.codigo).trim())
    return null
  }

  if (accion === 'solicitar') {
    const target = await resolverTarget()
    if (!target) throw new HttpsError('not-found', 'No se encontró ese chofer.')
    const paraUid = target.uid
    if (paraUid === uid) throw new HttpsError('invalid-argument', 'No puedes agregarte a ti mismo.')
    if (target.tenantId !== tenant || target.rol !== 'chofer') throw new HttpsError('permission-denied', 'Solo puedes agregar choferes de tu empresa.')
    const misC = await _getContactos(uid)
    if (misC && (misC.contactos || []).includes(paraUid)) throw new HttpsError('failed-precondition', 'Ya es tu contacto.')
    if (misC && (misC.bloqueados || []).includes(paraUid)) throw new HttpsError('failed-precondition', 'Tienes bloqueado a este chofer. Desbloquéalo primero.')
    const suC = await _getContactos(paraUid)
    if (suC && (suC.bloqueados || []).includes(uid)) throw new HttpsError('permission-denied', 'No se pudo enviar la solicitud.')
    if (suC && suC.noSolicitudes === true) throw new HttpsError('permission-denied', 'Este chofer no está aceptando solicitudes por ahora.')
    // Si el OTRO ya me envió una solicitud pendiente → se agregan mutuamente (match).
    const inversa = await reqs.where('deUid', '==', paraUid).where('paraUid', '==', uid).where('estado', '==', 'pendiente').limit(1).get()
    if (!inversa.empty) {
      await _agregarContactoMutuo(tenant, uid, paraUid, yo, target)
      await inversa.docs[0].ref.set({ estado: 'aceptada', resueltoEn: now }, { merge: true })
      return { ok: true, aceptadaMutua: true }
    }
    const dup = await reqs.where('deUid', '==', uid).where('paraUid', '==', paraUid).where('estado', '==', 'pendiente').limit(1).get()
    if (!dup.empty) throw new HttpsError('failed-precondition', 'Ya enviaste una solicitud a este chofer.')
    await reqs.add({
      tenantId: tenant, deUid: uid, deNombre: yo.nombre || 'Chofer', deCodigo: yo.codigo || null,
      paraUid, paraNombre: target.nombre || 'Chofer', paraCodigo: target.codigo || null,
      estado: 'pendiente', creadoEn: now,
    })
    return { ok: true }
  }

  if (accion === 'responder') {
    const { requestId, aceptar } = req.data
    if (!requestId) throw new HttpsError('invalid-argument', 'Falta la solicitud.')
    const ref = reqs.doc(requestId)
    const s = await ref.get()
    if (!s.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.')
    const r = s.data()
    if (r.paraUid !== uid || r.tenantId !== tenant) throw new HttpsError('permission-denied', 'No autorizado.')
    if (r.estado !== 'pendiente') return { ok: true }
    if (aceptar) {
      const other = await _perfilBulk(r.deUid)
      await _agregarContactoMutuo(tenant, uid, r.deUid, yo, other || { nombre: r.deNombre })
      await ref.set({ estado: 'aceptada', resueltoEn: now }, { merge: true })
      return { ok: true, aceptada: true }
    }
    await ref.set({ estado: 'rechazada', resueltoEn: now }, { merge: true })
    return { ok: true, aceptada: false }
  }

  if (accion === 'eliminar') {
    const otro = req.data.paraUid
    if (!otro) throw new HttpsError('invalid-argument', 'Falta el contacto.')
    await _quitarContactoMutuo(uid, otro)
    await db.collection('bulk_conversaciones').doc(_pvKey(uid, otro)).delete().catch(() => {})
    return { ok: true }
  }
  if (accion === 'bloquear') {
    const otro = req.data.paraUid
    if (!otro) throw new HttpsError('invalid-argument', 'Falta el contacto.')
    await _quitarContactoMutuo(uid, otro)
    await _contactosRef(uid).set({ tenantId: tenant, uid, bloqueados: admin.firestore.FieldValue.arrayUnion(otro) }, { merge: true })
    await db.collection('bulk_conversaciones').doc(_pvKey(uid, otro)).delete().catch(() => {})
    return { ok: true }
  }
  if (accion === 'desbloquear') {
    await _contactosRef(uid).set({ tenantId: tenant, uid, bloqueados: admin.firestore.FieldValue.arrayRemove(req.data.paraUid) }, { merge: true })
    return { ok: true }
  }
  if (accion === 'restringir') {
    await _contactosRef(uid).set({ tenantId: tenant, uid, noSolicitudes: !!req.data.valor }, { merge: true })
    return { ok: true }
  }
  if (accion === 'reportar') {
    await db.collection('bulk_reports').add({ tenantId: tenant, deUid: uid, contraUid: req.data.paraUid || null, motivo: String(req.data.motivo || '').slice(0, 500), creadoEn: now })
    return { ok: true }
  }
  throw new HttpsError('invalid-argument', 'Acción no reconocida.')
})

// ============================================================================
// bulkMailboxOp — administra las direcciones del dominio (buzones y alias) en
// Google Workspace vía Admin SDK (Directory API). SOLO super_admin/admin.
// Credenciales SOLO en el backend (variables de entorno / Secret Manager):
//   GOOGLE_ADMIN_SA_B64  → JSON de la cuenta de servicio (con delegación domain-wide), en base64
//   GOOGLE_ADMIN_SUBJECT → email del admin del dominio a impersonar (ej. admin@milepay.com)
//   GOOGLE_DOMAIN        → dominio (por defecto milepay.com)
// Espeja el resultado en Firestore `bulk_mailboxes` y audita en `bulk_audit`.
// ============================================================================
const GWS_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.user.alias',
]
async function directorioGoogle() {
  const b64 = process.env.GOOGLE_ADMIN_SA_B64
  const subject = process.env.GOOGLE_ADMIN_SUBJECT
  if (!b64 || !subject) throw new HttpsError('failed-precondition', 'Correo del dominio no configurado (falta la cuenta de servicio de Google en el backend).')
  let google
  try { ({ google } = require('googleapis')) } catch { throw new HttpsError('failed-precondition', 'Falta instalar la dependencia googleapis en las Cloud Functions.') }
  const cred = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  const auth = new google.auth.JWT({ email: cred.client_email, key: cred.private_key, scopes: GWS_SCOPES, subject })
  await auth.authorize()
  return { dir: google.admin({ version: 'directory_v1', auth }), dominio: process.env.GOOGLE_DOMAIN || 'milepay.io' }
}
async function _auditMail(tenant, actor, accion, detalle) {
  try { await db.collection('bulk_audit').add({ tenantId: tenant, usuario: actor, accion, entidad: 'correo', detalle, ts: new Date().toISOString() }) } catch { /* noop */ }
}

exports.bulkMailboxOp = onCall({ secrets: ['GOOGLE_ADMIN_SA_B64', 'GOOGLE_ADMIN_SUBJECT'] }, async (req) => {
  const tk = req.auth && req.auth.token
  if (!esAdminClaim(tk)) throw new HttpsError('permission-denied', 'Solo el administrador puede gestionar los correos del dominio.')
  const tenant = tk.bulkTenant
  const actor = (req.auth.token.email) || tk.bulkUid || 'admin'
  const { op, id, direccion, destino, nombreVisible, password, uso } = req.data || {}
  const col = db.collection('bulk_mailboxes')

  // Listar/sincronizar: NO requiere argumentos; refleja Google → Firestore.
  if (op === 'listar') {
    const { dir, dominio } = await directorioGoogle()
    const r = await dir.users.list({ domain: dominio, maxResults: 200, projection: 'full' })
    const usuarios = r.data.users || []
    const batch = db.batch()
    for (const u of usuarios) {
      const primary = u.primaryEmail
      batch.set(col.doc(primary.replace(/[^a-z0-9]/gi, '_')), {
        tenantId: tenant, direccion: primary, tipo: 'buzon', nombreVisible: u.name?.fullName || '',
        estado: u.suspended ? 'suspendida' : 'activa', googleUserId: u.id, creadoEn: u.creationTime || null, sincronizadoEn: new Date().toISOString(),
      }, { merge: true })
      for (const al of (u.aliases || [])) {
        batch.set(col.doc(al.replace(/[^a-z0-9]/gi, '_')), {
          tenantId: tenant, direccion: al, tipo: 'alias', destino: primary, estado: 'activa', sincronizadoEn: new Date().toISOString(),
        }, { merge: true })
      }
    }
    await batch.commit()
    return { ok: true, mensaje: `Sincronizadas ${usuarios.length} cuentas del dominio.` }
  }

  if (op === 'crear_buzon') {
    if (!direccion || !password) throw new HttpsError('invalid-argument', 'Dirección y contraseña son obligatorias.')
    const { dir } = await directorioGoogle()
    const partes = (nombreVisible || direccion.split('@')[0]).split(' ')
    const u = await dir.users.insert({ requestBody: { primaryEmail: direccion, password, name: { givenName: partes[0] || direccion, familyName: partes.slice(1).join(' ') || '·' }, changePasswordAtNextLogin: true } })
    await col.doc(direccion.replace(/[^a-z0-9]/gi, '_')).set({ tenantId: tenant, direccion, tipo: 'buzon', nombreVisible: nombreVisible || '', uso: uso || '', estado: 'activa', googleUserId: u.data.id, creadoEn: new Date().toISOString(), creadoPor: actor }, { merge: true })
    await _auditMail(tenant, actor, 'crear_buzon', direccion)
    return { ok: true, mensaje: `Buzón ${direccion} creado.` }
  }

  if (op === 'crear_alias') {
    if (!direccion || !destino) throw new HttpsError('invalid-argument', 'Dirección y buzón destino son obligatorios.')
    const { dir } = await directorioGoogle()
    await dir.users.aliases.insert({ userKey: destino, requestBody: { alias: direccion } })
    await col.doc(direccion.replace(/[^a-z0-9]/gi, '_')).set({ tenantId: tenant, direccion, tipo: 'alias', destino, uso: uso || '', estado: 'activa', creadoEn: new Date().toISOString(), creadoPor: actor }, { merge: true })
    await _auditMail(tenant, actor, 'crear_alias', `${direccion} → ${destino}`)
    return { ok: true, mensaje: `Alias ${direccion} creado.` }
  }

  // Las demás operaciones parten del doc espejo.
  const snap = id ? await col.doc(id).get() : null
  const m = snap && snap.exists ? snap.data() : null
  if (!m) throw new HttpsError('not-found', 'Dirección no encontrada.')

  if (op === 'editar') {
    const { dir } = await directorioGoogle()
    if (m.tipo === 'buzon' && nombreVisible) {
      const partes = nombreVisible.split(' ')
      await dir.users.update({ userKey: m.direccion, requestBody: { name: { givenName: partes[0], familyName: partes.slice(1).join(' ') || '·' } } })
    }
    if (m.tipo === 'alias' && destino && destino !== m.destino) {
      await dir.users.aliases.delete({ userKey: m.destino, alias: m.direccion })
      await dir.users.aliases.insert({ userKey: destino, requestBody: { alias: m.direccion } })
    }
    await col.doc(id).set({ nombreVisible: nombreVisible ?? m.nombreVisible, destino: destino ?? m.destino, uso: uso ?? m.uso, actualizadoEn: new Date().toISOString() }, { merge: true })
    await _auditMail(tenant, actor, 'editar_correo', m.direccion)
    return { ok: true, mensaje: 'Dirección actualizada.' }
  }

  if (op === 'suspender' || op === 'reactivar') {
    const suspender = op === 'suspender'
    if (m.tipo === 'buzon') { const { dir } = await directorioGoogle(); await dir.users.update({ userKey: m.direccion, requestBody: { suspended: suspender } }) }
    await col.doc(id).set({ estado: suspender ? 'suspendida' : 'activa', actualizadoEn: new Date().toISOString() }, { merge: true })
    await _auditMail(tenant, actor, op, m.direccion)
    return { ok: true, mensaje: suspender ? 'Dirección suspendida.' : 'Dirección reactivada.' }
  }

  if (op === 'eliminar') {
    const { dir } = await directorioGoogle()
    if (m.tipo === 'buzon') await dir.users.delete({ userKey: m.direccion })
    else await dir.users.aliases.delete({ userKey: m.destino, alias: m.direccion })
    await col.doc(id).delete()
    await _auditMail(tenant, actor, 'eliminar_correo', m.direccion)
    return { ok: true, mensaje: 'Dirección eliminada.' }
  }

  throw new HttpsError('invalid-argument', 'Operación no reconocida.')
})

// ============================================================================
// bulkGmailOp — bandeja de correo (CRM) de los buzones del dominio vía Gmail API.
// SOLO super_admin/admin. Impersona el BUZÓN elegido (delegación domain-wide) y
// permite listar/leer/enviar/borradores y marcar (leído, spam, papelera).
// Requiere añadir a la delegación del robot los scopes gmail.modify y gmail.send.
// ============================================================================
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send']
const CARPETA_LABEL = { recibidos: 'INBOX', enviados: 'SENT', borradores: 'DRAFT', spam: 'SPAM', papelera: 'TRASH' }

async function gmailDe(buzon) {
  const b64 = process.env.GOOGLE_ADMIN_SA_B64
  if (!b64) throw new HttpsError('failed-precondition', 'Correo no configurado (falta la cuenta de servicio en el backend).')
  let google
  try { ({ google } = require('googleapis')) } catch { throw new HttpsError('failed-precondition', 'Falta instalar googleapis en las Cloud Functions.') }
  const cred = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  const auth = new google.auth.JWT({ email: cred.client_email, key: cred.private_key, scopes: GMAIL_SCOPES, subject: buzon })
  try { await auth.authorize() } catch (e) {
    throw new HttpsError('failed-precondition', 'Google rechazó el acceso al buzón. Revisa que la delegación tenga los scopes de Gmail (gmail.modify y gmail.send). Detalle: ' + (e.message || ''))
  }
  return google.gmail({ version: 'v1', auth })
}

const _hdr = (headers, name) => { const h = (headers || []).find((x) => (x.name || '').toLowerCase() === name.toLowerCase()); return h ? h.value : '' }
const _b64urlDec = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
// Recorre las partes MIME del mensaje y extrae texto, html y adjuntos (solo metadatos).
function _cuerpoDe(payload) {
  const out = { text: '', html: '', adjuntos: [] }
  const walk = (p) => {
    if (!p) return
    const mime = p.mimeType || ''
    if (p.filename) out.adjuntos.push({ nombre: p.filename, tipo: mime, bytes: (p.body && p.body.size) || 0, adjId: (p.body && p.body.attachmentId) || null })
    else if (mime === 'text/plain' && p.body && p.body.data && !out.text) out.text = _b64urlDec(p.body.data)
    else if (mime === 'text/html' && p.body && p.body.data && !out.html) out.html = _b64urlDec(p.body.data)
    ;(p.parts || []).forEach(walk)
  }
  walk(payload)
  return out
}
const _subjEnc = (s) => `=?UTF-8?B?${Buffer.from(String(s || ''), 'utf8').toString('base64')}?=`
// Arma el correo MIME. Con `cuerpoHtml` (firma corporativa) va multipart/alternative
// (texto + HTML); con `adjuntos` [{nombre,tipo,datab64}] todo se envuelve en
// multipart/mixed — el formato estándar de un correo real con archivos.
function _mimeRaw({ de, para, cc, asunto, cuerpo, cuerpoHtml, inReplyTo, adjuntos = [] }) {
  const head = [
    `From: ${de}`,
    `To: ${para}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${_subjEnc(asunto)}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'MIME-Version: 1.0',
  ]
  const textB64 = Buffer.from(String(cuerpo || ''), 'utf8').toString('base64')
  let contenido
  if (cuerpoHtml) {
    const b = 'bnd_milepay_alt'
    contenido = [
      `Content-Type: multipart/alternative; boundary="${b}"`, '',
      `--${b}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', textB64,
      `--${b}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(String(cuerpoHtml), 'utf8').toString('base64'),
      `--${b}--`,
    ]
  } else {
    contenido = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', textB64]
  }
  let L
  if (adjuntos.length) {
    const m = 'bnd_milepay_mix'
    L = [...head, `Content-Type: multipart/mixed; boundary="${m}"`, '', `--${m}`, ...contenido]
    for (const a of adjuntos) {
      const nombre = String(a.nombre || 'archivo').replace(/"/g, '')
      const fn = /[^\x20-\x7E]/.test(nombre) ? _subjEnc(nombre) : nombre
      L.push(
        `--${m}`,
        `Content-Type: ${a.tipo || 'application/octet-stream'}; name="${fn}"`,
        `Content-Disposition: attachment; filename="${fn}"`,
        'Content-Transfer-Encoding: base64', '',
        String(a.datab64 || ''),
      )
    }
    L.push(`--${m}--`)
  } else {
    L = [...head, ...contenido]
  }
  return Buffer.from(L.join('\r\n'), 'utf8').toString('base64url')
}
// Valida los adjuntos que llegan del frontend (máx. 5 archivos, ~7MB en total).
function _validarAdjuntos(adjuntos) {
  const lista = Array.isArray(adjuntos) ? adjuntos : []
  if (lista.length > 5) throw new HttpsError('invalid-argument', 'Máximo 5 archivos adjuntos por correo.')
  const total = lista.reduce((a, x) => a + (String(x.datab64 || '').length * 0.75), 0)
  if (total > 7 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Los adjuntos superan el límite de 7 MB en total.')
  return lista
}

exports.bulkGmailOp = onCall({ secrets: ['GOOGLE_ADMIN_SA_B64'], timeoutSeconds: 60 }, async (req) => {
  const tk = req.auth && req.auth.token
  if (!esAdminClaim(tk)) throw new HttpsError('permission-denied', 'Solo el administrador puede usar la bandeja de correo.')
  const { op, buzon, carpeta, pageToken, id, para, cc, asunto, cuerpo, cuerpoHtml, de, accion, threadId, inReplyTo, q, adjuntos, adjId } = req.data || {}
  if (!buzon) throw new HttpsError('invalid-argument', 'Falta el buzón.')
  // Solo se pueden abrir buzones ADMINISTRADOS por el panel (espejo bulk_mailboxes).
  const qq = await db.collection('bulk_mailboxes').where('direccion', '==', buzon).where('tipo', '==', 'buzon').limit(1).get()
  if (qq.empty) throw new HttpsError('permission-denied', 'Ese buzón no está administrado por el panel (usa Sincronizar primero).')
  const gmail = await gmailDe(buzon)

  // Resumen para el dashboard: totales y no leídos por carpeta (labels de Gmail),
  // pedidos en paralelo para responder rápido.
  if (op === 'resumen') {
    const entradas = Object.entries(CARPETA_LABEL)
    const rs = await Promise.all(entradas.map(([, label]) => gmail.users.labels.get({ userId: 'me', id: label }).catch(() => null)))
    const out = {}
    entradas.forEach(([k], i) => {
      out[k] = rs[i] ? { total: rs[i].data.messagesTotal || 0, noLeidos: rs[i].data.messagesUnread || 0 } : { total: 0, noLeidos: 0 }
    })
    return { ok: true, resumen: out }
  }

  if (op === 'listar') {
    const label = CARPETA_LABEL[carpeta] || 'INBOX'
    const lst = await gmail.users.messages.list({ userId: 'me', labelIds: [label], maxResults: 25, pageToken: pageToken || undefined, q: q || undefined })
    const ids = lst.data.messages || []
    // Los metadatos se piden EN PARALELO (antes era uno por uno y la bandeja se
    // sentía colgada en "Cargando…" con el arranque en frío).
    const gets = await Promise.all(ids.map((m) =>
      gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'] }).catch(() => null)
    ))
    const mensajes = []
    gets.forEach((g, i) => {
      if (!g) return
      const h = (g.data.payload && g.data.payload.headers) || []
      mensajes.push({
        id: ids[i].id, threadId: g.data.threadId,
        de: _hdr(h, 'From'), para: _hdr(h, 'To'), asunto: _hdr(h, 'Subject'), fecha: _hdr(h, 'Date'),
        resumen: g.data.snippet || '', noLeido: (g.data.labelIds || []).includes('UNREAD'),
      })
    })
    return { ok: true, mensajes, siguiente: lst.data.nextPageToken || null }
  }

  if (op === 'leer') {
    if (!id) throw new HttpsError('invalid-argument', 'Falta el id del mensaje.')
    const g = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    const h = (g.data.payload && g.data.payload.headers) || []
    const c = _cuerpoDe(g.data.payload)
    try { await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } }) } catch { /* noop */ }
    return {
      ok: true,
      mensaje: {
        id, threadId: g.data.threadId, de: _hdr(h, 'From'), para: _hdr(h, 'To'), cc: _hdr(h, 'Cc'),
        asunto: _hdr(h, 'Subject'), fecha: _hdr(h, 'Date'), messageId: _hdr(h, 'Message-ID'),
        texto: c.text, html: c.html, adjuntos: c.adjuntos,
      },
    }
  }

  if (op === 'enviar') {
    if (!para || !asunto) throw new HttpsError('invalid-argument', 'Faltan destinatario o asunto.')
    const raw = _mimeRaw({ de: de || buzon, para, cc, asunto, cuerpo, cuerpoHtml, inReplyTo, adjuntos: _validarAdjuntos(adjuntos) })
    const r = await gmail.users.messages.send({ userId: 'me', requestBody: { raw, ...(threadId ? { threadId } : {}) } })
    await _auditMail(tk.bulkTenant, (req.auth.token.email) || 'admin', 'correo_enviado', `${de || buzon} → ${para} · ${asunto}`)
    return { ok: true, id: r.data.id, mensaje: 'Correo enviado.' }
  }

  if (op === 'borrador') {
    const raw = _mimeRaw({ de: de || buzon, para: para || '', cc, asunto: asunto || '', cuerpo, cuerpoHtml, adjuntos: _validarAdjuntos(adjuntos) })
    await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } })
    return { ok: true, mensaje: 'Borrador guardado.' }
  }

  // Descargar UN adjunto de un mensaje (devuelve el contenido en base64url).
  if (op === 'adjunto') {
    if (!id || !adjId) throw new HttpsError('invalid-argument', 'Faltan el mensaje o el adjunto.')
    const r = await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: adjId })
    if ((r.data.size || 0) > 9 * 1024 * 1024) throw new HttpsError('resource-exhausted', 'El adjunto supera los 9 MB; descárgalo desde Gmail.')
    return { ok: true, datab64: r.data.data || '' }
  }

  if (op === 'marcar') {
    if (!id) throw new HttpsError('invalid-argument', 'Falta el id del mensaje.')
    if (accion === 'papelera') await gmail.users.messages.trash({ userId: 'me', id })
    else if (accion === 'restaurar') await gmail.users.messages.untrash({ userId: 'me', id })
    else {
      const map = {
        leido: { removeLabelIds: ['UNREAD'] },
        noleido: { addLabelIds: ['UNREAD'] },
        spam: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
        nospam: { removeLabelIds: ['SPAM'], addLabelIds: ['INBOX'] },
      }
      if (!map[accion]) throw new HttpsError('invalid-argument', 'Acción no reconocida.')
      await gmail.users.messages.modify({ userId: 'me', id, requestBody: map[accion] })
    }
    return { ok: true }
  }

  throw new HttpsError('invalid-argument', 'Operación no reconocida.')
})

// ============================================================================
// bulkMeetingOp — REUNIONES (videollamadas/voz con link de invitación) vía Daily.co.
// MilePay orquesta salas y links; Daily maneja el audio/video (Prebuilt embebido).
// Secreto: DAILY_API_KEY. Los invitados EXTERNOS entran SIN cuenta con op 'invitado':
// única puerta pública — valida el código y entrega un token SOLO para esa sala.
// ============================================================================
const PUEDE_REUNION = ['super_admin', 'admin', 'dispatcher', 'supervisor_planta', 'transportista', 'cliente']
async function dailyAPI(metodo, ruta, body) {
  const key = process.env.DAILY_API_KEY
  if (!key) throw new HttpsError('failed-precondition', 'Reuniones no configuradas (falta DAILY_API_KEY en el backend).')
  const r = await fetch('https://api.daily.co/v1' + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new HttpsError('internal', 'Proveedor de video: ' + (data.info || data.error || r.status))
  return data
}
const _codigoReunion = () => Array.from({ length: 10 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('')

exports.bulkMeetingOp = onCall({ secrets: ['DAILY_API_KEY'], timeoutSeconds: 30 }, async (req) => {
  const tk = req.auth && req.auth.token
  const { op, id, codigo, nombre, titulo, tipo, programadaPara } = req.data || {}
  const col = db.collection('bulk_meetings')

  // ── PÚBLICO (sin cuenta): entrar como INVITADO con el código del link ──────
  if (op === 'invitado') {
    const nom = String(nombre || '').trim().slice(0, 60)
    if (!codigo || !nom) throw new HttpsError('invalid-argument', 'Faltan el código de la reunión o tu nombre.')
    const q = await col.where('codigo', '==', String(codigo)).limit(1).get()
    if (q.empty) throw new HttpsError('not-found', 'Esta reunión no existe o el link es inválido.')
    const m = q.docs[0].data()
    if (m.estado === 'finalizada') throw new HttpsError('failed-precondition', 'Esta reunión ya no está disponible.')
    const t = await dailyAPI('POST', '/meeting-tokens', { properties: { room_name: m.salaNombre, user_name: nom, is_owner: false, exp: Math.floor(Date.now() / 1000) + 6 * 3600 } })
    await q.docs[0].ref.set({ participantes: admin.firestore.FieldValue.arrayUnion({ nombre: nom, externo: true, entro: new Date().toISOString() }) }, { merge: true }).catch(() => {})
    return { ok: true, url: m.salaUrl, token: t.token, titulo: m.titulo || 'Reunión', tipo: m.tipo || 'video' }
  }

  // ── Resto: usuarios de MilePay con permiso ──────────────────────────────────
  if (!tk || !PUEDE_REUNION.includes(tk.bulkRole)) throw new HttpsError('permission-denied', 'No tienes permiso para gestionar reuniones.')
  // Los roles de la cadena (supervisor/transportista/cliente) solo pueden CREAR su
  // reunión y compartir el link con quien su chat les permita; administrar (finalizar,
  // invitar por correo, listar) sigue siendo del staff.
  if (!['super_admin', 'admin', 'dispatcher'].includes(tk.bulkRole) && op !== 'crear') {
    throw new HttpsError('permission-denied', 'Solo puedes crear reuniones; la gestión es del administrador.')
  }
  const tenant = tk.bulkTenant
  const actor = (req.auth.token.email) || 'staff'

  if (op === 'crear') {
    const cod = _codigoReunion()
    const esVoz = tipo === 'voz'
    const sala = await dailyAPI('POST', '/rooms', {
      name: 'mp-' + cod,
      privacy: 'private',
      properties: {
        enable_knocking: true, enable_prejoin_ui: true, enable_screenshare: true, enable_chat: true,
        start_video_off: esVoz, start_audio_off: false,
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      },
    })
    const doc = await col.add({
      tenantId: tenant, titulo: String(titulo || (esVoz ? 'Llamada de voz' : 'Videollamada')).slice(0, 120), tipo: esVoz ? 'voz' : 'video',
      codigo: cod, salaNombre: sala.name, salaUrl: sala.url,
      estado: programadaPara ? 'programada' : 'en_vivo',
      programadaPara: programadaPara || null, inicio: programadaPara ? null : new Date().toISOString(), fin: null, duracionMin: 0,
      creadorId: req.auth.uid, creadorNombre: actor, creadaEn: new Date().toISOString(), participantes: [],
    })
    await db.collection('bulk_audit').add({ tenantId: tenant, usuario: actor, accion: 'crear_reunion', entidad: 'reunion', detalle: `${titulo || ''} · ${cod}`, ts: new Date().toISOString() }).catch(() => {})
    return { ok: true, id: doc.id, codigo: cod }
  }

  const snap = id ? await col.doc(id).get() : null
  const m = snap && snap.exists ? snap.data() : null
  if (!m || m.tenantId !== tenant) throw new HttpsError('not-found', 'Reunión no encontrada.')

  // Entrar como ANFITRIÓN/miembro de MilePay (owner: entra directo y admite del lobby).
  if (op === 'token') {
    if (m.estado === 'finalizada') throw new HttpsError('failed-precondition', 'Esta reunión ya finalizó.')
    const t = await dailyAPI('POST', '/meeting-tokens', { properties: { room_name: m.salaNombre, user_name: String(nombre || actor).slice(0, 60), is_owner: true, exp: Math.floor(Date.now() / 1000) + 12 * 3600 } })
    if (m.estado === 'programada') {
      await snap.ref.set({ estado: 'en_vivo', inicio: new Date().toISOString() }, { merge: true })
      await db.collection('bulk_audit').add({ tenantId: tenant, usuario: actor, accion: 'iniciar_reunion', entidad: 'reunion', detalle: m.titulo || '', ts: new Date().toISOString() }).catch(() => {})
    }
    return { ok: true, url: m.salaUrl, token: t.token, titulo: m.titulo, tipo: m.tipo }
  }

  if (op === 'finalizar') {
    try { await dailyAPI('DELETE', '/rooms/' + m.salaNombre) } catch { /* la sala pudo expirar ya */ }
    const fin = new Date().toISOString()
    const durMin = m.inicio ? Math.max(1, Math.round((Date.parse(fin) - Date.parse(m.inicio)) / 60000)) : 0
    await snap.ref.set({ estado: 'finalizada', fin, duracionMin: durMin }, { merge: true })
    await db.collection('bulk_audit').add({ tenantId: tenant, usuario: actor, accion: 'finalizar_reunion', entidad: 'reunion', detalle: `${m.titulo || ''} · ${durMin} min`, ts: new Date().toISOString() }).catch(() => {})
    return { ok: true, mensaje: 'Reunión finalizada.' }
  }

  throw new HttpsError('invalid-argument', 'Operación no reconocida.')
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
// bulkPushLlamada — PUSH al crearse una LLAMADA entrante (bulk_calls). Avisa al
// destinatario aunque tenga la app en segundo plano; al tocar la notificación se
// abre Mensajes y (si sigue vigente) entra la llamada.
// ============================================================================
exports.bulkPushLlamada = onDocumentCreated('bulk_calls/{id}', async (event) => {
  const c = (event.data && event.data.data()) || {}
  if (!c.tenantId || !c.para) return
  const dest = await tokensDe(c.tenantId, (x) => x.uid === c.para)
  const tipo = c.tipo === 'video' ? 'Videollamada' : 'Llamada'
  await enviarAPI(dest, `📞 ${tipo} entrante`, `${(c.de && c.de.nombre) || 'Alguien'} te está llamando`, 'https://www.milepay.io/bulk/mensajes')
})

// ============================================================================
// bulkPushSala — PUSH al crearse una LLAMADA GRUPAL (bulk_salas). Avisa a TODOS
// los invitados aunque tengan la app en segundo plano.
// ============================================================================
exports.bulkPushSala = onDocumentCreated('bulk_salas/{id}', async (event) => {
  const s = (event.data && event.data.data()) || {}
  const invitados = Array.isArray(s.invitados) ? s.invitados : []
  if (!s.tenantId || !invitados.length) return
  const dest = await tokensDe(s.tenantId, (x) => invitados.includes(x.uid))
  const tipo = s.tipo === 'video' ? 'Videollamada grupal' : 'Llamada grupal'
  await enviarAPI(dest, `📞 ${tipo}`, `${s.creadaPorNombre || 'Alguien'} te invitó a ${s.nombre || 'una llamada grupal'}`, 'https://www.milepay.io/bulk/mensajes')
})

// ============================================================================
// bulkPushGeocerca — PUSH al ENTRAR/SALIR un chofer de una geocerca (bulk_geoeventos).
// Destinatarios: ADMIN + TRANSPORTISTA (el del carrier del evento) + STAFF. El CHOFER y
// el CLIENTE quedan EXCLUIDOS por completo. Incluye nombre e ID del chofer, unidad,
// geocerca, tipo de evento y fecha/hora.
// ============================================================================
exports.bulkPushGeocerca = onDocumentCreated('bulk_geoeventos/{id}', async (event) => {
  const e = (event.data && event.data.data()) || {}
  if (!e.tenantId || !e.evento) return
  const esEntrada = e.evento === 'entrada'
  const titulo = esEntrada ? '🚨 Entrada a geocerca' : '🔔 Salida de geocerca'
  const idTxt = e.choferCodigo ? ` (ID: ${e.choferCodigo})` : ''
  const unidadTxt = e.unidad ? ` · Unidad ${e.unidad}` : ''
  const cuerpo = `${e.choferNombre || 'Chofer'}${idTxt} ${esEntrada ? 'entró a' : 'salió de'} ${e.geocerca || 'la geocerca'}${unidadTxt}`
  // Admin + Staff (cualquier rol que no sea de la cadena) + el transportista del carrier.
  // NUNCA chofer ni cliente.
  const dest = await tokensDe(e.tenantId, (x) => {
    if (x.rol === 'chofer' || x.rol === 'cliente') return false
    if (x.rol === 'transportista') return !!e.carrierId && x.carrierId === e.carrierId
    return true // super_admin, admin, dispatcher, supervisor y roles personalizados de staff
  })
  await enviarAPI(dest, titulo, cuerpo, 'https://www.milepay.io/bulk/mapa')
})

// ============================================================================
// bulkRecordatoriosFacturas — PUSH programado de COBRO. Una vez al día revisa las
// facturas POR COBRAR (estado enviada/firmada) y avisa cuando están POR VENCER
// (≤3 días) o VENCIDAS. Empuja al STAFF (para gestionar el cobro) y al CLIENTE dueño
// de la factura (recordatorio de pago). No repite: marca la ETAPA ya avisada en la
// propia factura (`recordatorioEtapa`), así solo notifica al ENTRAR a cada etapa.
// ============================================================================
const _dias = (venceISO) => {
  if (!venceISO) return null
  const ms = Date.parse(String(venceISO).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(ms)) return null
  return Math.ceil((ms - Date.now()) / 86400000)
}
const _montoTxt = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`
const _venceTxt = (d) => d < 0 ? `venció hace ${Math.abs(d)} día(s)` : d === 0 ? 'vence hoy' : `vence en ${d} día(s)`

exports.bulkRecordatoriosFacturas = onSchedule({ schedule: 'every day 09:00', timeZone: 'America/Mexico_City' }, async () => {
  const snap = await db.collection('bulk_invoices').where('estado', 'in', ['enviada', 'firmada']).get()
  for (const doc of snap.docs) {
    const f = doc.data() || {}
    if (!f.tenantId) continue
    const d = _dias(f.vence)
    if (d == null) continue
    const etapa = d < 0 ? 'vencido' : (d <= 3 ? 'proximo' : null)
    if (!etapa) continue
    if (f.recordatorioEtapa === etapa) continue // ya se avisó esta etapa; no repetir
    const numero = f.numero || ''
    const monto = _montoTxt(f.total)
    const urlStaff = 'https://www.milepay.io/bulk/facturacion'
    const urlCliente = 'https://www.milepay.io/bulk'
    // Staff (gestión de cobro)
    const staff = await tokensDe(f.tenantId, (x) => STAFF.includes(x.rol))
    await enviarAPI(
      staff,
      etapa === 'vencido' ? '🔴 Factura vencida' : '🟠 Factura por vencer',
      `${numero} · ${f.clienteNombre || 'Cliente'} · ${monto} · ${_venceTxt(d)}`,
      urlStaff,
    )
    // Cliente dueño de la factura (recordatorio de pago)
    if (f.clienteId) {
      const cli = await tokensDe(f.tenantId, (x) => x.rol === 'cliente' && x.clienteId === f.clienteId)
      await enviarAPI(
        cli,
        etapa === 'vencido' ? 'Factura vencida' : 'Recordatorio de pago',
        `${numero} · ${monto} · ${_venceTxt(d)}`,
        urlCliente,
      )
    }
    await doc.ref.set({ recordatorioEtapa: etapa, recordatorioEn: new Date().toISOString() }, { merge: true }).catch(() => {})
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
    // No tocar las que ya están asignadas a un transporte (transportistaId): ese
    // carrier les pone un chofer desde su Cola. El matcher solo reparte las libres.
    .filter((o) => PENDIENTES.includes(o.estado) && !o.transportistaId)
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

// ============================================================================
// bulkPlacesOp — búsqueda/autocompletado de direcciones con Google Places para
// las GEOCERCAS. La API key vive en Secret Manager (GOOGLE_MAPS_API_KEY): el
// frontend NUNCA la ve; llama a esta función y recibe solo los resultados.
//   op 'autocomplete' { q }        → { sugerencias: [{ placeId, texto }] }
//   op 'detalles'     { placeId }  → { placeId, direccion, ciudad, estado, zip, lat, lng }
// ============================================================================
exports.bulkPlacesOp = onCall({ secrets: ['GOOGLE_MAPS_API_KEY'], timeoutSeconds: 15 }, async (req) => {
  const tk = req.auth && req.auth.token
  if (!tk || !tk.bulkTenant) throw new HttpsError('permission-denied', 'No autorizado.')
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) throw new HttpsError('failed-precondition', 'Falta configurar el secreto GOOGLE_MAPS_API_KEY (Places API).')
  const op = req.data && req.data.op

  if (op === 'autocomplete') {
    const q = String(req.data.q || '').trim().slice(0, 120)
    if (q.length < 3) return { sugerencias: [] }
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ input: q }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new HttpsError('internal', 'Google Places: ' + ((d.error && d.error.message) || r.status))
    const sugerencias = (d.suggestions || [])
      .filter((s) => s.placePrediction)
      .slice(0, 6)
      .map((s) => ({ placeId: s.placePrediction.placeId, texto: (s.placePrediction.text && s.placePrediction.text.text) || '' }))
    return { sugerencias }
  }

  if (op === 'detalles') {
    const pid = String(req.data.placeId || '')
    if (!pid) throw new HttpsError('invalid-argument', 'Falta placeId.')
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pid)}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,formattedAddress,location,addressComponents' },
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new HttpsError('internal', 'Google Places: ' + ((d.error && d.error.message) || r.status))
    const comp = (tipos) => {
      const c = (d.addressComponents || []).find((x) => (x.types || []).some((t) => tipos.includes(t)))
      return c ? (c.longText || c.shortText || '') : ''
    }
    return {
      placeId: d.id || pid,
      direccion: d.formattedAddress || '',
      lat: d.location && Number.isFinite(d.location.latitude) ? d.location.latitude : null,
      lng: d.location && Number.isFinite(d.location.longitude) ? d.location.longitude : null,
      ciudad: comp(['locality', 'sublocality', 'postal_town']),
      estado: comp(['administrative_area_level_1']),
      zip: comp(['postal_code']),
    }
  }

  throw new HttpsError('invalid-argument', 'Operación no reconocida.')
})

// ============================================================================
// bulkFacturasRecurrentes — genera SOLAS las facturas periódicas a clientes.
// Una vez al día revisa las reglas en `bulk_recurrentes` (activa=true) cuya
// `proximaEmision` ya llegó y, para cada una:
//   1. Toma las órdenes ENTREGADAS del cliente cuyo hito de entrega cae en el
//      periodo [cubreDesde, proximaEmision] (opcionalmente filtradas por job).
//   2. Arma las líneas con EL MISMO cálculo que el panel (precioCliente desde
//      bulk_orderPay_cliente; órdenes viejas lo llevan inline) — los montos
//      cuadran con lo que ve el staff en Facturación.
//   3. Reserva el folio con LA MISMA transacción del front (bulk_counters/
//      {tenantId}.factura) → numeración FAC- correlativa sin huecos ni choques.
//   4. Crea la factura (estado 'enviada', vence = emisión + venceDias) con
//      `recurrenteId`, avanza la ventana de la regla y avisa al staff por push.
// Si el periodo no tuvo órdenes, NO emite factura vacía: solo avanza la ventana
// y lo deja anotado en la regla (`ultimoResultado: 'sin_ordenes'`).
// ============================================================================
const REC_ENTREGADAS = ['entregada', 'liberada', 'cerrada']
const _rec2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const _recMasDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
// Avanza una fecha según la frecuencia (mensual conserva el día, recortado al fin de mes).
function _recAvanzar(iso, frecuencia) {
  if (frecuencia === 'semanal') return _recMasDias(iso, 7)
  if (frecuencia === 'quincenal') return _recMasDias(iso, 14)
  const d = new Date(iso + 'T12:00:00Z')
  const dia = d.getUTCDate()
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1)
  const max = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, max))
  return d.toISOString().slice(0, 10)
}

exports.bulkFacturasRecurrentes = onSchedule({ schedule: 'every day 07:00', timeZone: 'America/Mexico_City' }, async () => {
  const hoy = new Date().toISOString().slice(0, 10)
  const reglas = await db.collection('bulk_recurrentes').where('activa', '==', true).get()
  for (const rdoc of reglas.docs) {
    const r = rdoc.data() || {}
    if (!r.tenantId || !r.clienteId || !r.proximaEmision || r.proximaEmision > hoy) continue
    try {
      const desde = r.cubreDesde || r.proximaEmision
      const hasta = r.proximaEmision
      // Órdenes entregadas del cliente en el periodo (estado y fechas se filtran en
      // memoria para no exigir índices compuestos).
      const ords = await db.collection('bulk_orders')
        .where('tenantId', '==', r.tenantId).where('clienteId', '==', r.clienteId).get()
      const dd = Date.parse(desde + 'T00:00:00'), hh = Date.parse(hasta + 'T23:59:59')
      const candidatas = ords.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((o) => REC_ENTREGADAS.includes(o.estado))
        .filter((o) => { const f = o.hitos && o.hitos.entrega ? Date.parse(o.hitos.entrega) : NaN; return Number.isFinite(f) && f >= dd && f <= hh })
        .filter((o) => !r.jobId || o.jobId === r.jobId)

      let lineas = []
      if (candidatas.length) {
        const pagos = await db.getAll(...candidatas.map((o) => db.collection('bulk_orderPay_cliente').doc(o.id)))
        lineas = candidatas.map((o, i) => {
          const pago = pagos[i].exists ? (pagos[i].data() || {}) : {}
          return {
            orderId: o.id, numero: o.numero || '', material: o.material || '',
            ton: _rec2(o.pesoReal != null ? o.pesoReal : o.pesoEstimado),
            precio: _rec2(pago.precioCliente != null ? pago.precioCliente : o.precioCliente),
            fecha: o.hitos && o.hitos.entrega ? new Date(o.hitos.entrega).toISOString() : null,
            jobId: o.jobId || null, plantaId: o.plantaId || null, tipoEquipo: o.tipoEquipo || '',
          }
        }).sort((a, b) => (a.numero || '').localeCompare(b.numero || ''))
        // Código + nombre del job en cada línea (igual que el panel), para que el
        // documento se vea completo sin depender de permisos de lectura de jobs.
        const jobIds = [...new Set(lineas.map((l) => l.jobId).filter(Boolean))]
        if (jobIds.length) {
          const jdocs = await db.getAll(...jobIds.map((j) => db.collection('bulk_jobs').doc(j)))
          const jm = {}
          jdocs.forEach((j) => { if (j.exists) jm[j.id] = j.data() || {} })
          lineas = lineas.map((l) => (l.jobId && jm[l.jobId]) ? { ...l, jobCodigo: jm[l.jobId].codigo || '', jobNombre: jm[l.jobId].nombre || '' } : l)
        }
      }

      const avance = { cubreDesde: _recMasDias(hasta, 1), proximaEmision: _recAvanzar(r.proximaEmision, r.frecuencia), ultimaEmision: hoy }
      if (!lineas.length) {
        await rdoc.ref.set(Object.assign({}, avance, { ultimoResultado: 'sin_ordenes' }), { merge: true })
        continue
      }
      const subtotal = _rec2(lineas.reduce((a, l) => a + l.precio, 0))
      const toneladas = _rec2(lineas.reduce((a, l) => a + l.ton, 0))
      // Folio: réplica exacta de siguienteSecuencia(tenantId,'factura') del front.
      const seq = await db.runTransaction(async (tx) => {
        const cref = db.collection('bulk_counters').doc(r.tenantId)
        const s = await tx.get(cref)
        const data = s.exists ? (s.data() || {}) : {}
        const next = (Number(data.factura) || 0) + 1
        tx.set(cref, { tenantId: r.tenantId, factura: next, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
        return next
      })
      const numero = 'FAC-' + String(seq).padStart(5, '0')
      const ts = new Date().toISOString()
      const inv = await db.collection('bulk_invoices').add({
        tenantId: r.tenantId, numero, clienteId: r.clienteId, clienteNombre: r.clienteNombre || '',
        desde, hasta, vence: _recMasDias(hoy, Number(r.venceDias) || 30),
        lineas, subtotal, total: subtotal, toneladas,
        estado: 'enviada', ts, recurrenteId: rdoc.id,
        creadoEn: admin.firestore.FieldValue.serverTimestamp(), actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      })
      await rdoc.ref.set(Object.assign({}, avance, { ultimoResultado: numero, ultimaFacturaId: inv.id }), { merge: true })
      await db.collection('bulk_audit').add({
        tenantId: r.tenantId, usuario: 'sistema (recurrente)', accion: 'factura_recurrente', entidad: 'factura',
        detalle: `${numero} · ${r.clienteNombre || r.clienteId} · ${_montoTxt(subtotal)} · ${lineas.length} órdenes (${desde} → ${hasta})`, ts,
      }).catch(() => {})
      const staff = await tokensDe(r.tenantId, (x) => STAFF.includes(x.rol))
      await enviarAPI(staff, 'Factura recurrente emitida', `${numero} · ${r.clienteNombre || 'Cliente'} · ${_montoTxt(subtotal)}`, 'https://www.milepay.io/bulk/facturacion')
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[bulkFacturasRecurrentes]', rdoc.id, (e && e.message) || e)
    }
  }
})

// ============================================================================
// LIBERACIÓN DE ENTREGAS CON TOKEN DE SUPERVISOR (regla crítica de seguridad)
// ----------------------------------------------------------------------------
// REGLA: ninguna orden puede pasar a 'entregada' sin una autorización VÁLIDA de
// un supervisor. La única vía de entrega es bulkEntregarOrden (este backend);
// las reglas de Firestore BLOQUEAN a cualquier cliente (app, API directa,
// petición manipulada) que intente escribir ese estado.
//
//   bulkTotpOp       → token tipo banco del supervisor (TOTP RFC 6238, secreto
//                      propio por supervisor, rotación automática cada
//                      30/60/120 s configurables + rotación manual).
//   bulkEntregarOrden→ deliverOrder(orderId, userId, releaseToken): valida
//                      permiso, estado, token, alcance del supervisor sobre la
//                      orden, un-solo-uso por orden, rate limiting y ejecuta el
//                      cambio de estado de forma ATÓMICA. Audita todo.
//
// Colecciones (solo backend escribe; ver firestore.rules):
//   bulk_supervisorTotp/{uid}   secreto TOTP (NUNCA legible por clientes)
//   bulk_liberaciones/{orderId} autorización consumida (1 por orden)
//   bulk_authAttempts/{orderId} intentos fallidos + bloqueo por fuerza bruta
// ============================================================================
const totp = require('./totp')

const LIB_MAX_FALLOS = 5           // intentos fallidos permitidos…
const LIB_VENTANA_MS = 10 * 60000  // …en esta ventana → bloqueo
const LIB_BLOQUEO_MS = 10 * 60000  // duración del bloqueo

async function _periodoLiberacion(tenantId) {
  try {
    const s = await db.collection('bulk_settings').doc(tenantId).get()
    return totp.periodoValido(s.exists && s.data().liberacion && s.data().liberacion.periodo)
  } catch { return 60 }
}

// ¿Este usuario puede AUTORIZAR entregas? (supervisor, admin o super_admin)
const _puedeAutorizar = (rol) => ['supervisor_planta', 'admin', 'super_admin'].includes(rol)
// ¿El alcance del autorizador cubre la orden? (jobs asignados; respaldo: planta;
// admin/super_admin cubren todo el tenant)
function _alcanzaOrden(u, orden) {
  if (['admin', 'super_admin'].includes(u.rol)) return true
  const jobs = Array.isArray(u.jobIds) ? u.jobIds : []
  if (jobs.length) return !!orden.jobId && jobs.includes(orden.jobId)
  return !!u.plantaId && orden.plantaId === u.plantaId
}

// ── bulkTotpOp — el "token bancario" del autorizador ─────────────────────────
// op 'codigo': código vigente + segundos restantes (genera el secreto si falta).
// op 'rotar' : regenera el secreto (el código anterior deja de valer YA).
exports.bulkTotpOp = onCall(async (req) => {
  const t = req.auth && req.auth.token
  if (!t || !t.bulkTenant) throw new HttpsError('permission-denied', 'No autorizado.')
  if (!_puedeAutorizar(t.bulkRole)) throw new HttpsError('permission-denied', 'Solo un supervisor o administrador tiene código de liberación.')
  const uid = req.auth.uid
  const op = req.data && req.data.op
  const periodo = await _periodoLiberacion(t.bulkTenant)
  const ref = db.collection('bulk_supervisorTotp').doc(uid)

  if (op === 'codigo' || op === 'rotar') {
    let secreto = null
    if (op === 'rotar') {
      secreto = totp.generarSecreto()
      await ref.set({ tenantId: t.bulkTenant, uid, secreto, rotadoEn: new Date().toISOString(), rotadoPor: t.email || uid }, { merge: true })
      await db.collection('bulk_audit').add({ tenantId: t.bulkTenant, usuario: t.email || uid, accion: 'totp_rotado', entidad: 'liberacion', detalle: `Nuevo código de liberación generado manualmente (revoca el anterior)${req.data && req.data.motivo ? ` · motivo: ${String(req.data.motivo).slice(0, 200)}` : ''}`, ts: new Date().toISOString() }).catch(() => {})
    } else {
      const s = await ref.get()
      secreto = s.exists ? s.data().secreto : null
      if (!secreto) { // primera vez: se genera el secreto
        secreto = totp.generarSecreto()
        await ref.set({ tenantId: t.bulkTenant, uid, secreto, creadoEn: new Date().toISOString() }, { merge: true })
      }
    }
    // El SECRETO nunca sale del servidor: solo el código vigente y su vida útil.
    return { codigo: totp.codigoTotp(secreto, periodo), segundos: totp.segundosRestantes(periodo), periodo }
  }

  throw new HttpsError('invalid-argument', 'Operación no reconocida.')
})

// ── bulkEntregarOrden — LA ÚNICA vía para marcar una orden como entregada ───
// data: { orderId, token, pod?: {firma, foto, comentarios}, gps?: {lat,lng} }
exports.bulkEntregarOrden = onCall({ timeoutSeconds: 30 }, async (req) => {
  const t = req.auth && req.auth.token
  if (!t || !t.bulkTenant) throw new HttpsError('permission-denied', 'No autorizado.')
  const uid = req.auth.uid
  const { orderId, token } = req.data || {}
  if (!orderId) throw new HttpsError('invalid-argument', 'Falta la orden.')
  const ahora = new Date().toISOString()
  const ip = (req.rawRequest && (req.rawRequest.ip || (req.rawRequest.headers && req.rawRequest.headers['x-forwarded-for']))) || ''
  const dispositivo = (req.rawRequest && req.rawRequest.headers && String(req.rawRequest.headers['user-agent'] || '').slice(0, 180)) || ''

  // 1) La orden existe y es del tenant del que llama.
  const oref = db.collection('bulk_orders').doc(String(orderId))
  const osnap = await oref.get()
  if (!osnap.exists) throw new HttpsError('not-found', 'La orden no existe.')
  const orden = osnap.data() || {}
  if (orden.tenantId !== t.bulkTenant) throw new HttpsError('permission-denied', 'Esa orden no es de tu empresa.')

  // 2) El usuario tiene permiso de ENTREGAR esta orden.
  const perfilSnap = await db.collection('bulk_users').doc(uid).get()
  const perfil = perfilSnap.exists ? perfilSnap.data() : {}
  const esStaff = ['super_admin', 'admin', 'dispatcher'].includes(t.bulkRole)
  const esSuChofer = t.bulkRole === 'chofer' && (
    orden.choferId === uid
    || (t.bulkCarrierId && orden.transportistaId === t.bulkCarrierId)
    || (perfil.nombre && orden.choferNombre === perfil.nombre)
  )
  if (!esStaff && !esSuChofer) throw new HttpsError('permission-denied', 'No puedes entregar esta orden.')

  // 3) Estado válido para entregar (y anti doble-entrega, re-validado en la tx).
  const ENTREGABLES = esStaff
    ? ['aceptada', 'en_planta', 'cargando', 'en_ruta', 'en_destino']
    : ['en_destino']
  if (['entregada', 'liberada', 'cerrada'].includes(orden.estado)) throw new HttpsError('failed-precondition', 'Esta orden ya fue entregada.')
  if (!ENTREGABLES.includes(orden.estado)) throw new HttpsError('failed-precondition', `La orden no está en un estado entregable (está «${orden.estado}»).`)

  // 4) Rate limiting por orden (fuerza bruta): bloqueo tras varios fallos.
  const aref = db.collection('bulk_authAttempts').doc(String(orderId))
  const asnap = await aref.get()
  const intentos = asnap.exists ? asnap.data() : {}
  if (intentos.bloqueadoHasta && Date.parse(intentos.bloqueadoHasta) > Date.now()) {
    throw new HttpsError('resource-exhausted', 'Demasiados intentos fallidos. Espera unos minutos y vuelve a pedir el código al supervisor.')
  }

  // 5) Validar el token contra los autorizadores CON ALCANCE sobre ESTA orden.
  //    (El código de un supervisor solo libera órdenes de SUS trabajos: un código
  //    válido no sirve para liberar cualquier orden del sistema.)
  const periodo = await _periodoLiberacion(t.bulkTenant)
  const candidatos = []
  let docsAut = []
  try {
    const usnap = await db.collection('bulk_users').where('tenantId', '==', t.bulkTenant).where('rol', 'in', ['supervisor_planta', 'admin', 'super_admin']).get()
    docsAut = usnap.docs
  } catch (e) {
    // Respaldo por si la consulta 'in' exigiera índice: una consulta por rol.
    for (const r of ['supervisor_planta', 'admin', 'super_admin']) {
      const s = await db.collection('bulk_users').where('tenantId', '==', t.bulkTenant).where('rol', '==', r).get()
      docsAut = docsAut.concat(s.docs)
    }
  }
  docsAut.forEach((d) => { const u = { id: d.id, ...d.data() }; if (u.activo !== false && _alcanzaOrden(u, orden)) candidatos.push(u) })

  // Diagnóstico claro ANTES de comparar tokens: si nadie puede autorizar esta
  // orden (o nadie generó su código aún), el problema NO es el código tecleado.
  if (candidatos.length === 0) {
    throw new HttpsError('failed-precondition', `Ningún supervisor tiene asignado el trabajo de la orden ${orden.numero || orderId}. Pide al administrador asignárselo en Usuarios (o usa el código de un administrador).`)
  }
  let autorizador = null, pasoTotp = null, conSecreto = 0
  if (String(token || '').trim()) {
    for (const u of candidatos) {
      const s = await db.collection('bulk_supervisorTotp').doc(u.id).get()
      const secreto = s.exists ? s.data().secreto : null
      if (!secreto) continue
      conSecreto++
      const r = totp.validarTotp(secreto, token, { periodo })
      if (r.ok) { autorizador = u; pasoTotp = r.timestep; break }
    }
  }
  if (!autorizador && conSecreto === 0) {
    throw new HttpsError('failed-precondition', 'El supervisor de este trabajo aún no ha generado su código: debe abrir la pestaña «Mi código» en su portal una vez.')
  }

  if (!autorizador) {
    // Registrar el intento fallido + bloqueo por fuerza bruta + auditoría.
    const previos = (Array.isArray(intentos.recientes) ? intentos.recientes : []).filter((x) => Date.parse(x.ts) > Date.now() - LIB_VENTANA_MS)
    previos.push({ ts: ahora, uid, usuario: t.email || uid, ip, dispositivo })
    const bloquear = previos.length >= LIB_MAX_FALLOS
    await aref.set({
      tenantId: t.bulkTenant, orderId: String(orderId), fallidos: (Number(intentos.fallidos) || 0) + 1,
      recientes: previos.slice(-LIB_MAX_FALLOS), ultimoEn: ahora,
      ...(bloquear ? { bloqueadoHasta: new Date(Date.now() + LIB_BLOQUEO_MS).toISOString() } : {}),
    }, { merge: true })
    await db.collection('bulk_audit').add({ tenantId: t.bulkTenant, usuario: t.email || uid, accion: 'liberacion_fallida', entidad: 'orden', entidadId: String(orderId), detalle: `Código de liberación INVÁLIDO para ${orden.numero || orderId}${bloquear ? ' · BLOQUEADA por intentos' : ''} · ${ip}`, ts: ahora }).catch(() => {})
    throw new HttpsError('permission-denied', 'Código inválido o expirado. La orden no puede ser entregada.')
  }

  // 6) ATÓMICO: autorización de UN SOLO USO por orden (doc id = orderId) + cambio
  //    de estado. Dos entregas simultáneas: la segunda falla en tx.create.
  const lref = db.collection('bulk_liberaciones').doc(String(orderId))
  const pod = (req.data && req.data.pod) || null
  const gps = (req.data && req.data.gps) || null
  await db.runTransaction(async (tx) => {
    const o2 = await tx.get(oref)
    const od = o2.exists ? o2.data() : null
    if (!od || ['entregada', 'liberada', 'cerrada'].includes(od.estado)) {
      throw new HttpsError('failed-precondition', 'Esta orden ya fue entregada (posible doble intento).')
    }
    // Autorización única por orden (anti-reutilización / anti-replay).
    tx.create(lref, {
      tenantId: t.bulkTenant, orderId: String(orderId), orderNumero: od.numero || '',
      supervisorId: autorizador.id, supervisorNombre: autorizador.nombre || autorizador.email || '',
      empleadoId: uid, empleadoNombre: perfil.nombre || t.email || uid, empleadoRol: t.bulkRole,
      autorizadaEn: ahora, entregadaEn: ahora, resultado: 'valida',
      periodo, timestep: pasoTotp, ip, dispositivo,
      intentosFallidosPrevios: Number(intentos.fallidos) || 0,
    })
    // Entregada Y liberada en el mismo paso: el supervisor YA autorizó la
    // entrega con su token, no hay una segunda liberación pendiente.
    tx.update(oref, {
      estado: 'liberada',
      hitos: Object.assign({}, od.hitos || {}, { entrega: ahora, liberacion: ahora }),
      liberadaPor: autorizador.nombre || autorizador.email || autorizador.id,
      liberacion: { modo: 'token_supervisor', por: autorizador.nombre || '', supervisorId: autorizador.id, ts: ahora },
      ...(pod ? { pod: { firma: pod.firma || null, foto: pod.foto || null, comentarios: pod.comentarios || '', gps: gps || null, ts: ahora } } : {}),
      ...(gps ? { gps_entrega: gps } : {}),
      ...(pod && pod.pesoReal != null ? { pesoReal: Number(pod.pesoReal) || null } : {}),
    })
  })

  // ── FACTURACIÓN POR PESO REAL (ticket/OCR) ────────────────────────────────
  // Los precios se generan con el peso estándar de referencia (p. ej. 25 tn).
  // Si el ticket de báscula dio otro peso, TODO se reescala a ese peso real:
  // cobro al cliente, pago al transportista y pago al chofer (si su trato es
  // porcentaje se recalcula exacto; si es monto fijo por carga, no se toca).
  try {
    const pesoRealFinal = Number(pod && pod.pesoReal != null ? pod.pesoReal : orden.pesoReal) || null
    const pesoBase = Number(orden.pesoEstimado) || null
    const factor = pesoRealFinal && pesoBase ? pesoRealFinal / pesoBase : null
    if (factor && Math.abs(factor - 1) > 0.005 && factor > 0.2 && factor < 3) {
      const esc = (v) => (v == null ? null : Math.round(Number(v) * factor * 100) / 100)
      // Config de pago del chofer (porcentaje/fijo) del carrier de la orden.
      let cfgChofer = null
      if (orden.transportistaId) {
        try {
          const [cc, car] = await Promise.all([
            db.collection('bulk_carrierConfig').doc(String(orden.transportistaId)).get(),
            db.collection('bulk_carriers').doc(String(orden.transportistaId)).get(),
          ])
          const pagos = (cc.exists && cc.data().pagoChoferes) || {}
          const roster = (car.exists && car.data().choferes) || []
          const ficha = roster.find((d) => d.uid && d.uid === orden.choferId)
          cfgChofer = (ficha && pagos[ficha.id]) || null
        } catch { /* sin config */ }
      }
      // Precios: viven en la orden y/o en los docs de pago por audiencia.
      const oPagoC = db.collection('bulk_orderPay_cliente').doc(String(orderId))
      const oPagoT = db.collection('bulk_orderPay_carrier').doc(String(orderId))
      const oPagoD = db.collection('bulk_orderPay_chofer').doc(String(orderId))
      const [dC, dT, dD] = await Promise.all([oPagoC.get(), oPagoT.get(), oPagoD.get()])
      const vC = dC.exists && dC.data().precioCliente != null ? dC.data().precioCliente : orden.precioCliente
      const vT = dT.exists && dT.data().precioTransportista != null ? dT.data().precioTransportista : orden.precioTransportista
      const vD = dD.exists && dD.data().pagoChofer != null ? dD.data().pagoChofer : orden.pagoChofer
      const nC = esc(vC)
      const nT = esc(vT)
      let nD = null
      if (vD != null) {
        if (cfgChofer && cfgChofer.tipo === 'fijo') nD = Number(vD) || null       // trato fijo por carga: no cambia
        else if (cfgChofer && cfgChofer.tipo === 'porcentaje' && nT != null) nD = Math.round(nT * (Number(cfgChofer.valor) || 0)) / 100
        else nD = esc(vD)                                                          // sin config: proporcional
      }
      const meta = { pesoBase, pesoReal: pesoRealFinal, factor: Math.round(factor * 10000) / 10000, ts: ahora }
      const tareas = []
      const cambiosOrden = { recalculoPeso: meta }
      if (nC != null && orden.precioCliente != null) cambiosOrden.precioCliente = nC
      if (nT != null && orden.precioTransportista != null) cambiosOrden.precioTransportista = nT
      if (nD != null && orden.pagoChofer != null) cambiosOrden.pagoChofer = nD
      tareas.push(oref.set(cambiosOrden, { merge: true }))
      if (dC.exists && nC != null) tareas.push(oPagoC.set({ precioCliente: nC, recalculoPeso: meta }, { merge: true }))
      if (dT.exists && nT != null) tareas.push(oPagoT.set({ precioTransportista: nT, recalculoPeso: meta }, { merge: true }))
      if (dD.exists && nD != null) tareas.push(oPagoD.set({ pagoChofer: nD, recalculoPeso: meta }, { merge: true }))
      await Promise.all(tareas)
      await db.collection('bulk_audit').add({
        tenantId: t.bulkTenant, usuario: 'sistema', accion: 'recalculo_peso', entidad: 'orden', entidadId: String(orderId),
        detalle: `${orden.numero || orderId}: precios reescalados al peso real del ticket (${pesoBase} tn → ${pesoRealFinal} tn, factor ${meta.factor})`, ts: ahora,
      }).catch(() => {})
    }
  } catch (e) {
    console.warn('recalculo por peso real fallo (la entrega ya quedo registrada)', e)
  }

  // Liberar la presencia del chofer (vuelve a la cola de disponibles).
  const choferUid = orden.choferId || (esSuChofer ? uid : null)
  if (choferUid) {
    try { await db.collection('bulk_presence').doc(choferUid).set({ ordenId: null, estado: 'libre', actualizadoEn: new Date().toISOString() }, { merge: true }) } catch { /* noop */ }
  }
  await db.collection('bulk_audit').add({
    tenantId: t.bulkTenant, usuario: t.email || uid, accion: 'entrega_autorizada', entidad: 'orden', entidadId: String(orderId),
    detalle: `${orden.numero || orderId} entregada y liberada · autorizó ${autorizador.nombre || autorizador.id} (token) · entregó ${perfil.nombre || t.email || uid} (${t.bulkRole}) · ${ip}`, ts: ahora,
  }).catch(() => {})

  return { ok: true, orderId: String(orderId), numero: orden.numero || '', supervisor: autorizador.nombre || '', entregadaEn: ahora }
})
