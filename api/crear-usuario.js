// ---------------------------------------------------------------------------
// Función serverless de Vercel: crea un usuario COMPLETO (Auth + Firestore)
// con Firebase Admin SDK. No requiere UID manual y no cierra la sesión del
// que lo crea (todo ocurre en el servidor).
//
// Requiere la variable de entorno FIREBASE_SERVICE_ACCOUNT_BASE64:
//   una clave de servicio de Firebase (JSON) codificada en base64.
//
// IMPORTANTE: firebase-admin se importa de forma DIFERIDA (dynamic import) dentro
// del handler, para que cualquier fallo al cargarlo se devuelva como un error
// JSON legible en vez de un 500 opaco (página de error de Vercel) que el cliente
// no puede interpretar.
// ---------------------------------------------------------------------------

let admin = null

// Carga firebase-admin una sola vez (cacheado entre invocaciones calientes).
async function cargarAdmin() {
  if (admin) return admin
  const [appMod, authMod, fsMod] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
  ])
  admin = {
    getApps: appMod.getApps,
    initializeApp: appMod.initializeApp,
    cert: appMod.cert,
    getAuth: authMod.getAuth,
    getFirestore: fsMod.getFirestore,
    FieldValue: fsMod.FieldValue,
  }
  return admin
}

// Inicializa el Admin SDK una sola vez (singleton entre invocaciones).
function ensureAdmin(a) {
  if (a.getApps().length) return
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (!b64) throw new Error('SIN_SERVICE_ACCOUNT')
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  a.initializeApp({ credential: a.cert(json) })
}

export default async function handler(req, res) {
  // Blindaje global: cualquier error inesperado se devuelve como JSON controlado
  // (nunca un 500 crudo que rompa el cliente). Este endpoint SOLO se usa al crear
  // usuarios/accesos; no interviene en cargar ni eliminar facturas.
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })

    // 1) Cargar e inicializar firebase-admin (diferido, para capturar fallos de import).
    let a
    try {
      a = await cargarAdmin()
      ensureAdmin(a)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[crear-usuario] init/admin:', e?.stack || e?.message || e)
      const falta = e?.message === 'SIN_SERVICE_ACCOUNT'
      return res.status(503).json({
        ok: false,
        error: falta
          ? 'El servidor no tiene configurada la clave de servicio (FIREBASE_SERVICE_ACCOUNT_BASE64) en Vercel. Usa el modo con UID manual mientras tanto.'
          : 'No se pudo inicializar el servidor de administración: ' + (e?.message || 'error desconocido') + '. Revisa FIREBASE_SERVICE_ACCOUNT_BASE64 (que sea el JSON en base64) y los logs de la función en Vercel.',
      })
    }
    const { getAuth, getFirestore, FieldValue } = a

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { nombre, email, password, role, permissions, companyId, driverId, driverNombre } = body

    if (!nombre || !email || !password || !companyId) {
      return res.status(400).json({ ok: false, error: 'Faltan datos: nombre, email, contraseña y empresa son obligatorios.' })
    }
    if (String(password).length < 6) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' })
    }

    // ---- autorización: quien llama debe ser owner de esa empresa o súper-admin ----
    const authHeader = req.headers.authorization || ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) return res.status(401).json({ ok: false, error: 'No autorizado (falta el token de sesión).' })

    let decoded
    try {
      decoded = await getAuth().verifyIdToken(idToken)
    } catch {
      return res.status(401).json({ ok: false, error: 'Token inválido o expirado. Vuelve a iniciar sesión.' })
    }

    const db = getFirestore()
    const callerSnap = await db.collection('users').doc(decoded.uid).get()
    const caller = callerSnap.exists ? callerSnap.data() : null
    const superEmails = (process.env.VITE_SUPERADMIN_EMAILS || process.env.SUPERADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    const callerEmail = (decoded.email || '').toLowerCase()
    const esSuper = (caller && caller.superAdmin === true) || superEmails.includes(callerEmail)
    const esOwner = caller && caller.role === 'owner' && caller.companyId === companyId
    if (!esSuper && !esOwner) {
      return res.status(403).json({ ok: false, error: 'No tienes permiso para crear usuarios en esta empresa.' })
    }

    // ---- creación ----
    try {
      const userRecord = await getAuth().createUser({
        email: String(email).trim(),
        password: String(password),
        displayName: String(nombre).trim(),
      })
      // Un usuario "driver" queda vinculado a un chofer (driverId + nombre) y sin
      // permisos de gestión. El resto de roles ignoran esos campos.
      const esDriver = role === 'driver'
      const dNombre = driverNombre ? String(driverNombre).trim() : ''
      const userDocData = {
        nombre: String(nombre).trim(),
        email: String(email).trim(),
        role: role || 'manager',
        permissions: esDriver ? {} : (permissions || {}),
        companyId,
        superAdmin: false,
        createdAt: FieldValue.serverTimestamp(),
      }
      if (esDriver) {
        userDocData.driverId = driverId ? String(driverId) : ''
        userDocData.driverNombre = dNombre
        userDocData.driverKey = dNombre.toLowerCase()
      }
      await db.collection('users').doc(userRecord.uid).set(userDocData)
      return res.status(200).json({ ok: true, uid: userRecord.uid })
    } catch (e) {
      const code = e?.errorInfo?.code || e?.code || ''
      const map = {
        'auth/email-already-exists': 'Ya existe un usuario con ese correo.',
        'auth/invalid-email': 'El correo no es válido.',
        'auth/invalid-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres).',
      }
      return res.status(400).json({ ok: false, error: map[code] || 'Error al crear el usuario: ' + (e?.message || 'desconocido') })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[crear-usuario] Error no controlado:', e?.stack || e?.message || e)
    return res.status(400).json({ ok: false, error: 'Error inesperado en el servidor: ' + (e?.message || 'desconocido') })
  }
}
