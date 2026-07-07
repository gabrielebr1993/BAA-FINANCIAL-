// ---------------------------------------------------------------------------
// Función serverless de Vercel: crea un usuario COMPLETO (Auth + Firestore)
// con Firebase Admin SDK. No requiere UID manual y no cierra la sesión del
// que lo crea (todo ocurre en el servidor).
//
// Requiere la variable de entorno FIREBASE_SERVICE_ACCOUNT_BASE64:
//   una clave de servicio de Firebase (JSON) codificada en base64.
// ---------------------------------------------------------------------------
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Inicializa el Admin SDK una sola vez (singleton entre invocaciones).
function ensureAdmin() {
  if (getApps().length) return
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (!b64) throw new Error('SIN_SERVICE_ACCOUNT')
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  initializeApp({ credential: cert(json) })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })

  try {
    ensureAdmin()
  } catch {
    return res.status(500).json({ ok: false, error: 'El servidor no tiene configurada la clave de servicio (FIREBASE_SERVICE_ACCOUNT_BASE64). Usa el modo con UID manual mientras tanto.' })
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const { nombre, email, password, role, permissions, companyId } = body

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
    await db.collection('users').doc(userRecord.uid).set({
      nombre: String(nombre).trim(),
      email: String(email).trim(),
      role: role || 'manager',
      permissions: permissions || {},
      companyId,
      superAdmin: false,
      createdAt: FieldValue.serverTimestamp(),
    })
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
}
