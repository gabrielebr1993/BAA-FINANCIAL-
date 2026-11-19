// ============================================================================
// CONFIG ÚNICO DE MÓDULOS — fuente de verdad para las 3 pantallas públicas
// (inicio `/`, selector `/elegir`, login `<ModuleLogin>`).
//
// Cada módulo: id, ruta de login ACTUAL (no se cambia), colores (fuerte/suave +
// token Tailwind rd-*), ícono (lucide), y textos bilingües EN/ES. Los textos
// son objetos { en, es }; los componentes eligen con el idioma activo.
//
// NINGÚN dato aquí es real: los `preview` son datos de EJEMPLO ("Sample data").
// ============================================================================
import { Package, Truck, Warehouse, Globe } from 'lucide-react'

export const MODULES = [
  {
    id: 'package',
    loginRoute: '/dashboard',
    token: 'parcel',
    strong: '#3D8BFF',
    soft: '#EAF2FF',
    icon: Package,
    name: { en: 'Last mile', es: 'Última milla' },
    label: { en: 'Last-mile delivery', es: 'Entrega de última milla' },
    phrase: { en: 'I deliver parcels', es: 'Entrego paquetes' },
    hero: { en: 'Every invoice balances. Every trip gets paid.', es: 'Cada factura cuadra. Cada viaje se paga.' },
    paragraph: {
      en: 'Reconcile what you invoice with what you get paid, pay every driver right, and keep claims under control — all in one place.',
      es: 'Concilia lo que facturas con lo que te pagan, paga a cada chofer justo y mantén los claims bajo control — todo en un solo lugar.',
    },
    loginTitle: { en: 'Your invoices, balanced to the cent.', es: 'Tus facturas, cuadradas al centavo.' },
    benefits: [
      { en: 'Invoices that always balance', es: 'Facturas que siempre cuadran' },
      { en: 'Driver pay, automatic', es: 'Pago a choferes, automático' },
      { en: 'Claims under control', es: 'Claims bajo control' },
    ],
    preview: {
      type: 'invoice',
      title: { en: 'Invoice · Week 46', es: 'Factura · Semana 46' },
      rows: [
        { label: { en: 'Deliveries', es: 'Entregas' }, value: '$4,820.00' },
        { label: { en: 'Adjustments', es: 'Ajustes' }, value: '−$120.00' },
        { label: { en: 'Collected', es: 'Cobrado' }, value: '$4,700.00' },
      ],
      footer: { label: { en: 'Difference', es: 'Diferencia' }, value: '$0.00' },
    },
  },
  {
    id: 'freight',
    loginRoute: '/bulk',
    token: 'freight',
    strong: '#F2A900',
    soft: '#FFF5DB',
    icon: Truck,
    name: { en: 'Freight', es: 'Freight' },
    label: { en: 'Bulk & materials', es: 'Carga y materiales' },
    phrase: { en: 'I haul materials', es: 'Transporto materiales' },
    hero: { en: 'Every load dispatched. Every ton billed.', es: 'Cada carga despachada. Cada tonelada facturada.' },
    paragraph: {
      en: 'Dispatch loads, track them live and bill every ton — without losing a single trip between the yard and the invoice.',
      es: 'Despacha cargas, síguelas en vivo y factura cada tonelada — sin perder un solo viaje entre el patio y la factura.',
    },
    loginTitle: { en: 'Your loads, live on the map.', es: 'Tus cargas, en vivo en el mapa.' },
    benefits: [
      { en: 'Dispatch in one view', es: 'Despacho en una vista' },
      { en: 'Every ton billed', es: 'Cada tonelada facturada' },
      { en: 'Live load tracking', es: 'Seguimiento en vivo' },
    ],
    preview: {
      type: 'board',
      kpis: [
        { label: { en: 'Loads', es: 'Cargas' }, value: '38' },
        { label: { en: 'Tons', es: 'Toneladas' }, value: '512' },
        { label: { en: 'Billed', es: 'Facturado' }, value: '$61,200' },
      ],
      rows: [
        { name: 'DAL → HOU', status: { en: 'Dispatched', es: 'Despachada' }, tone: 'progress' },
        { name: { en: 'Aggregate · 24t', es: 'Agregado · 24t' }, status: { en: 'In transit', es: 'En tránsito' }, tone: 'progress' },
        { name: { en: 'Invoice #1042', es: 'Factura #1042' }, status: { en: 'Billed', es: 'Facturada' }, tone: 'done' },
      ],
    },
  },
  {
    id: 'warehouse',
    loginRoute: '/wh',
    token: 'wh',
    strong: '#2BC48A',
    soft: '#E4F8EF',
    icon: Warehouse,
    name: { en: 'Warehouse', es: 'Warehouse' },
    label: { en: 'Fulfillment & staffing', es: 'Fulfillment y personal' },
    phrase: { en: 'I need a warehouse', es: 'Necesito una bodega' },
    hero: { en: 'Every package sorted. Every shift covered.', es: 'Cada paquete clasificado. Cada turno cubierto.' },
    paragraph: {
      en: 'Keep sorting on track, shifts fully staffed and inventory accurate — with one board for the whole warehouse.',
      es: 'Mantén la clasificación al día, los turnos cubiertos y el inventario exacto — con un solo tablero para toda la bodega.',
    },
    loginTitle: { en: 'Your warehouse, under control.', es: 'Tu bodega, bajo control.' },
    benefits: [
      { en: 'Sorting, tracked', es: 'Clasificación, controlada' },
      { en: 'Shifts always covered', es: 'Turnos siempre cubiertos' },
      { en: 'Inventory accuracy', es: 'Inventario exacto' },
    ],
    preview: {
      type: 'board',
      kpis: [
        { label: { en: 'Packages', es: 'Paquetes' }, value: '9,480' },
        { label: { en: 'Shifts', es: 'Turnos' }, value: '12/12' },
        { label: { en: 'Accuracy', es: 'Exactitud' }, value: '99.6%' },
      ],
      rows: [
        { name: { en: 'Zone A · Sorting', es: 'Zona A · Clasificación' }, status: { en: 'On track', es: 'Al día' }, tone: 'ok' },
        { name: { en: 'Night shift', es: 'Turno noche' }, status: { en: 'Covered', es: 'Cubierto' }, tone: 'done' },
        { name: { en: 'Inbound · 3 trucks', es: 'Entrada · 3 camiones' }, status: { en: 'Receiving', es: 'Recibiendo' }, tone: 'progress' },
      ],
    },
  },
  {
    id: 'ecommerce',
    loginRoute: '/shop',
    token: 'ecom',
    strong: '#9B6BFF',
    soft: '#F1EAFF',
    icon: Globe,
    name: { en: 'Ecommerce', es: 'Ecommerce' },
    label: { en: 'Cross-border shopping', es: 'Compras internacionales' },
    phrase: { en: 'I want to buy abroad', es: 'Quiero comprar afuera' },
    hero: { en: 'Shop abroad. Pay one final price.', es: 'Compra afuera. Paga un precio final.' },
    paragraph: {
      en: 'Buy from stores abroad and get one final price to your door — no customs surprises, tracked all the way.',
      es: 'Compra en tiendas del extranjero y recibe un precio final hasta tu puerta — sin sorpresas de aduana, rastreado hasta el final.',
    },
    loginTitle: { en: 'Your orders, tracked to the door.', es: 'Tus pedidos, rastreados hasta la puerta.' },
    benefits: [
      { en: 'Shop from abroad', es: 'Compra del extranjero' },
      { en: 'One final price', es: 'Un solo precio final' },
      { en: 'Tracked to your door', es: 'Rastreado hasta tu puerta' },
    ],
    preview: {
      type: 'board',
      kpis: [
        { label: { en: 'Orders', es: 'Pedidos' }, value: '274' },
        { label: { en: 'In transit', es: 'En tránsito' }, value: '58' },
        { label: { en: 'Surprises', es: 'Sorpresas' }, value: '$0' },
      ],
      rows: [
        { name: { en: 'Order #5521', es: 'Pedido #5521' }, status: { en: 'Purchased', es: 'Comprado' }, tone: 'done' },
        { name: { en: 'Parcel · MIA', es: 'Paquete · MIA' }, status: { en: 'In transit', es: 'En tránsito' }, tone: 'progress' },
        { name: { en: 'Delivery · Door', es: 'Entrega · Puerta' }, status: { en: 'Delivered', es: 'Entregado' }, tone: 'done' },
      ],
    },
  },
]

export const MODULE_IDS = MODULES.map((m) => m.id)
export const getModule = (id) => MODULES.find((m) => m.id === id) || MODULES[0]
// Texto bilingüe: tx({en,es}, lang) → string. Acepta string plano también.
export const tx = (val, lang) => (val && typeof val === 'object' ? (val[lang] ?? val.en) : val)
