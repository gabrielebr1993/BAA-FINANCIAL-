// ============================================================================
// BULK · Dominio · Matriz de comunicación (chat interno por roles/perfiles)
// ----------------------------------------------------------------------------
// Lógica 100% PURA (sin Firebase ni React): decide QUIÉN puede iniciar un chat
// privado con QUIÉN. Se diseña para ser DINÁMICA (cualquier rol/perfil, incluidos
// los personalizados) y CONFIGURABLE SIN TOCAR CÓDIGO: el administrador guarda un
// documento `bulk_comMatrix/{tenantId}` con overrides por par de roles, y aquí solo
// se aplican los valores por defecto cuando no hay override.
//
// Dos capas independientes, ambas deben cumplirse para poder chatear:
//   1) POLÍTICA POR ROL  → `puedeChatearRol(a,b,matriz)` (matriz configurable).
//   2) MISMA COMPAÑÍA     → `mismaCompania(yo,otro)` (aislamiento por empresa).
//      Por defecto: el STAFF atiende a todo el tenant; los roles de la CADENA
//      (chofer/transportista) quedan acotados a SU MISMO carrier (su "compañía");
//      el cliente solo habla con el staff. El supervisor coordina en todo el tenant.
//
// La validación equivalente exigida por el negocio —"currentUser.company_id ===
// targetUser.company_id"— se implementa aquí y SE REVALIDA EN EL BACKEND (Cloud
// Function `bulkChatPrivado`); el frontend nunca es la única barrera.
// ============================================================================
import { resumenPorConversacion, esConvPrivada, uidsDePrivada } from '../data/chatKeys'

// Roles de la CADENA (aislados por su propia empresa/vínculo). Todo lo demás
// (super_admin, admin, dispatcher y CUALQUIER rol personalizado) se considera STAFF
// del tenant, con visibilidad operativa. Debe coincidir con la regla `bStaff` de
// firestore.rules y con la constante CADENA usada en Mensajes.
export const ROLES_CADENA = ['cliente', 'transportista', 'chofer', 'supervisor_planta']

export const esRolStaff = (rol) => !!rol && !ROLES_CADENA.includes(rol)

// Clave canónica (sin orden) de un par de roles, para indexar la matriz.
export const clavePar = (a, b) => [a || '', b || ''].sort().join('|')

// ¿Permite la POLÍTICA por defecto que estos dos roles chateen? (symmetric)
//   - Si alguno es STAFF → sí (el staff se comunica con todos).
//   - chofer↔chofer, chofer↔transportista, transportista↔transportista → sí
//     (personas de la operación de transporte).
//   - supervisor_planta ↔ chofer/transportista/supervisor → sí (coordina la carga).
//   - cliente ↔ (no-staff) → no por defecto (el cliente habla con la oficina). El
//     admin puede habilitarlo con un override en la matriz.
export function permisoPorDefecto(a, b) {
  if (!a || !b) return false
  if (esRolStaff(a) || esRolStaff(b)) return true
  const set = new Set([a, b])
  const soloDe = (roles) => [...set].every((r) => roles.includes(r))
  if (soloDe(['chofer', 'transportista'])) return true // chofer↔chofer, chofer↔transportista, transportista↔transportista
  if (set.has('supervisor_planta') && soloDe(['supervisor_planta', 'chofer', 'transportista'])) return true
  return false // incluye cualquier combinación con 'cliente' entre no-staff
}

// Política EFECTIVA = override configurable de la matriz (si existe) ó el default.
// `matriz` = { pares: { 'rolA|rolB': true|false, ... } } (doc bulk_comMatrix).
export function puedeChatearRol(a, b, matriz) {
  const pares = (matriz && matriz.pares) || {}
  const k = clavePar(a, b)
  if (Object.prototype.hasOwnProperty.call(pares, k)) return !!pares[k]
  return permisoPorDefecto(a, b)
}

// Identificador de "compañía" de un perfil, para el aislamiento por empresa.
//   - chofer / transportista → su carrierId (la empresa de transporte).
//   - cliente               → su clienteId (la empresa cliente).
//   - staff / supervisor    → null (no acotados a una sola empresa del tenant).
export function companiaDe(p) {
  if (!p) return null
  if (p.rol === 'chofer' || p.rol === 'transportista') return p.carrierId || null
  if (p.rol === 'cliente') return p.clienteId || null
  return null
}

