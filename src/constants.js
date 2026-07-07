// ---------------------------------------------------------------------------
// Constantes globales del sistema Gofo
// ---------------------------------------------------------------------------
import {
  LayoutDashboard, Upload, FileText, DollarSign, AlertTriangle, Truck,
  Wallet, TrendingUp, BarChart3, Bell, Users, Settings,
} from 'lucide-react'

// Marca de color
export const COLORS = {
  navy: '#13233f',
  gold: '#c9a24b',
  bg: '#f5f6f8',
  card: '#ffffff',
  border: '#e3e6ec',
  text: '#1c2536',
  muted: '#6b7280',
  green: '#1a7f4b',
  red: '#c0392b',
}

// Paleta para gráficos (recharts)
export const CHART_COLORS = ['#13233f', '#c9a24b', '#3b6ea5', '#7f9cc0', '#a67c00', '#5b7db1', '#8896a6']

// Descuento fijo por claim NO perdonado (aplicado al chofer). NO SE CAMBIA.
export const CLAIM_FEE = 100

// Un monto exactamente igual a este valor clasifica el paquete como DOBLE. NO SE CAMBIA.
export const DOBLE_MONTO = 0.5

// ---------------------------------------------------------------------------
// Ciudades / almacenes (multi-ubicación)
// El código de almacén es lo que va ANTES del guion en "Region/route".
// Houston tiene DOS almacenes (IAH01 e IAH02) que se tratan por separado.
// ---------------------------------------------------------------------------
export const CIUDADES = {
  DFW01: 'Dallas',
  IAH01: 'Houston 1',
  IAH02: 'Houston 2',
  MSN01: 'Madison',
  ORD01: 'Chicago',
  AUS01: 'Austin',
}

// Nombre legible de un código de almacén. Si no se conoce, se usa tal cual.
export function nombreCiudad(codigo) {
  if (!codigo) return 'Sin ciudad'
  return CIUDADES[codigo] || codigo
}

// ---------------------------------------------------------------------------
// Permisos del sistema. El owner ve todo automáticamente (ver AuthContext).
// ---------------------------------------------------------------------------
export const PERMISOS = [
  { key: 'verDashboard', label: 'Ver Dashboard' },
  { key: 'subirFacturas', label: 'Cargar Facturas' },
  { key: 'verFinanzas', label: 'Ver Financiero' },
  { key: 'verClaims', label: 'Ver Claims' },
  { key: 'gestionarChoferes', label: 'Gestionar Choferes y Tarifas' },
  { key: 'verPagos', label: 'Ver Pagos' },
  { key: 'gestionarUsuarios', label: 'Gestionar Usuarios' },
]

export const ROLES = ['owner', 'admin', 'manager']

// Secciones del menú lateral. Cada una gated por su permiso. Iconos = Lucide.
export const SECCIONES = [
  { path: '/', label: 'Dashboard', permiso: 'verDashboard', icon: LayoutDashboard },
  { path: '/facturas', label: 'Cargar Factura', permiso: 'subirFacturas', icon: Upload },
  { path: '/historial', label: 'Facturas', permiso: 'subirFacturas', icon: FileText },
  { path: '/financiero', label: 'Financiero', permiso: 'verFinanzas', icon: DollarSign },
  { path: '/claims', label: 'Claims', permiso: 'verClaims', icon: AlertTriangle },
  { path: '/choferes', label: 'Choferes y Tarifas', permiso: 'gestionarChoferes', icon: Truck },
  { path: '/pagos', label: 'Pagos', permiso: 'verPagos', icon: Wallet },
  { path: '/performance', label: 'Performance', permiso: 'verDashboard', icon: TrendingUp },
  { path: '/comparar', label: 'Comparar semanas', permiso: 'verDashboard', icon: BarChart3 },
  { path: '/alertas', label: 'Alertas', permiso: 'verDashboard', icon: Bell },
  { path: '/usuarios', label: 'Usuarios', permiso: 'gestionarUsuarios', icon: Users },
  { path: '/configuracion', label: 'Configuración', permiso: 'gestionarUsuarios', icon: Settings },
]

// Umbral (±%) para alertar de cambios de precio de Gofo entre facturas.
export const UMBRAL_CAMBIO_PRECIO = 0.05
