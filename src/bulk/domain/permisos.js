// ============================================================================
// BULK · Dominio · RBAC (control de acceso por rol y permisos) — LÓGICA PURA
// ----------------------------------------------------------------------------
// Sistema de permisos GRANULAR y CONFIGURABLE. La idea:
//
//     usuario → rol → permisos → módulos / acciones / información
//
// - Los PERMISOS son un catálogo fijo definido en código (cada permiso equivale a
//   una capacidad real del producto). No se "inventan" desde la UI.
// - Los ROLES sí son configurables: un admin decide qué permisos tiene cada rol,
//   y esa configuración se guarda por tenant en la colección `bulk_roles`.
// - Si un rol no tiene configuración guardada, cae a su PRESET (que reproduce
//   EXACTAMENTE el comportamiento actual → cero regresión al desplegar).
//
// IMPORTANTE (seguridad): este archivo gobierna la UI y la capa de presentación.
// El AISLAMIENTO FINANCIERO REAL de la cadena (cliente/transportista/chofer solo
// ven su propio pay-doc) lo imponen las REGLAS de Firestore sobre las colecciones
// bulk_orderPay_*. Un permiso de UI nunca puede otorgar una lectura que las reglas
// no permitan. Los permisos financieros de aquí (fin.*) refinan la visibilidad
// DENTRO de lo que las reglas ya autorizan (p. ej. ocultarle al dispatcher la
// ganancia del dueño), nunca la amplían.
// ============================================================================
import { BULK_ROLES as R } from './constants'

// ---- Acciones genéricas ----------------------------------------------------
export const ACCION_LABEL = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  asignar: 'Asignar',
  exportar: 'Exportar',
  gestionar: 'Gestionar',
}

