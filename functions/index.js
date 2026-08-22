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
