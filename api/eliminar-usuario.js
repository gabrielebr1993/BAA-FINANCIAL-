// ---------------------------------------------------------------------------
// Función serverless de Vercel: un ADMIN ELIMINA un usuario Bulk por completo
// (cuenta de Firebase Auth + documento en `bulk_users`) usando el Admin SDK.
// Las reglas de Firestore bloquean el borrado directo de `bulk_users`
// (allow write: if false), por eso el borrado real pasa por aquí.
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
    const { uid, email } = body
    if (!uid && !email) return res.status(400).json({ ok: false, error: 'Faltan datos: uid o email del usuario a eliminar.' })

    // ---- autorización del que llama ----
    const idToken = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
    if (!idToken) return res.status(401).json({ ok: false, error: 'No autorizado (falta el token de sesión).' })
    let decoded
    try { decoded = await getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ ok: false, error: 'Token inválido o expirado. Vuelve a iniciar sesión.' }) }

    const superEmails = (process.env.VITE_SUPERADMIN_EMAILS || process.env.SUPERADMIN_EMAILS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    const callerEmail = (decoded.email || '').toLowerCase()
    const bulkRole = decoded.bulkRole || null
    let ok = superEmails.includes(callerEmail) || ['super_admin', 'admin'].includes(bulkRole)
    if (!ok) {
      try {
        const snap = await getFirestore().collection('users').doc(decoded.uid).get()
        const c = snap.exists ? snap.data() : null
        ok = !!c && (c.superAdmin === true || c.role === 'owner')
      } catch { /* noop */ }
    }
    if (!ok) return res.status(403).json({ ok: false, error: 'No tienes permiso para eliminar usuarios.' })

    // ---- resolver usuario destino ----
    let targetUid = uid
    let targetEmail = (email || '').toLowerCase()
    try {
      if (!targetUid && targetEmail) { const u = await getAuth().getUserByEmail(targetEmail); targetUid = u.uid }
    } catch { /* puede no existir en Auth pero sí en Firestore: seguimos abajo */ }

    if (targetUid === decoded.uid) return res.status(400).json({ ok: false, error: 'No puedes eliminar tu propia cuenta.' })

    // No permitir eliminar a un super administrador.
    try {
      if (targetUid) {
        const u = await getAuth().getUser(targetUid)
        if (u?.customClaims?.bulkRole === 'super_admin') return res.status(403).json({ ok: false, error: 'No se puede eliminar a un super administrador.' })
      }
    } catch { /* noop */ }

    // Aislar por tenant: solo puede borrar usuarios de su propia empresa (salvo superadmin por correo).
    const db = getFirestore()
    if (!superEmails.includes(callerEmail) && targetUid) {
      try {
        const snap = await db.collection('bulk_users').doc(targetUid).get()
        const perfil = snap.exists ? snap.data() : null
        if (perfil && decoded.bulkTenant && perfil.tenantId && perfil.tenantId !== decoded.bulkTenant) {
          return res.status(403).json({ ok: false, error: 'Ese usuario pertenece a otra empresa.' })
        }
      } catch { /* noop */ }
    }

    // ---- eliminar Auth + Firestore ----
    let borroAlgo = false
    if (targetUid) {
      try { await getAuth().deleteUser(targetUid); borroAlgo = true } catch (e) { if ((e?.errorInfo?.code || e?.code) !== 'auth/user-not-found') throw e }
      try { await db.collection('bulk_users').doc(targetUid).delete(); borroAlgo = true } catch { /* noop */ }
    }
    if (!borroAlgo) return res.status(404).json({ ok: false, error: 'No se encontró el usuario.' })
    return res.status(200).json({ ok: true, uid: targetUid })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'No se pudo eliminar: ' + (e?.message || 'desconocido') })
  }
}
