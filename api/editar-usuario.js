// ---------------------------------------------------------------------------
// Función serverless de Vercel: un ADMIN del módulo Freight/Bulk EDITA un usuario
// (nombre, correo, contraseña y/o planta) con Firebase Admin SDK. Actualiza tanto
// Firebase Auth (email/password/displayName) como el doc `bulk_users`.
// Aislamiento: el admin solo puede editar usuarios de SU tenant (bulkTenant).
// Requiere FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel (igual que crear-usuario).
// ---------------------------------------------------------------------------

let admin = null

async function cargarAdmin() {
  if (admin) return admin
  const [appMod, authMod, fsMod] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ])
  admin = {
    getApps: appMod.getApps, initializeApp: appMod.initializeApp, cert: appMod.cert,
    getAuth: authMod.getAuth, getFirestore: fsMod.getFirestore,
  }
  return admin
}

function ensureAdmin(a) {
  if (a.getApps().length) return
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (!b64) throw new Error('SIN_SERVICE_ACCOUNT')
  a.initializeApp({ credential: a.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) })
}

const esEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''))

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })

    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      const falta = e?.message === 'SIN_SERVICE_ACCOUNT'
      return res.status(503).json({ ok: false, error: falta ? 'El servidor no tiene configurada FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar el servidor: ' + (e?.message || 'error') })
    }
    const { getAuth, getFirestore } = a

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { uid, nombre, email, password, plantaId, rol } = body
    if (!uid) return res.status(400).json({ ok: false, error: 'Falta el identificador del usuario.' })
    if (email != null && !esEmail(email)) return res.status(400).json({ ok: false, error: 'El correo no tiene un formato válido.' })
    if (password != null && password !== '' && String(password).length < 6) return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' })

    // ---- autorización del que llama ----
    const idToken = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
    if (!idToken) return res.status(401).json({ ok: false, error: 'No autorizado (falta el token de sesión).' })
    let decoded
    try { decoded = await getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ ok: false, error: 'Token inválido o expirado. Vuelve a iniciar sesión.' }) }

    const superEmails = (process.env.VITE_SUPERADMIN_EMAILS || process.env.SUPERADMIN_EMAILS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const callerEmail = (decoded.email || '').toLowerCase()
    const esSuperEmail = superEmails.includes(callerEmail)
    const esBulkAdmin = ['super_admin', 'admin'].includes(decoded.bulkRole || '')
    if (!esSuperEmail && !esBulkAdmin) return res.status(403).json({ ok: false, error: 'No tienes permiso para editar usuarios.' })

    // ---- cargar el usuario destino y verificar el tenant ----
    const db = getFirestore()
    const targetSnap = await db.collection('bulk_users').doc(uid).get()
    if (!targetSnap.exists) return res.status(404).json({ ok: false, error: 'El usuario ya no existe.' })
    const target = targetSnap.data() || {}
    if (!esSuperEmail && decoded.bulkTenant !== target.tenantId) return res.status(403).json({ ok: false, error: 'No puedes editar usuarios de otra empresa.' })

    // ---- actualizar Firebase Auth ----
    const authUpdate = {}
    const nuevoEmail = email != null ? String(email).trim().toLowerCase() : null
    if (nuevoEmail && nuevoEmail !== (target.email || '').toLowerCase()) authUpdate.email = nuevoEmail
    if (password) authUpdate.password = String(password)
    if (nombre != null) authUpdate.displayName = String(nombre)
    if (Object.keys(authUpdate).length) {
      try { await getAuth().updateUser(uid, authUpdate) }
      catch (e) {
        const code = e?.errorInfo?.code || e?.code || ''
        const map = {
          'auth/email-already-exists': 'Ese correo ya está en uso por otra cuenta.',
          'auth/invalid-email': 'El correo no tiene un formato válido.',
          'auth/user-not-found': 'No existe la cuenta de acceso de este usuario.',
          'auth/invalid-password': 'La contraseña debe tener al menos 6 caracteres.',
          'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres).',
        }
        return res.status(400).json({ ok: false, error: map[code] || 'No se pudo actualizar el acceso: ' + (e?.message || 'desconocido') })
      }
    }

    // ---- cambio de ROL (recalcula custom claims y fuerza re-login) ----
    let rolCambiado = false
    const nuevoRol = typeof rol === 'string' && rol.trim() ? rol.trim() : null
    if (nuevoRol && nuevoRol !== target.rol) {
      // Solo un super admin (o superadmin por correo) puede ascender a super_admin.
      if (nuevoRol === 'super_admin' && !esSuperEmail && (decoded.bulkRole || '') !== 'super_admin') {
        return res.status(403).json({ ok: false, error: 'Solo un super administrador puede asignar el rol Super Admin.' })
      }
      // Nadie puede degradar a un super_admin desde aquí salvo un super admin.
      if (target.rol === 'super_admin' && !esSuperEmail && (decoded.bulkRole || '') !== 'super_admin') {
        return res.status(403).json({ ok: false, error: 'No puedes cambiar el rol de un super administrador.' })
      }
      // Claims según el nuevo rol: los vínculos (cliente/carrier) solo aplican al rol que los usa.
      const claims = { bulkTenant: target.tenantId, bulkRole: nuevoRol }
      if (nuevoRol === 'cliente' && target.clienteId) claims.bulkClienteId = target.clienteId
      if (['transportista', 'chofer'].includes(nuevoRol) && target.carrierId) claims.bulkCarrierId = target.carrierId
      try {
        await getAuth().setCustomUserClaims(uid, claims)
        await getAuth().revokeRefreshTokens(uid) // fuerza a re-iniciar sesión con el nuevo rol
        rolCambiado = true
      } catch (e) { return res.status(400).json({ ok: false, error: 'No se pudo cambiar el rol: ' + (e?.message || 'desconocido') }) }
    }

    // ---- actualizar el documento bulk_users ----
    const docUpdate = {}
    if (nombre != null) docUpdate.nombre = String(nombre)
    if (nuevoEmail) docUpdate.email = nuevoEmail
    if (plantaId !== undefined) docUpdate.plantaId = plantaId || null
    if (rolCambiado) docUpdate.rol = nuevoRol
    if (Object.keys(docUpdate).length) await db.collection('bulk_users').doc(uid).set(docUpdate, { merge: true })

    return res.status(200).json({ ok: true, uid, rolCambiado })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Error inesperado: ' + (e?.message || 'desconocido') })
  }
}
