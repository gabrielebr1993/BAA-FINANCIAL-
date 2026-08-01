// ---------------------------------------------------------------------------
// Función serverless de Vercel: un ADMIN fija una NUEVA contraseña a un usuario
// (por uid o email) usando Firebase Admin SDK. Sirve para ambos módulos:
//   - Package/MilePay: caller owner/superAdmin (doc `users`).
//   - Freight/Bulk: caller con claim bulkRole in [super_admin, admin].
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
    const { uid, email, password } = body
    if ((!uid && !email) || !password) return res.status(400).json({ ok: false, error: 'Faltan datos: (uid o email) y la nueva contraseña.' })
    if (String(password).length < 6) return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' })

    // ---- autorización del que llama ----
    const idToken = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
    if (!idToken) return res.status(401).json({ ok: false, error: 'No autorizado (falta el token de sesión).' })
    let decoded
    try { decoded = await getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ ok: false, error: 'Token inválido o expirado. Vuelve a iniciar sesión.' }) }

    const superEmails = (process.env.VITE_SUPERADMIN_EMAILS || process.env.SUPERADMIN_EMAILS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const callerEmail = (decoded.email || '').toLowerCase()
    // Autorizado si: superadmin por correo, o admin del módulo Bulk (claim), o
    // owner/superAdmin del módulo Package (doc users).
    const bulkRole = decoded.bulkRole || null
    let ok = superEmails.includes(callerEmail) || ['super_admin', 'admin'].includes(bulkRole)
    if (!ok) {
      try {
        const snap = await getFirestore().collection('users').doc(decoded.uid).get()
        const c = snap.exists ? snap.data() : null
        ok = !!c && (c.superAdmin === true || c.role === 'owner')
      } catch { /* noop */ }
    }
    if (!ok) return res.status(403).json({ ok: false, error: 'No tienes permiso para cambiar contraseñas.' })

    // ---- resolver usuario destino y actualizar ----
    try {
      let targetUid = uid
      if (!targetUid && email) { const u = await getAuth().getUserByEmail(String(email).trim()); targetUid = u.uid }
      await getAuth().updateUser(targetUid, { password: String(password) })
      return res.status(200).json({ ok: true, uid: targetUid })
    } catch (e) {
      const code = e?.errorInfo?.code || e?.code || ''
      const map = {
        'auth/user-not-found': 'No existe un usuario con esos datos.',
        'auth/invalid-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres).',
      }
      return res.status(400).json({ ok: false, error: map[code] || 'No se pudo cambiar la contraseña: ' + (e?.message || 'desconocido') })
    }
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Error inesperado: ' + (e?.message || 'desconocido') })
  }
}
