// Utilidad de reparación: re-aplica los custom claims (bulkTenant, bulkRole, …) de un
// usuario Bulk a partir de su documento en bulk_users. Úsalo si un usuario quedó sin
// permisos en su token. Ejecutar en Cloud Shell:
//   cd ~/baa-financial-/functions && node setclaims.js [correo]
const admin = require('firebase-admin')
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'baa-financial' })

const EMAIL = (process.argv[2] || 'gabriele.brandonisio.o@gmail.com').toLowerCase()

;(async () => {
  const u = await admin.auth().getUserByEmail(EMAIL)
  const ref = admin.firestore().doc('bulk_users/' + u.uid)
  const d = await ref.get()
  let p = d.exists ? d.data() : null
  let creado = false
  if (!p) {
    // El perfil no existe (usuario quedó a medias): lo creamos como super admin.
    const tenantId = 't_' + u.uid.slice(0, 10).toLowerCase()
    p = {
      nombre: u.displayName || 'Super Admin',
      email: EMAIL, rol: 'super_admin', tenantId,
      empresa: process.argv[3] || 'B&A American group', activo: true,
      creadoEn: admin.firestore.FieldValue.serverTimestamp(),
    }
    await ref.set(p, { merge: true })
    creado = true
  }
  const claims = { bulkTenant: p.tenantId, bulkRole: p.rol || 'super_admin' }
  if (p.clienteId) claims.bulkClienteId = p.clienteId
  if (p.carrierId) claims.bulkCarrierId = p.carrierId
  await admin.auth().setCustomUserClaims(u.uid, claims)
  console.log('=========================================')
  console.log('OK — usuario listo:', EMAIL)
  console.log('uid:', u.uid)
  console.log('perfil ' + (creado ? 'CREADO' : 'ya existía'))
  console.log('claims:', JSON.stringify(claims))
  console.log('>> Cierra sesión en Bulk (Salir) y vuelve a entrar.')
  console.log('=========================================')
  process.exit(0)
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
