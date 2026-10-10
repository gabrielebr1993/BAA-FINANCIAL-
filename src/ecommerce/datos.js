// ============================================================================
// ECOMMERCE · Constantes, motor de precios y datos de demostración.
//
// Módulo PRIVADO "Ecommerce (En construcción)": compras internacionales para
// LATAM gestionadas por la empresa (adquisición al proveedor + logística
// completa). Este archivo no toca Firestore: solo definiciones puras.
// ============================================================================

// Dueño del módulo: ÚNICA cuenta con acceso mientras está en construcción.
// Se identifica por correo verificado del login (igual que isSuperEmail en
// firestore.rules). NO basta ser admin/superAdmin: el dueño es el dueño.
export const ECOM_DUENOS = ['gabriele.brandonisio.o@gmail.com']
export const esDuenoEcom = (email) => !!email && ECOM_DUENOS.includes(String(email).toLowerCase())

// ── Proveedores soportados (integraciones: ver pestaña Integraciones) ──────
export const PROVEEDORES = [
  { id: 'alibaba', nombre: 'Alibaba', nota: 'B2B · pedidos por cotización (MOQ)' },
  { id: 'aliexpress', nombre: 'AliExpress', nota: 'B2C · afiliados / dropshipping' },
  { id: 'amazon', nombre: 'Amazon', nota: 'PA-API solo afiliados · compra asistida' },
  { id: 'propio', nombre: 'Inventario propio', nota: 'Producto en nuestro almacén' },
]

// ── Países de operación (v1 demo; el dueño los edita en Configuración) ─────
export const PAISES_BASE = [
  { codigo: 'VE', nombre: 'Venezuela', moneda: 'USD', tc: 1, aranceles: 0.15, entregaLocal: 6, intlKg: 9, activo: true },
  { codigo: 'CO', nombre: 'Colombia', moneda: 'COP', tc: 4100, aranceles: 0.19, entregaLocal: 4, intlKg: 7, activo: true },
  { codigo: 'MX', nombre: 'México', moneda: 'MXN', tc: 18.5, aranceles: 0.16, entregaLocal: 4, intlKg: 6.5, activo: true },
  { codigo: 'PE', nombre: 'Perú', moneda: 'PEN', tc: 3.8, aranceles: 0.18, entregaLocal: 5, intlKg: 7.5, activo: false },
  { codigo: 'US', nombre: 'Estados Unidos (hub)', moneda: 'USD', tc: 1, aranceles: 0, entregaLocal: 5, intlKg: 0, activo: false },
]

export const CATEGORIAS_BASE = ['Electrónica', 'Hogar', 'Herramientas', 'Moda', 'Autopartes', 'Bebés y niños']

// ── Configuración por defecto (doc ecom_settings/config) ───────────────────
export const CONFIG_DEFAULT = {
  // Publicación: dos interruptores SEPARADOS, ambos apagados de fábrica.
  catalogoPublico: false,   // permitir ver el catálogo con enlace abierto (sin login)
  ventasReales: false,      // permitir cobros/compras/envíos reales (hoy: TODO demo)
  margenPorDefecto: 0.35,   // 35%
  margenMinimo: 0.10,       // alerta si el margen baja de 10%
  comisionPagoPct: 0.045,   // pasarela + conversión (estimado)
  manejoOrigen: 2.5,        // USD por pedido: recepción + preparación en hub
  redondeo: '0.99',         // '0.99' | 'entero' | 'centavos'
  vigenciaCotizacionDias: 5,
  paises: PAISES_BASE,
  categorias: CATEGORIAS_BASE,
  margenesPorCategoria: {}, // { 'Electrónica': 0.28, ... } — opcional
}

// ── Estados del flujo (separados: pedido / pago / compra / envío) ──────────
// Cadena logística (spec punto 8), en orden:
export const ESTADOS_ENVIO = [
  { id: 'pedido_recibido', label: 'Pedido recibido', icono: '📥' },
  { id: 'compra_proveedor', label: 'Compra al proveedor', icono: '🛒' },
  { id: 'recepcion_origen', label: 'Recibido en origen (hub)', icono: '🏭' },
  { id: 'consolidacion', label: 'Consolidación / empaque', icono: '📦' },
  { id: 'transporte_internacional', label: 'Transporte internacional', icono: '✈️' },
  { id: 'aduana', label: 'Aduana e importación', icono: '🛃' },
  { id: 'recepcion_destino', label: 'Recibido en destino', icono: '🏬' },
  { id: 'chofer_asignado', label: 'Chofer asignado / en ruta', icono: '🚚' },
  { id: 'entregado', label: 'Entregado (con prueba)', icono: '✅' },
]
export const ESTADOS_PEDIDO = ['nuevo', 'validando', 'confirmado', 'en_proceso', 'entregado', 'cancelado', 'devolucion']
export const ESTADOS_PAGO = ['demo_sin_cobro', 'pendiente', 'autorizado', 'capturado', 'reembolsado', 'fallido']
export const ESTADOS_COMPRA = ['pendiente', 'cotizando', 'comprada', 'recibida_origen', 'incidencia', 'cancelada']

