// BULK · Navegación por rol. Cada usuario solo ve lo que le corresponde.
import {
  LayoutDashboard, Package, Boxes, Truck, Building2, Users, ClipboardList,
  Layers, Navigation, MapPin, Calculator,
} from 'lucide-react'
import { BULK_ROLES as R } from './domain/constants'

// roles = quién ve el ítem. `path` es relativo a /bulk.
export const NAV = [
  { path: '', label: 'Dashboard', icon: LayoutDashboard, roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { path: 'ordenes', label: 'Órdenes / Cola', icon: ClipboardList, roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { path: 'mapa', label: 'Mapa en vivo', icon: Navigation, roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { path: 'jobs', label: 'Trabajos (Jobs)', icon: Layers, roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { path: 'clientes', label: 'Clientes y Plantas', icon: Building2, roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { path: 'transportistas', label: 'Transportistas', icon: Truck, roles: [R.SUPER_ADMIN, R.ADMIN, R.DISPATCHER] },
  { path: 'geocercas', label: 'Geocercas', icon: MapPin, roles: [R.SUPER_ADMIN, R.ADMIN] },
  { path: 'tarifas', label: 'Motor de tarifas', icon: Calculator, roles: [R.SUPER_ADMIN, R.ADMIN] },
  { path: 'materiales', label: 'Materiales', icon: Boxes, roles: [R.SUPER_ADMIN, R.ADMIN] },
  { path: 'equipos', label: 'Tipos de equipo', icon: Package, roles: [R.SUPER_ADMIN, R.ADMIN] },
  { path: 'usuarios', label: 'Usuarios y roles', icon: Users, roles: [R.SUPER_ADMIN, R.ADMIN] },
]

export const puedeVer = (rol, roles) => !roles || roles.includes(rol)
