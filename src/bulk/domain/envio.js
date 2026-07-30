// ============================================================================
// BULK · Dominio · Enlaces de envío (email / WhatsApp) desde un contacto libre.
// El contacto de clientes/transportistas es texto ("tel / email"), así que
// detectamos qué hay dentro y armamos los enlaces posibles. Lógica pura.
// ============================================================================
const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const soloDigitos = (s) => (s || '').replace(/[^\d+]/g, '').replace(/^\+/, '')

// Extrae el primer email y el primer teléfono de un texto de contacto.
export function partesContacto(contacto) {
  const txt = String(contacto || '')
  const email = (txt.match(RE_EMAIL) || [])[0] || ''
  const sinEmail = email ? txt.replace(email, ' ') : txt
  const tel = soloDigitos((sinEmail.match(/[+\d][\d\s().-]{6,}/) || [])[0] || '')
  return { email, tel }
}

// Arma los enlaces de envío disponibles para un contacto dado.
// asunto/cuerpo son texto plano.
export function enlacesEnvio(contacto, { asunto = '', cuerpo = '' } = {}) {
  const { email, tel } = partesContacto(contacto)
  const links = {}
  if (email) links.mailto = `mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
  if (tel) links.whatsapp = `https://wa.me/${tel}?text=${encodeURIComponent(`${asunto ? asunto + '\n' : ''}${cuerpo}`)}`
  return links
}