export const labelEstadoEnvio = (id) => (ESTADOS_ENVIO.find((e) => e.id === id) || { label: id }).label

// ── Motor de precios ────────────────────────────────────────────────────────
// Desglose de costos → precio de venta. El cliente NUNCA ve este desglose
// interno: solo el precio final y qué incluye (texto comercial).
export function calcularPrecio(producto, config, codigoPais) {
  const pais = (config.paises || []).find((p) => p.codigo === codigoPais) || (config.paises || [])[0] || PAISES_BASE[0]
  const c = Number(producto.costoProveedor) || 0
  const fleteOrigen = Number(producto.fleteOrigen) || 0            // proveedor → hub
  const manejo = Number(config.manejoOrigen) || 0                  // recepción/preparación
  const pesoKg = Math.max(Number(producto.pesoKg) || 0.3, volumetrico(producto))
  const intl = pesoKg * (Number(pais.intlKg) || 0)                 // internacional por kg (vol. si aplica)
  const aduana = (c + intl) * (Number(pais.aranceles) || 0)        // aranceles+gestión sobre CIF aprox
  const entrega = Number(pais.entregaLocal) || 0                   // última milla destino
  const base = c + fleteOrigen + manejo + intl + aduana + entrega
  const margenPct = producto.margenPct != null && producto.margenPct !== ''
    ? Number(producto.margenPct)
    : (config.margenesPorCategoria || {})[producto.categoria] != null
      ? Number(config.margenesPorCategoria[producto.categoria])
      : Number(config.margenPorDefecto) || 0.3
  const margen = base * margenPct
  const comision = (base + margen) * (Number(config.comisionPagoPct) || 0)
  const bruto = base + margen + comision
  const precioUSD = redondear(bruto, config.redondeo)
  return {
    pais: pais.codigo,
    moneda: pais.moneda,
    tc: Number(pais.tc) || 1,
    precioUSD,
    precioLocal: redondear(precioUSD * (Number(pais.tc) || 1), config.redondeo),
    margenPct,
    desglose: {
      producto: r2(c), fleteOrigen: r2(fleteOrigen), manejoOrigen: r2(manejo),
      internacional: r2(intl), aduana: r2(aduana), entregaLocal: r2(entrega),
      comisionPago: r2(comision), margen: r2(margen),
    },
    alertaMargen: margenPct < (Number(config.margenMinimo) || 0),
  }
}
export function volumetrico(p) {
  const l = Number(p.largoCm) || 0, a = Number(p.anchoCm) || 0, h = Number(p.altoCm) || 0
  return l && a && h ? (l * a * h) / 5000 : 0 // divisor aéreo estándar
}
export function redondear(n, modo) {
  if (modo === 'entero') return Math.ceil(n)
  if (modo === 'centavos') return Math.round(n * 100) / 100
  return Math.max(0.99, Math.ceil(n) - 0.01) // '0.99'
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const money2 = (n, moneda) => `${moneda === 'USD' || !moneda ? '$' : moneda + ' '}${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Carrito (localStorage: sobrevive registro/inicio de sesión) ────────────
const CART_KEY = 'mp_ecom_carrito'
export function leerCarrito() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] }
}
export function guardarCarrito(items) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(items)) } catch { /* lleno/privado */ }
}

// ── Datos de DEMOSTRACIÓN (claramente marcados: demo:true en cada doc) ─────
export const PRODUCTOS_DEMO = [
  { nombre: 'Audífonos inalámbricos TWS Pro', categoria: 'Electrónica', proveedor: 'aliexpress', refProveedor: 'AE-100482-TWS', costoProveedor: 8.4, fleteOrigen: 1.1, pesoKg: 0.25, variantes: ['Negro', 'Blanco'], descripcion: 'Bluetooth 5.3, estuche de carga, cancelación pasiva.', emoji: '🎧', paises: ['VE', 'CO', 'MX'], tipo: 'bajo_pedido' },
  { nombre: 'Freidora de aire 5.5L', categoria: 'Hogar', proveedor: 'alibaba', refProveedor: 'ALB-7731-AF55', costoProveedor: 21.0, fleteOrigen: 4.8, pesoKg: 4.6, largoCm: 36, anchoCm: 32, altoCm: 34, variantes: ['110V'], descripcion: 'Panel digital, 8 programas, canasta antiadherente.', emoji: '🍟', paises: ['VE', 'CO'], tipo: 'bajo_pedido', moq: 10 },
  { nombre: 'Smartwatch deportivo 1.8"', categoria: 'Electrónica', proveedor: 'aliexpress', refProveedor: 'AE-55019-SW18', costoProveedor: 11.2, fleteOrigen: 1.2, pesoKg: 0.2, variantes: ['Negro', 'Rosa', 'Azul'], descripcion: 'Oxígeno en sangre, notificaciones, 7 días de batería.', emoji: '⌚', paises: ['VE', 'CO', 'MX'], tipo: 'bajo_pedido' },
  { nombre: 'Juego de herramientas 108 pzas', categoria: 'Herramientas', proveedor: 'alibaba', refProveedor: 'ALB-2209-TK108', costoProveedor: 26.5, fleteOrigen: 5.5, pesoKg: 6.2, largoCm: 42, anchoCm: 30, altoCm: 12, variantes: ['Estuche rígido'], descripcion: 'Cromo-vanadio, dados 1/4" y 1/2", maletín.', emoji: '🧰', paises: ['VE'], tipo: 'bajo_pedido', moq: 5 },
  { nombre: 'Lámpara LED de escritorio', categoria: 'Hogar', proveedor: 'amazon', refProveedor: 'AMZ-B0C-LED22', costoProveedor: 13.9, fleteOrigen: 2.2, pesoKg: 0.9, variantes: ['Blanca'], descripcion: '3 temperaturas de color, puerto USB, brazo plegable.', emoji: '💡', paises: ['VE', 'MX'], tipo: 'bajo_pedido' },
  { nombre: 'Kit luces LED interior auto', categoria: 'Autopartes', proveedor: 'aliexpress', refProveedor: 'AE-88274-CARLED', costoProveedor: 6.8, fleteOrigen: 0.9, pesoKg: 0.3, variantes: ['RGB App'], descripcion: '4 tiras, control por app, 12V.', emoji: '🚗', paises: ['VE', 'CO', 'MX'], tipo: 'bajo_pedido' },
  { nombre: 'Monitor 24" FHD 100Hz', categoria: 'Electrónica', proveedor: 'amazon', refProveedor: 'AMZ-B0D-MN24', costoProveedor: 74.0, fleteOrigen: 8.0, pesoKg: 3.8, largoCm: 55, anchoCm: 36, altoCm: 12, variantes: ['Negro'], descripcion: 'IPS, HDMI+VGA, marcos delgados.', emoji: '🖥️', paises: ['VE'], tipo: 'bajo_pedido' },
  { nombre: 'Set de ollas antiadherentes 10 pzas', categoria: 'Hogar', proveedor: 'alibaba', refProveedor: 'ALB-9912-POTS', costoProveedor: 32.0, fleteOrigen: 6.4, pesoKg: 7.5, largoCm: 50, anchoCm: 32, altoCm: 28, variantes: ['Granito gris'], descripcion: 'Inducción y gas, tapas de vidrio templado.', emoji: '🍳', paises: ['CO', 'MX'], tipo: 'bajo_pedido', moq: 8 },
  { nombre: 'Carriola ligera plegable', categoria: 'Bebés y niños', proveedor: 'alibaba', refProveedor: 'ALB-3307-STRL', costoProveedor: 38.0, fleteOrigen: 7.2, pesoKg: 6.8, largoCm: 60, anchoCm: 45, altoCm: 30, variantes: ['Gris', 'Azul'], descripcion: 'Plegado con una mano, apta cabina avión.', emoji: '👶', paises: ['VE', 'CO'], tipo: 'bajo_pedido', moq: 6 },
  { nombre: 'Tenis running unisex', categoria: 'Moda', proveedor: 'aliexpress', refProveedor: 'AE-20931-RUN', costoProveedor: 12.5, fleteOrigen: 1.8, pesoKg: 0.8, variantes: ['38', '39', '40', '41', '42', '43'], descripcion: 'Malla transpirable, suela EVA.', emoji: '👟', paises: ['VE', 'CO', 'MX'], tipo: 'bajo_pedido' },
]

// Pedido de demostración para probar el recorrido completo sin comprar nada.
export const PEDIDO_DEMO = {
  demo: true,
  cliente: { nombre: 'Cliente de Prueba', correo: 'cliente.demo@milepay.io', telefono: '+58 412 000 0000' },
  pais: 'VE',
  direccion: { linea1: 'Av. Principal, Res. Demo, Torre A', ciudad: 'Caracas', zona: 'Chacao', referencia: 'Frente a la plaza' },
  notas: 'PEDIDO DE DEMOSTRACIÓN — no comprar, no cobrar, no enviar.',
}
