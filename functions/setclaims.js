// Utilidad de reparación: re-aplica los custom claims (bulkTenant, bulkRole, …) de un
// usuario Bulk a partir de su documento en bulk_users. Úsalo si un usuario quedó sin
// permisos en su token. Ejecutar en Cloud Shell:
//   cd ~/baa-financial-/functions && node setclaims.js [correo]
const admin = require('firebase-admin')
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'baa-financial' })

const EMAIL = (process.argv[2] || 'gabriele.brandonisio.o@gmail.com').toLowerCase()

;(async () => {
  const u = await admin.auth().getUserByEmail(EMAIL)
  const d = await admin.firestore().doc('bulk_users/' + u.uid).get()
  const p = d.exists ? d.data() : {}
  const claims = { bulkTenant: p.tenantId || null, bulkRole: p.rol || 'super_admin' }
  if (p.clienteId) claims.bulkClienteId = p.clienteId
  if (p.carrierId) claims.bulkCarrierId = p.carrierId
  await admin.auth().setCustomUserClaims(u.uid, claims)
  console.log('=========================================')
  console.log('OK — claims aplicados a', EMAIL)
  console.log('uid:', u.uid)
  console.log('docExiste:', d.exists)
  console.log('claims:', JSON.stringify(claims))
  console.log('Ahora cierra sesión en Bulk y vuelve a entrar.')
  console.log('=========================================')
  process.exit(0)
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