// ---- Módulos (recursos) → acciones aplicables + ruta de navegación ---------
// `path` es relativo a /bulk (igual que en nav.js). El catálogo de módulos maneja
// tanto la pantalla de configuración de roles como el filtrado del menú.
export const MODULOS = [
  { key: 'dashboard', label: 'Dashboard', path: '', acciones: ['ver'] },
  { key: 'ordenes', label: 'Órdenes / Cola', path: 'ordenes', acciones: ['ver', 'crear', 'editar', 'eliminar', 'asignar'] },
  { key: 'mapa', label: 'Mapa en vivo', path: 'mapa', acciones: ['ver'] },
  { key: 'mensajes', label: 'Mensajes', path: 'mensajes', acciones: ['ver'] },
  { key: 'jobs', label: 'Trabajos (Jobs)', path: 'jobs', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
  { key: 'clientes', label: 'Clientes y Plantas', path: 'clientes', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
  { key: 'transportistas', label: 'Transportistas', path: 'transportistas', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
  { key: 'choferes', label: 'Choferes', path: 'choferes', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
  { key: 'facturacion', label: 'Facturación', path: 'facturacion', acciones: ['ver', 'crear', 'editar', 'exportar'] },
  { key: 'incidencias', label: 'Incidencias', path: 'incidencias', acciones: ['ver', 'crear', 'editar'] },
  { key: 'documentos', label: 'Documentos', path: 'documentos', acciones: ['ver', 'gestionar'] },
  { key: 'geocercas', label: 'Geocercas', path: 'geocercas', acciones: ['ver', 'gestionar'] },
  { key: 'materiales', label: 'Materiales', path: 'materiales', acciones: ['ver', 'gestionar'] },
  { key: 'equipos', label: 'Tipos de equipo', path: 'equipos', acciones: ['ver', 'gestionar'] },
  { key: 'usuarios', label: 'Usuarios', path: 'usuarios', acciones: ['ver', 'gestionar'] },
  { key: 'roles', label: 'Roles y permisos', path: 'roles', acciones: ['gestionar'] },
  { key: 'demo', label: 'Modo test', path: 'demo', acciones: ['ver'] },
]

export const MODULO_POR_KEY = Object.fromEntries(MODULOS.map((m) => [m.key, m]))

// ---- Permisos de INFORMACIÓN FINANCIERA (independientes de las acciones) ----
// `campo` mapea al campo del desglose de una orden (domain/pagos.js). Los que
// tienen campo:null son permisos financieros agregados (dashboard/reportes).
export const FIN_PERMISOS = [
  { key: 'fin.precioCliente', label: 'Ver tarifa del cliente (Customer Rate)', campo: 'precioCliente' },
  { key: 'fin.precioTransportista', label: 'Ver pago al transportista (Carrier Pay)', campo: 'precioTransportista' },
  { key: 'fin.pagoChofer', label: 'Ver pago al chofer (Driver Pay)', campo: 'pagoChofer' },
  { key: 'fin.utilidadTransportista', label: 'Ver margen del transportista (Carrier Margin)', campo: 'utilidadTransportista' },
  { key: 'fin.utilidadDueno', label: 'Ver ganancia del negocio (Profit / Admin Margin)', campo: 'utilidadDueno' },
  { key: 'fin.ingresos', label: 'Ver ingresos y totales globales (Revenue)', campo: null },
  { key: 'fin.reportesFinancieros', label: 'Ver y exportar reportes financieros', campo: null },
]

export const FIN_PERMISO_POR_CAMPO = Object.fromEntries(
  FIN_PERMISOS.filter((p) => p.campo).map((p) => [p.campo, p.key]),
)

// ---- Clave de un permiso de acción: `${modulo}.${accion}` ------------------
export const permKey = (modulo, accion) => `${modulo}.${accion}`

// Catálogo plano de TODAS las claves de permiso existentes.
export const TODOS_LOS_PERMISOS = [
  ...MODULOS.flatMap((m) => m.acciones.map((a) => permKey(m.key, a))),
  ...FIN_PERMISOS.map((p) => p.key),
]

// ============================================================================
// PRESETS por rol — reproducen EXACTAMENTE el comportamiento actual del sistema.
// Fuente: nav.js (qué módulos ve cada rol) + domain/pagos.js (qué campos
// financieros ve cada rol). Mientras un admin no personalice un rol en la
// pantalla de Roles, estos presets mandan, así que desplegar no cambia nada.
// ============================================================================

// Todos los permisos de un módulo (todas sus acciones).
const modTodo = (key) => (MODULO_POR_KEY[key]?.acciones || []).map((a) => permKey(key, a))

// Solo la acción "ver" de una lista de módulos.
const soloVer = (...keys) => keys.map((k) => permKey(k, 'ver'))

const TODO = [...TODOS_LOS_PERMISOS]

// Staff operativo (dispatcher): ve el panel operativo, opera órdenes, pero NO ve
// la ganancia del dueño ni la tarifa del cliente (igual que camposVisiblesPorRol).
const PRESET_DISPATCHER = [
  ...soloVer('dashboard', 'mapa', 'mensajes'),
  ...['ver', 'crear', 'editar', 'asignar'].map((a) => permKey('ordenes', a)),
  permKey('jobs', 'ver'),
  permKey('clientes', 'ver'),
  permKey('transportistas', 'ver'),
  ...['ver', 'crear', 'editar'].map((a) => permKey('incidencias', a)),
  'fin.precioTransportista',
  'fin.pagoChofer',
]

// Roles de la cadena (portales). Su nav es su portal, no el panel staff; aquí
// definimos sobre todo su visibilidad financiera. El aislamiento duro lo imponen
// las reglas de Firestore sobre bulk_orderPay_*.
const PRESET_CLIENTE = ['fin.precioCliente']
const PRESET_TRANSPORTISTA = ['fin.precioTransportista', 'fin.pagoChofer', 'fin.utilidadTransportista']
const PRESET_CHOFER = ['fin.pagoChofer']
const PRESET_SUPERVISOR = [] // opera liberación, sin visibilidad financiera

export const PRESET_ROLES = {
  [R.SUPER_ADMIN]: TODO,
  [R.ADMIN]: TODO,
  [R.DISPATCHER]: PRESET_DISPATCHER,
  [R.CLIENTE]: PRESET_CLIENTE,
  [R.TRANSPORTISTA]: PRESET_TRANSPORTISTA,
  [R.CHOFER]: PRESET_CHOFER,
  [R.SUPERVISOR_PLANTA]: PRESET_SUPERVISOR,
}

// Roles que SIEMPRE tienen todo (no editables por la UI; blindaje del negocio).
export const ROLES_TOTALES = new Set([R.SUPER_ADMIN])

// ---- API pública -----------------------------------------------------------

// Conjunto EFECTIVO de permisos de un rol: configuración guardada del tenant
// (bulk_roles) si existe; si no, el preset. super_admin siempre = todo.
//   rolesConfig: { [rol]: { permisos: string[] } } | null
export function permisosDeRol(rol, rolesConfig) {
  if (ROLES_TOTALES.has(rol)) return new Set(TODOS_LOS_PERMISOS)
  const cfg = rolesConfig?.[rol]
  if (cfg && Array.isArray(cfg.permisos)) return new Set(cfg.permisos)
  return new Set(PRESET_ROLES[rol] || [])
}

// ¿El conjunto de permisos incluye esta clave?
export function tienePermiso(permisos, clave) {
  if (!clave) return false
  if (permisos instanceof Set) return permisos.has(clave)
  if (Array.isArray(permisos)) return permisos.includes(clave)
  return false
}

// Campos financieros de una orden visibles según un conjunto de permisos.
// (Equivalente por-permiso de camposVisiblesPorRol de domain/pagos.js.)
export function camposFinancierosVisibles(permisos) {
  return FIN_PERMISOS.filter((p) => p.campo && tienePermiso(permisos, p.key)).map((p) => p.campo)
}
