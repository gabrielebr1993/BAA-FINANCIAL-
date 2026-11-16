// BULK · Navegación. El menú se filtra por PERMISOS (RBAC granular): un ítem se
// muestra si el usuario tiene el permiso `${modulo}.ver` (o `.gestionar` para
// módulos sin "ver"). `modulo` referencia el catálogo en domain/permisos.js.
// `roles` queda como respaldo/documentación del preset, pero el filtro real es el
// permiso — así un rol nuevo o personalizado ve exactamente lo que se le autorizó.
import {
  LayoutDashboard, Package, Boxes, Truck, Building2, Users, ClipboardList,
  Layers, Navigation, MapPin, FileText, AlertTriangle, FileWarning, FlaskConical, MessageSquare, Contact, ShieldCheck, Stethoscope, Mail, Inbox, Video, Zap,
} from 'lucide-react'
import { BULK_ROLES as R } from './domain/constants'
import { permKey, MODULO_POR_KEY } from './domain/permisos'

// Secciones del menú, en orden. Cada ítem del NAV indica su `grupo`.
export const GRUPOS_ORDEN = ['Inicio', 'Operación', 'Comercial', 'Comunicación', 'Finanzas', 'Catálogos', 'Ajustes']
// modulo = clave del catálogo de permisos. `path` es relativo a /bulk.
export const NAV = [
  { modulo: 'dashboard', path: '', label: 'Dashboard', icon: LayoutDashboard, grupo: 'Inicio', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'ordenes', path: 'ordenes', label: 'Órdenes / Cola', icon: ClipboardList, grupo: 'Operación', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'mapa', path: 'mapa', label: 'Mapa en vivo', icon: Navigation, grupo: 'Operación', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'jobs', path: 'jobs', label: 'Trabajos (Jobs)', icon: Layers, grupo: 'Operación', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'incidencias', path: 'incidencias', label: 'Incidencias', icon: AlertTriangle, grupo: 'Operación', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'geocercas', path: 'geocercas', label: 'Geocercas', icon: MapPin, grupo: 'Operación', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'clientes', path: 'clientes', label: 'Clientes y Plantas', icon: Building2, grupo: 'Comercial', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'transportistas', path: 'transportistas', label: 'Transportistas', icon: Truck, grupo: 'Comercial', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'choferes', path: 'choferes', label: 'Choferes', icon: Contact, grupo: 'Comercial', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'mensajes', path: 'mensajes', label: 'Mensajes', icon: MessageSquare, grupo: 'Comunicación', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'reuniones', path: 'reuniones', label: 'Reuniones', icon: Video, grupo: 'Comunicación', roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { modulo: 'correo', path: 'correo', label: 'Correo (CRM)', icon: Inbox, grupo: 'Comunicación', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'correos', path: 'correos', label: 'Correos del dominio', icon: Mail, grupo: 'Comunicación', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'facturacion', path: 'facturacion', label: 'Facturación', icon: FileText, grupo: 'Finanzas', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'fastpay', path: 'fastpay', label: 'Fast Pay', icon: Zap, grupo: 'Finanzas', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'documentos', path: 'documentos', label: 'Documentos', icon: FileWarning, grupo: 'Catálogos', roles: [R.SUPER_ADMIN, R.ADMIN] },
  // El motor de tarifas ahora vive DENTRO del perfil de cada cliente (Clientes y Plantas).
  { modulo: 'materiales', path: 'materiales', label: 'Materiales', icon: Boxes, grupo: 'Catálogos', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'equipos', path: 'equipos', label: 'Tipos de equipo', icon: Package, grupo: 'Catálogos', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'usuarios', path: 'usuarios', label: 'Usuarios', icon: Users, grupo: 'Ajustes', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'roles', path: 'roles', label: 'Roles y permisos', icon: ShieldCheck, grupo: 'Ajustes', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'diagnostico', path: 'diagnostico', label: 'Diagnóstico', icon: Stethoscope, grupo: 'Ajustes', roles: [R.SUPER_ADMIN, R.ADMIN] },
  { modulo: 'demo', path: 'demo', label: 'Modo test', icon: FlaskConical, grupo: 'Ajustes', roles: [R.SUPER_ADMIN, R.ADMIN] },
]

// Respaldo (compat): filtrado por rol. El filtro real es por permiso (ver abajo).
export const puedeVer = (rol, roles) => !roles || roles.includes(rol)

// Permiso mínimo que exige un ítem del menú para mostrarse: `${modulo}.ver` si el
// módulo tiene la acción "ver"; si no (p. ej. "roles" solo tiene "gestionar"), su
// primera acción disponible.
export function permisoDeNav(item) {
  const mod = MODULO_POR_KEY[item.modulo]
  if (!mod) return null
  const accion = mod.acciones.includes('ver') ? 'ver' : mod.acciones[0]
  return permKey(item.modulo, accion)
}

// Ítems del menú visibles para un usuario, según su función `puede(permiso)`.
export function navVisible(puede) {
  return NAV.filter((i) => { const p = permisoDeNav(i); return !p || puede(p) })
}