// ¿Pertenecen `yo` y `otro` a la MISMA compañía a efectos de poder comunicarse?
// (El tenant ya se garantiza aparte: el directorio es por-tenant y las reglas de
// Firestore aíslan por bulkTenant.) Reglas:
//   - Si alguno es STAFF → sí (atiende a todo el tenant).
//   - Si alguno es supervisor_planta → sí (coordinador del tenant).
//   - Si ambos tienen carrier → deben ser el MISMO carrier.
//   - Si alguno es cliente → no (el cliente solo con staff; ya lo corta la política).
//   - Resto → no.
export function mismaCompania(yo, otro) {
  if (!yo || !otro) return false
  if (esRolStaff(yo.rol) || esRolStaff(otro.rol)) return true
  if (yo.rol === 'supervisor_planta' || otro.rol === 'supervisor_planta') return true
  if ((yo.rol === 'chofer' || yo.rol === 'transportista') && (otro.rol === 'chofer' || otro.rol === 'transportista')) {
    return !!yo.carrierId && yo.carrierId === otro.carrierId
  }
  return false
}

// ¿Puede `yo` iniciar/mantener un chat privado con `otro`? = política de rol Y
// misma compañía. Nunca consigo mismo.
export function puedeComunicarse(yo, otro, matriz) {
  if (!yo || !otro) return false
  if (yo.uid && otro.uid && yo.uid === otro.uid) return false
  return puedeChatearRol(yo.rol, otro.rol, matriz) && mismaCompania(yo, otro)
}

// Construye las filas de conversaciones PRIVADAS (pv_) a partir de los mensajes del
// usuario (los que ya trae su suscripción `participantes array-contains <uid>`).
// `directorio` aporta nombre/rol del OTRO; `fotos` su avatar. Devuelve items base
// (la vista añade la etiqueta de rol traducida y el color).
export function conversacionesPrivadas({ mensajes = [], uid, directorio = [], fotos = {} } = {}) {
  const resumen = resumenPorConversacion(mensajes, uid)
  const porUid = {}
  for (const d of directorio) porUid[d.uid || d.id] = d
  const out = []
  for (const key of Object.keys(resumen)) {
    if (!esConvPrivada(key)) continue
    const otro = uidsDePrivada(key).find((u) => u !== uid) || ''
    const info = porUid[otro] || {}
    const r = resumen[key]
    out.push({
      key, chatId: key, otroUid: otro,
      nombre: info.nombre || r.lastAutor || 'Usuario', rol: info.rol || '',
      foto: fotos[otro] || null,
      lastText: r.lastText, lastTs: r.lastTs, noLeidos: r.noLeidos,
      participantes: uidsDePrivada(key),
    })
  }
  return out
}

// A partir del DIRECTORIO del tenant (lista de perfiles { uid, nombre, rol,
// carrierId, clienteId, codigo }) devuelve los contactos con los que `yo` puede
// hablar, AGRUPADOS por rol y ordenados por nombre. `fotos` = mapa uid→foto (avatares).
export function contactosDisponibles({ yo, directorio = [], matriz, fotos = {} } = {}) {
  if (!yo) return []
  const permitidos = directorio
    .filter((p) => p && p.uid && p.uid !== yo.uid && puedeComunicarse(yo, p, matriz))
    .map((p) => ({ ...p, foto: fotos[p.uid] || null }))
  const porRol = new Map()
  for (const p of permitidos) {
    const arr = porRol.get(p.rol) || []
    arr.push(p)
    porRol.set(p.rol, arr)
  }
  const grupos = []
  for (const [rol, personas] of porRol) {
    personas.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    grupos.push({ rol, personas })
  }
  // Ordena los grupos: staff primero, luego cadena, y por nombre de rol.
  grupos.sort((a, b) => (Number(esRolStaff(b.rol)) - Number(esRolStaff(a.rol))) || (a.rol || '').localeCompare(b.rol || ''))
  return grupos
}
