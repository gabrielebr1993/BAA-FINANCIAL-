// ---------------------------------------------------------------------------
// Constantes globales del sistema MilePay
// ---------------------------------------------------------------------------
import {
  LayoutDashboard, Upload, FileText, DollarSign, AlertTriangle, Truck,
  Wallet, TrendingUp, BarChart3, Bell, Users, Settings, Scale, Route,
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

// Paleta para gráficos (recharts) — navy, dorado, azul acero de marca y grises.
export const CHART_COLORS = ['#13233f', '#c9a24b', '#3d5a80', '#7f9cc0', '#a67c00', '#94a3b8', '#8896a6']

// Descuento fijo por claim NO perdonado (aplicado al chofer). NO SE CAMBIA.
export const CLAIM_FEE = 100

// Un monto exactamente igual a este valor clasifica el paquete como DOBLE. NO SE CAMBIA.
export const DOBLE_MONTO = 0.5

// ---------------------------------------------------------------------------
// Calificación de choferes (0-100). Pesos y umbrales ajustables.
//   Calidad 40% · Productividad 30% · Rentabilidad 30%.
//   ≥75 Bueno (verde) · 50-74 Regular (amarillo) · <75 abajo Malo (rojo).
// ---------------------------------------------------------------------------
export const PESOS_CALIF_CHOFER = { calidad: 0.4, productividad: 0.3, rentabilidad: 0.3 }
export const UMBRALES_CALIF = { bueno: 75, regular: 50 }
// Estrellas 1-5 según el puntaje 0-100 (ajustable).
export const UMBRALES_ESTRELLAS = [
  { min: 90, estrellas: 5 },
  { min: 75, estrellas: 4 },
  { min: 60, estrellas: 3 },
  { min: 40, estrellas: 2 },
  { min: 0, estrellas: 1 },
]
// Penalización de calidad por cada claim por cada 100 entregas.
export const CALIDAD_FACTOR = 25
// Puntaje base (=50) para quien está justo en el promedio de la flota.
export const BASE_PROMEDIO = 50

// ---------------------------------------------------------------------------
// Calificación de ciudades (0-100). Pesos ajustables.
//   Ganancia 30% · Rentabilidad $/lb 20% · Calidad/claims 25% · Fallidos 15% ·
//   Volumen 10%.
// ---------------------------------------------------------------------------
export const PESOS_CALIF_CIUDAD = { ganancia: 0.3, rentabilidad: 0.2, calidad: 0.25, fallidos: 0.15, volumen: 0.1 }

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
  { path: '/reclamos', label: 'Reclamos a Gofo', permiso: 'verFinanzas', icon: Scale },
  { path: '/claims', label: 'Claims', permiso: 'verClaims', icon: AlertTriangle },
  { path: '/choferes', label: 'Choferes y Tarifas', permiso: 'gestionarChoferes', icon: Truck },
  { path: '/pagos', label: 'Pagos', permiso: 'verPagos', icon: Wallet },
  { path: '/rutas', label: 'Rutas', permiso: 'verDashboard', icon: Route },
  { path: '/performance', label: 'Performance', permiso: 'verDashboard', icon: TrendingUp },
  { path: '/comparar', label: 'Comparar semanas', permiso: 'verDashboard', icon: BarChart3 },
  { path: '/alertas', label: 'Alertas', permiso: 'verDashboard', icon: Bell },
  { path: '/usuarios', label: 'Usuarios', permiso: 'gestionarUsuarios', icon: Users },
  { path: '/configuracion', label: 'Configuración', permiso: 'gestionarUsuarios', icon: Settings },
]

// Umbral (±%) para alertar de cambios de precio de Gofo entre facturas.
export const UMBRAL_CAMBIO_PRECIO = 0.05
