// ---------------------------------------------------------------------------
// Utilidades compartidas por los endpoints serverless de Stripe.
// (Los archivos que empiezan con "_" NO son rutas en Vercel: es una librería.)
// firebase-admin y stripe se importan de forma DIFERIDA para devolver errores
// JSON legibles en vez de un 500 opaco.
// ---------------------------------------------------------------------------

let admin = null
export async function cargarAdmin() {
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

export function ensureAdmin(a) {
  if (a.getApps().length) return
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  if (!b64) throw new Error('SIN_SERVICE_ACCOUNT')
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  a.initializeApp({ credential: a.cert(json) })
}

let stripeInst = null
export async function cargarStripe() {
  if (stripeInst) return stripeInst
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('SIN_STRIPE_KEY')
  const mod = await import('stripe')
  const Stripe = mod.default || mod
  stripeInst = new Stripe(key, { apiVersion: '2024-06-20' })
  return stripeInst
}

// ¿La clave configurada es de TEST? (sk_test_… vs sk_live_…). Sirve para separar
// claramente el modo test del de producción y no ejecutar pagos reales por error.
export function esModoTest() {
  return String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')
}

// Verifica el idToken del que llama y devuelve { decoded, caller, esSuper, db } o
// { error, code }. La autorización por empresa se comprueba luego en cada endpoint.
export async function autorizar(req, a) {
  const authHeader = req.headers.authorization || ''
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!idToken) return { error: 'No autorizado (falta el token de sesión).', code: 401 }
  let decoded
  try {
    decoded = await a.getAuth().verifyIdToken(idToken)
  } catch {
    return { error: 'Token inválido o expirado. Vuelve a iniciar sesión.', code: 401 }
  }
  const db = a.getFirestore()
  const callerSnap = await db.collection('users').doc(decoded.uid).get()
  const caller = callerSnap.exists ? callerSnap.data() : null
  const superEmails = (process.env.VITE_SUPERADMIN_EMAILS || process.env.SUPERADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const callerEmail = (decoded.email || '').toLowerCase()
  const esSuper = (caller && caller.superAdmin === true) || superEmails.includes(callerEmail)
  return { decoded, caller, esSuper, db }
}

// Carga el chofer y valida que quien llama sea owner de esa empresa (o súper-admin)
// y que el chofer pertenezca a la empresa. Devuelve { dref, driver } o { error, code }.
export async function cargarChoferAutorizado(auth, companyId, driverId) {
  if (!companyId || !driverId) return { error: 'Faltan companyId o driverId.', code: 400 }
  const esOwner = auth.caller && auth.caller.role === 'owner' && auth.caller.companyId === companyId
  if (!auth.esSuper && !esOwner) return { error: 'No tienes permiso para gestionar pagos en esta empresa.', code: 403 }
  const dref = auth.db.collection('drivers').doc(driverId)
  const dsnap = await dref.get()
  if (!dsnap.exists) return { error: 'Chofer no encontrado.', code: 404 }
  const driver = dsnap.data()
  if (driver.companyId !== companyId) return { error: 'El chofer no pertenece a esa empresa.', code: 403 }
  return { dref, driver }
}
