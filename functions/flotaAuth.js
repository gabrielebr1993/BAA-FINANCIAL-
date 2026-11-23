const SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS || 'gabriele.brandonisio.o@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

function esSuperEmail(email) {
  return !!email && SUPERADMIN_EMAILS.includes(String(email).trim().toLowerCase())
}

function puedeVerFlota(perfil, email) {
  if (esSuperEmail(email)) return true
  if (!perfil) return false
  if (perfil.superAdmin === true) return true
  if (perfil.role === 'driver') return false
  if (perfil.role === 'owner') return true
  return perfil.permissions?.verDashboard === true
}

module.exports = { puedeVerFlota, esSuperEmail }
