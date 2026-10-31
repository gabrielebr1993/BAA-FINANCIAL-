// ============================================================================
// Verificación POD — Gofo (MilePay, módulo Gofo)
// ----------------------------------------------------------------------------
// MODO REAL (piloto DFW-BAA) + MODO EJEMPLO como respaldo.
//  * Modo real: lee entregas de la colección Firestore `podVerifications`
//    (companyId de la empresa activa, carrier 'gofo'). Cada entrega trae
//    waybill, sitio, chofer (solo nombre, nunca datos sensibles), tipo,
//    fechaEntrega 'YYYY-MM-DD', origen ('portal-gofo' | 'milepay') y sus
//    3 fotos POD (rol 1 etiqueta, 2 paquete en sitio, 3 número/dirección).
//    La revisión humana (confirmar / marcar para revisión) SE GUARDA en
//    Firestore en modo real, también en lote. NUNCA se penaliza a un chofer
//    automáticamente por el veredicto, y NO se tocan pagos, claims, facturas
//    ni datos de choferes.
//  * Modo ejemplo: si NO hay documentos reales para esta empresa, la
//    pantalla sigue mostrando los 10 EJEMPLOS marcados, con revisión solo
//    local. Los ejemplos NUNCA se mezclan con entregas reales.
//  * Sin conexión automática al portal Gofo: el portal es solo fuente de
//    consulta. Las entregas reales llegan sembradas / importadas a mano
//    (ver APLICAR.md); la conexión automática al portal queda pendiente y
//    NO está inventada aquí (no existe una API pública de Gofo).
//  * Filtro por rango de fechas (Desde/Hasta, por fechaEntrega) + filtro
//    de semáforo, ciudad/sitio y búsqueda por guía o chofer. El rango
//    también recalcula los contadores del semáforo. Por defecto: últimos
//    7 días (hoy incluido). "Volver a últimos 7 días" restaura ese rango.
//    Los ejemplos no tienen fechaEntrega real, así que en modo ejemplo el
//    rango de fechas no los oculta (se indica en pantalla).
// Criterio aplicado (sin inventar una regla genérica de puerta):
//  * Guía BAA de choferes: 3 fotos por entrega — 1) etiqueta clara (solo la
//    etiqueta, no el paquete), 2) paquete en su lugar, 3) número / prueba de
//    dirección según el tipo de entrega.
//  * Criterios GF POD de Gofo, Partes 1 y 2, por escenario: casa, apartamento /
//    condo, en persona, punto de recogida, comercial, escuela / hospital /
//    institución, FLA, granjas / montañas, dirección inaccesible y PUDO.
// Estado general de una entrega = el peor estado de sus 3 fotos:
//  rojo (urgente) > amarillo (intermedia) > verde (verificada y OK).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, CheckCircle2, AlertTriangle, XCircle, MapPin } from 'lucide-react'
import { collection, doc, getCountFromServer, getDocs, limit, onSnapshot, query, runTransaction, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { Card, PageTitle, EstadoVacio } from '../components/ui'
import { useCarrier } from '../carriers/CarrierContext'

// Los 11 sitios Gofo vistos en el selector del portal (solo consulta).
export const SITIOS_GOFO = [
  'DFW-BAA', 'AUS-BAA', 'IAH-BAA', 'MSN-BAA', 'ORD-BAA', 'ABI-BAA',
  'IAH02-BAA', 'DFW02-BAA', 'AUS02-BAA', 'ORD02-BAA', 'LCH-BAA',
]

const ESTADOS = {
  rojo: { label: 'Urgente', orden: 0, chip: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', borde: 'border-red-300 dark:border-red-500/40' },
  amarillo: { label: 'Intermedia', orden: 1, chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', borde: 'border-amber-300 dark:border-amber-500/40' },
  verde: { label: 'Verificada y OK', orden: 2, chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', borde: 'border-emerald-300 dark:border-emerald-500/40' },
}

function IconoEstado({ estado, size = 16 }) {
  if (estado === 'rojo') return <XCircle size={size} strokeWidth={1.8} />
  if (estado === 'amarillo') return <AlertTriangle size={size} strokeWidth={1.8} />
  return <CheckCircle2 size={size} strokeWidth={1.8} />
}

function estadoGeneral(fotos) {
  if (fotos.some((f) => f.estado === 'rojo')) return 'rojo'
  if (fotos.some((f) => f.estado === 'amarillo')) return 'amarillo'
  return 'verde'
}

// --- Fechas (locales, formato YYYY-MM-DD, sin depender de UTC) --------------
function fechaLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}
function rangoUltimos7Dias() {
  const hoy = new Date()
  const desde = new Date(hoy)
  desde.setDate(hoy.getDate() - 6)
  return { desde: fechaLocal(desde), hasta: fechaLocal(hoy) }
}
function enRango(fecha, desde, hasta) {
  if (!fecha) return true // sin fecha (ejemplos): no se oculta por fecha
  if (desde && fecha < desde) return false
  if (hasta && fecha > hasta) return false
  return true
}

// --- Normalización de un documento real de podVerifications -----------------
// No inventa fotos ni estados: si un documento trae menos de 3 fotos, se
// muestra tal cual y la tarjeta avisa cuántas trae (n/3).
const ROLES_FOTO = ['etiqueta', 'en_sitio', 'numero']

// Modo flujo SIN COLA (Piso 1): tipos y criterio corto por tipo, tomados
// de la guía BAA y los criterios GF POD ya cargados en esta pantalla.
const TIPOS_FLUJO = ['Casa', 'Apartamento', 'Apartamento / Condo', 'En persona', 'Comercial', 'Escuela / Hospital', 'Locker', 'Mail room', 'Granja / Montaña', 'PUDO', 'Punto de recogida', 'Negocio / Otro']
const CRITERIO_EN_SITIO = {
  Casa: 'Casa: paquete en la puerta de la casa, puerta completa visible, no en zona pública lejos de la puerta.',
  Apartamento: 'Apartamento: paquete con la puerta completa y el número de apartamento visible.',
  'Apartamento / Condo': 'Apartamento/condo: paquete con puerta y número; prioridad puerta > recepción > sala de correo > zona de buzones dentro de la puerta.',
  'En persona': 'En persona: paquete entregado al cliente, manos visibles, nunca la cara ni documentos.',
  Comercial: 'Comercial: etiqueta hacia arriba en recepción o con el personal, entorno de trabajo visible; negocio cerrado NO se deja fuera.',
  'Escuela / Hospital': 'Escuela/hospital: paquete en el punto de recogida autorizado con logo identificable; hace falta foto exterior del punto.',
  Locker: 'Locker: pantalla con nombre y unidad del cliente y paquete dentro del locker abierto; si la pantalla no muestra nombre y unidad, no se deposita.',
  'Mail room': 'Mail room: paquete en el estante/rack de la sala de correo autorizada, con el exterior de la sala o entrada principal.',
  'Granja / Montaña': 'Granja/montaña: lugar protegido, prioridad dentro de la barandilla > debajo del buzón; nunca dentro del buzón.',
  PUDO: 'PUDO: proceso de entrega en el punto visible, paquetes escaneados y almacenados uno por uno.',
  'Punto de recogida': 'Punto de recogida: nunca USPS/PO BOX ni Amazon locker; punto autorizado e identificable.',
  'Negocio / Otro': 'Negocio/otro: lugar seguro no visible desde la calle, con exterior y número del lugar.',
}
function criterioFlujo(tipo) {
  return {
    etiqueta: 'Etiqueta clara: código de barras y número de seguimiento visibles, sin borrosidad, y coincide con esta guía.',
    en_sitio: CRITERIO_EN_SITIO[tipo] || CRITERIO_EN_SITIO['Negocio / Otro'],
    numero: (tipo === 'Apartamento' || tipo === 'Apartamento / Condo')
      ? 'Apartamento: número de puerta claro; además edificio y entrada del condo con número y nombre cuando aplique.'
      : 'Número de casa/edificio claro y enfocado; si no hay número, captura de Google Maps o panorámica que pruebe la dirección.',
  }
}
const TITULOS_FOTO = { etiqueta: 'Foto 1 · Etiqueta', en_sitio: 'Foto 2 · Paquete en sitio', numero: 'Foto 3 · Número / dirección' }
function normalizarFoto(f, i) {
  return {
    rol: ROLES_FOTO[i] || f?.rol || 'foto',
    titulo: f?.titulo || `Foto ${i + 1}`,
    estado: ['rojo', 'amarillo', 'verde'].includes(f?.estado) ? f.estado : 'amarillo',
    motivo: f?.motivo || 'Sin motivo registrado.',
    criterio: f?.criterio || '',
    url: f?.url || null,
  }
}
function normalizarReal(docSnap) {
  const d = docSnap.data() || {}
  const fotos = Array.isArray(d.fotos) ? d.fotos.map(normalizarFoto) : []
  return {
    id: docSnap.id,
    esEjemplo: false,
    waybill: d.waybill || docSnap.id,
    sitio: d.site || d.sitio || '—',
    chofer: d.courier || d.chofer || d.driver || '—',
    tipo: d.tipo || '—',
    fechaEntrega: typeof d.fechaEntrega === 'string' ? d.fechaEntrega : null,
    origen: d.origen || d.origin || null,
    // Link a Gofo (2026-10-29): si el documento trae un gofoUrl/portalUrl
    // exacto se usa ese; si no, el portal general, donde se busca la guía
    // por su waybill y se abre su celda POD. Solo para entregas reales.
    gofoUrl: d.gofoUrl || d.portalUrl || 'https://dms.gofoexpress.com/login',
    fotos,
    general: estadoGeneral(fotos.length ? fotos : [{ estado: 'amarillo' }]),
    revision: d.revision || null, // 'confirmado' | 'revision' | null
  }
}
function ejemploANormal(e) {
  return { ...e, id: e.waybill, esEjemplo: true, fechaEntrega: null, origen: null, gofoUrl: null, general: estadoGeneral(e.fotos) }
}

// ---------------------------------------------------------------------------
// EJEMPLOS. Cada entrega trae sus 3 fotos POD. Las fotos son marcadores de
// posición descriptivos (sin fotos reales): al tocar una se abre en grande
// con su motivo y el criterio que verifica. No hay imágenes externas.
// ---------------------------------------------------------------------------
const EJEMPLOS = [
  {
    waybill: 'EJ-0201', sitio: 'DFW-BAA', chofer: 'Chofer ejemplo 1', tipo: 'Casa',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Paquete en puerta', estado: 'verde', motivo: 'Paquete en la puerta, puerta completa visible.', criterio: 'Casa: paquete en la puerta de la casa, no en zona pública peligrosa lejos de la puerta.' },
      { titulo: 'Foto 3 · Número de casa', estado: 'verde', motivo: 'Número claro y enfocado.', criterio: 'Casa: número de casa claro; si no hay número, captura de Google Maps o panorámica de la casa.' },
    ],
  },
  {
    waybill: 'EJ-0202', sitio: 'DFW-BAA', chofer: 'Chofer ejemplo 2', tipo: 'Casa',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Paquete en mano', estado: 'amarillo', motivo: 'Etiqueta clara, pero no se ve puerta ni porche.', criterio: 'Casa: hace falta la foto del paquete colocado en la puerta; la foto en mano solo cubre la etiqueta.' },
      { titulo: 'Foto 3 · Número de casa', estado: 'verde', motivo: 'Número claro y enfocado.', criterio: 'Casa: número de casa claro; si no hay número, captura de Google Maps o panorámica de la casa.' },
    ],
  },
  {
    waybill: 'EJ-0203', sitio: 'DFW-BAA', chofer: 'Chofer ejemplo 3', tipo: 'Apartamento / Condo',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Buzón en primer plano', estado: 'rojo', motivo: 'Primer plano de buzón, sin paquete y sin puerta.', criterio: 'Fallo duro: sin foto de distancia / ubicación del paquete. La zona de buzones debe estar dentro de la puerta y el paquete debe verse colocado.' },
      { titulo: 'Foto 3 · Exterior del edificio', estado: 'amarillo', motivo: 'Edificio visible, pero sin número de puerta del destinatario.', criterio: 'Apartamento: número de puerta o entorno evidente; prioridad puerta de la habitación > recepción > sala de correo > zona de buzones.' },
    ],
  },
  {
    waybill: 'EJ-0204', sitio: 'AUS-BAA', chofer: 'Chofer ejemplo 4', tipo: 'En persona',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Entrega en persona', estado: 'amarillo', motivo: 'Solo se ve la espalda del destinatario, sin proceso de entrega.', criterio: 'Fallo duro en persona: sin proceso de entrega no vale, aunque no se fotografíe la cara ni el documento de identidad.' },
      { titulo: 'Foto 3 · Número / edificio', estado: 'verde', motivo: 'Número de puerta visible.', criterio: 'En persona: número de puerta del destinatario o aspecto del edificio, más coordenadas correctas.' },
    ],
  },
  {
    waybill: 'EJ-0205', sitio: 'IAH-BAA', chofer: 'Chofer ejemplo 5', tipo: 'Comercial',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'rojo', motivo: 'Etiqueta borrosa: el número de Waybill no se distingue.', criterio: 'Fallo duro: número de Waybill borroso, que no coincide con el sistema o demasiado lejos.' },
      { titulo: 'Foto 2 · Recepción', estado: 'verde', motivo: 'Paquete con etiqueta hacia arriba en recepción, personal visible.', criterio: 'Comercial: etiqueta hacia arriba, en recepción o entregado al personal, con personal o entorno de trabajo visible.' },
      { titulo: 'Foto 3 · Exterior comercial', estado: 'verde', motivo: 'Número y exterior de la tienda visibles.', criterio: 'Comercial: número de dirección, exterior de la tienda o captura de mapa.' },
    ],
  },
  {
    waybill: 'EJ-0206', sitio: 'IAH-BAA', chofer: 'Chofer ejemplo 6', tipo: 'Escuela / Hospital',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Punto de recogida', estado: 'amarillo', motivo: 'Paquete en sala de correo, pero el logo del punto no se identifica.', criterio: 'Escuela / hospital: el logo del punto de recogida debe identificarse claramente y hace falta foto exterior del punto (puede haber varios).' },
      { titulo: 'Foto 3 · Exterior del punto', estado: 'verde', motivo: 'Exterior del punto visible.', criterio: 'Escuela / hospital: foto exterior del punto obligatoria; si no se puede contactar al destinatario y no hay punto autorizado, NO es entrega exitosa.' },
    ],
  },
  {
    waybill: 'EJ-0207', sitio: 'AUS-BAA', chofer: 'Chofer ejemplo 7', tipo: 'Locker',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Pantalla del locker', estado: 'rojo', motivo: 'La pantalla no muestra nombre ni unidad del destinatario.', criterio: 'Locker: si la pantalla no muestra nombre y unidad, NO se deposita; hay que volver a introducir la información. Lockers no cooperativos conllevan riesgo de pérdida y reclamo.' },
      { titulo: 'Foto 3 · Entrada del condominio', estado: 'verde', motivo: 'Número y nombre de la entrada visibles.', criterio: 'Locker / condo: entrada con número y nombre para confirmar la dirección correcta.' },
    ],
  },
  {
    waybill: 'EJ-0208', sitio: 'ORD-BAA', chofer: 'Chofer ejemplo 8', tipo: 'Granja / Montaña',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Paquete debajo del buzón', estado: 'verde', motivo: 'Puerta del patio cerrada: colocar debajo del buzón está permitido.', criterio: 'Granja / montaña: prioridad zona protegida dentro de la barandilla > debajo del buzón; nunca dentro del buzón ni en buzones de vías principales.' },
      { titulo: 'Foto 3 · Panorámica', estado: 'verde', motivo: 'Número de puerta y panorámica visibles.', criterio: 'Granja / montaña: número de puerta o foto panorámica, más foto de colocación.' },
    ],
  },
  {
    waybill: 'EJ-0209', sitio: 'MSN-BAA', chofer: 'Chofer ejemplo 9', tipo: 'PUDO',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Entrega en PUDO', estado: 'verde', motivo: 'Proceso de entrega visible, identidad verificada en recogida.', criterio: 'PUDO: escanear y almacenar uno por uno, verificar identidad en la recogida, POD estándar.' },
      { titulo: 'Foto 3 · Panorámica PUDO', estado: 'verde', motivo: 'Punto PUDO completo visible.', criterio: 'PUDO: panorámica del punto; la foto de la firma del destinatario en el Waybill es opcional, nunca cara ni documento de identidad.' },
    ],
  },
  {
    waybill: 'EJ-0210', sitio: 'ABI-BAA', chofer: 'Chofer ejemplo 10', tipo: 'Punto de recogida',
    fotos: [
      { titulo: 'Foto 1 · Etiqueta', estado: 'verde', motivo: 'Código de barras y número legibles.', criterio: 'Etiqueta clara: código de barras y seguimiento visibles, sin borrosidad.' },
      { titulo: 'Foto 2 · Buzón USPS', estado: 'rojo', motivo: 'Paquete colocado en buzón USPS: entrega prohibida.', criterio: 'Fallo duro: USPS / PO BOX no se puede entregar; si el cliente reclama no haberlo recibido, se juzga Fake POD.' },
      { titulo: 'Foto 3 · Exterior', estado: 'verde', motivo: 'Exterior del edificio visible.', criterio: 'Punto de recogida: la foto colectiva debe mostrar paquetes de otros servicios de entrega.' },
    ],
  },
]

const FALLOS_DUROS = [
  'Sin foto de distancia / ubicación del paquete.',
  'Número de Waybill que no coincide con el sistema, borroso o demasiado lejos.',
  'Número de puerta, edificio o habitación ausente, borroso o demasiado oscuro, sin exterior que confirme el edificio.',
  'Buzón USPS / PO BOX, o buzón en vía pública principal.',
  'Zonas comunes desatendidas de escuela o apartamento.',
  'Entrada de tienda, pasillo, escalera o área pública desatendida.',
  'Entrega en persona sin proceso de entrega (o solo la espalda del destinatario).',
  'Fotografiar la cara del destinatario o su documento de identidad.',
]

export default function VerificacionPod() {
  const { carrier } = useCarrier()
  const { companyId: companyIdPerfil, user } = useAuth()
  // CORRECCIÓN 2026-10-29: usar la empresa activa seleccionada (DataContext),
  // no solo el companyId del perfil. Para un súper-admin sin companyId en su
  // perfil, useAuth da null y la consulta nunca corría, por eso la pantalla
  // se quedaba en EJEMPLO aunque existieran documentos reales para la empresa
  // seleccionada ("En uso"). Respaldo: companyId del perfil si no hay activa.
  const { activeCompanyId, ajustes, reloadAjustes } = useData()
  const companyId = activeCompanyId || companyIdPerfil
  // Barra de análisis en MilePay (2026-10-29): el análisis externo escribe
  // su progreso en settings/{companyId}.analisisPodHoy (sin colección nueva
  // ni regla nueva). Si aún no hay datos, la barra muestra 0% y lo dice.
  // Auto-refresco de la barra (2026-10-29): sin esto, aunque el análisis
  // escriba su progreso en settings, la barra no se movía hasta recargar
  // la página o cambiar de empresa. Ahora se recargan los ajustes cada
  // 15 s mientras haya un análisis en curso (porcentaje < 100).
  const reloadRef = useRef(null)
  reloadRef.current = reloadAjustes
  // Declarar antes de su primer uso (fix PR #11): si queda abajo, la
  // pantalla rompe con error de inicialización en producción.
  const [progresoEnVivo, setProgresoEnVivo] = useState(null)
  const [progresoSitiosEnVivo, setProgresoSitiosEnVivo] = useState(null)
  const [colaSitiosEnVivo, setColaSitiosEnVivo] = useState(null)
  const progresoAnalisis = progresoEnVivo || ajustes?.analisisPodHoy || null
  // Progreso POR CIUDAD (2026-10-29): el trabajo por sitios escribe en
  // settings/{companyId}.analisisPodHoySitios un mapa sitio -> {porcentaje,
  // estado, entregadas, enProgreso, calificadas, total, actualizadas}. Así
  // en MilePay se ve el avance de cada ciudad a la vez, no un solo %.
  const progresoSitios = progresoSitiosEnVivo || ajustes?.analisisPodHoySitios || null
  // Fecha real de los datos de progreso por ciudad: cada entrada puede
  // guardar su fecha ('YYYY-MM-DD'); si ninguna la guarda, se dice tal
  // cual en la tarjeta en vez de presentarla como "hoy".
  const fechasProgresoSitios = SITIOS_GOFO.map((s) => progresoSitios?.[s]?.fecha).filter((f) => typeof f === 'string' && f.length >= 10)
  const fechaProgresoDatos = fechasProgresoSitios.length ? fechasProgresoSitios[0] : null
  const progresoEsDeHoy = fechaProgresoDatos !== null && fechaProgresoDatos === fechaLocal(new Date())
  // PISO 1 (cola, 2026-10-29): totales del índice/cola por sitio, escritos
  // en settings/{companyId}.colaPodHoySitios por el importador de índice.
  const colaSitios = colaSitiosEnVivo || ajustes?.colaPodHoySitios || null
  // conteoPorSitio va DESPUÉS de la declaración de reales (fix PR #12):
  // si queda aquí, rompe en producción con error de inicialización.
  useEffect(() => {
    if (!progresoAnalisis || (typeof progresoAnalisis.porcentaje === 'number' && progresoAnalisis.porcentaje >= 100)) return undefined
    const id = setInterval(() => { if (reloadRef.current) reloadRef.current() }, 15000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progresoAnalisis?.porcentaje, companyId])
  const porcentajeAnalisis = progresoAnalisis && typeof progresoAnalisis.porcentaje === 'number'
    ? Math.max(0, Math.min(100, progresoAnalisis.porcentaje)) : 0
  // Fix "Sitios /11": algunas escrituras guardan sitiosCompletados como
  // arreglo vacío en vez de número; si es arreglo, usa su largo.
  const sitiosCompletadosAnalisis = Array.isArray(progresoAnalisis?.sitiosCompletados)
    ? progresoAnalisis.sitiosCompletados.length
    : (progresoAnalisis?.sitiosCompletados ?? 0)
  const sitiosTotalesAnalisis = progresoAnalisis?.sitiosTotales ?? 11
  const [filtro, setFiltro] = useState('todas')
  const [sitio, setSitio] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState(() => rangoUltimos7Dias().desde)
  const [hasta, setHasta] = useState(() => rangoUltimos7Dias().hasta)
  const [ampliada, setAmpliada] = useState(null) // { entrega, foto } o null
  const [revisiones, setRevisiones] = useState({}) // id -> 'confirmado' | 'revision'
  const [reales, setReales] = useState([])
  const conteoPorSitio = useMemo(() => {
    const c = {}
    reales.forEach((e) => { c[e.sitio] = (c[e.sitio] || 0) + 1 })
    return c
  }, [reales])
  const [cargandoReales, setCargandoReales] = useState(false)
  const [errorReales, setErrorReales] = useState(null)
  const [seleccion, setSeleccion] = useState([]) // ids de entregas filtradas
  const [mensajeLote, setMensajeLote] = useState(null)
  const [procesandoLote, setProcesandoLote] = useState(false)
  // Importador de índice (Piso 1): sitio, fecha, avance y mensajes.
  const [impSitio, setImpSitio] = useState('DFW-BAA')
  const [impFecha, setImpFecha] = useState(() => fechaLocal(new Date()))
  const [importandoCola, setImportandoCola] = useState(false)
  const [mensajeCola, setMensajeCola] = useState(null)
  const [progresoCola, setProgresoCola] = useState(null)
  // Modo flujo SIN COLA: la entrega tomada ahora mismo y su captura.
  const [flujoSitio, setFlujoSitio] = useState('DFW-BAA')
  const [flujoActual, setFlujoActual] = useState(null)
  const [flujoTipo, setFlujoTipo] = useState('Casa')
  const [flujoFotos, setFlujoFotos] = useState(() => ROLES_FOTO.map(() => ({ estado: 'verde', motivo: '' })))
  const [flujoPendientes, setFlujoPendientes] = useState(null)
  const [flujoMsg, setFlujoMsg] = useState(null)
  const [flujoOcupado, setFlujoOcupado] = useState(false)

  // Carga real EN TIEMPO REAL (2026-10-29): onSnapshot en vez de una sola
  // lectura. Así, si se verifican 1500 entregas y luego aparecen 800 sin
  // verificar (o al revés), los contadores, la lista y la barra cambian
  // solos en MilePay, sin recargar la página. Sin companyId no hay
  // consulta: se queda en ejemplos. Si la lectura falla, NO se rompe la
  // pantalla: se avisa y se siguen mostrando los ejemplos marcados.
  useEffect(() => {
    if (!companyId || carrier !== 'gofo') return undefined
    setCargandoReales(true)
    setErrorReales(null)
    const unsub = onSnapshot(
      query(collection(db, 'podVerifications'), where('companyId', '==', companyId)),
      (snap) => {
        const soloGofo = snap.docs.map(normalizarReal).filter((e, i) => {
          const raw = snap.docs[i].data() || {}
          return !raw.carrier || raw.carrier === 'gofo'
        })
        setReales(soloGofo)
        const rev = {}
        soloGofo.forEach((e) => { if (e.revision) rev[e.id] = e.revision })
        setRevisiones((prev) => ({ ...prev, ...rev }))
        setCargandoReales(false)
      },
      (err) => { setErrorReales(err?.message || 'No se pudieron leer las entregas reales.'); setCargandoReales(false) },
    )
    return () => unsub()
  }, [companyId, carrier])
  // Progreso del análisis también en tiempo real: escucha settings/{companyId}
  // directamente, no solo la carga inicial de DataContext.
  useEffect(() => {
    if (!companyId) return undefined
    return onSnapshot(doc(db, 'settings', companyId), (snap) => {
      setProgresoEnVivo(snap.exists() ? (snap.data()?.analisisPodHoy || null) : null)
      setProgresoSitiosEnVivo(snap.exists() ? (snap.data()?.analisisPodHoySitios || null) : null)
      setColaSitiosEnVivo(snap.exists() ? (snap.data()?.colaPodHoySitios || null) : null)
    }, () => {})
  }, [companyId])

  const modoReal = reales.length > 0
  const fuente = useMemo(
    () => (modoReal ? reales : EJEMPLOS.map(ejemploANormal)),
    [modoReal, reales],
  )

  // Base para contadores: sitio + rango de fechas (NO semáforo ni búsqueda).
  const base = useMemo(() => fuente.filter((e) =>
    (sitio === 'todas' || e.sitio === sitio) &&
    (modoReal ? enRango(e.fechaEntrega, desde, hasta) : true),
  ), [fuente, sitio, desde, hasta, modoReal])

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const filtrada = base.filter((e) =>
      (filtro === 'todas' || e.general === filtro) &&
      (q === '' || e.waybill.toLowerCase().includes(q) || e.chofer.toLowerCase().includes(q)),
    )
    // Orden semáforo: urgentes primero; dentro del mismo semáforo, fecha
    // de entrega más reciente primero (los ejemplos, sin fecha, al final).
    return [...filtrada].sort((a, b) =>
      ESTADOS[a.general].orden - ESTADOS[b.general].orden ||
      (b.fechaEntrega || '').localeCompare(a.fechaEntrega || ''),
    )
  }, [base, filtro, busqueda])

  const conteos = useMemo(() => {
    const c = { rojo: 0, amarillo: 0, verde: 0 }
    base.forEach((e) => { c[e.general] += 1 })
    return { ...c, total: base.length }
  }, [base])

  // La selección solo puede contener entregas que siguen visibles con los
  // filtros actuales: al cambiar un filtro se recorta sola, nunca actúa
  // sobre entregas ocultas.
  const seleccionFiltrada = useMemo(() => {
    const visibles = new Set(lista.map((e) => e.id))
    return seleccion.filter((id) => visibles.has(id))
  }, [seleccion, lista])
  useEffect(() => {
    if (seleccionFiltrada.length !== seleccion.length) setSeleccion(seleccionFiltrada)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionFiltrada])

  const todasFiltradas = lista.length > 0 && seleccionFiltrada.length === lista.length
  const toggleSeleccion = (id) => setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const toggleTodasFiltradas = () => setSeleccion(todasFiltradas ? [] : lista.map((e) => e.id))

  const marcarUno = async (entrega, valor) => {
    setRevisiones((r) => ({ ...r, [entrega.id]: valor }))
    if (!entrega.esEjemplo) {
      try {
        await updateDoc(doc(db, 'podVerifications', entrega.id), {
          revision: valor,
          revisionPor: user?.uid || null,
          revisionEn: new Date().toISOString(),
        })
      } catch (err) {
        setMensajeLote(`No se pudo guardar la revisión de ${entrega.waybill}: ${err?.message || 'error de Firestore'}.`)
      }
    }
  }

  const marcarLote = async (valor) => {
    const ids = seleccionFiltrada
    if (!ids.length || procesandoLote) return
    setProcesandoLote(true)
    setMensajeLote(null)
    try {
      if (modoReal) {
        // Firestore: máximo 500 escrituras por lote. Se parte en bloques
        // de 500 para que una selección grande no falle entera.
        for (let i = 0; i < ids.length; i += 500) {
          const lote = writeBatch(db)
          ids.slice(i, i + 500).forEach((id) => lote.update(doc(db, 'podVerifications', id), {
            revision: valor,
            revisionPor: user?.uid || null,
            revisionEn: new Date().toISOString(),
          }))
          await lote.commit()
        }
      }
      setRevisiones((r) => {
        const next = { ...r }
        ids.forEach((id) => { next[id] = valor })
        return next
      })
      const accion = valor === 'confirmado' ? 'veredicto confirmado' : 'marcadas para revisión'
      setMensajeLote(`Se procesaron ${ids.length} entregas: ${accion}${modoReal ? ' y guardadas en Firestore.' : ' (solo en pantalla: son ejemplos).'}`)
      setSeleccion([])
    } catch (err) {
      setMensajeLote(`No se pudo completar la acción en lote: ${err?.message || 'error de Firestore'}. La selección se mantuvo para reintentar.`)
    } finally {
      setProcesandoLote(false)
    }
  }

  // ── Procesar en MilePay (2026-10-29): el punto es que el procesamiento
  // ocurra AQUÍ, en MilePay, y se vea cuántos paquetes faltan.
  // Pendiente = entrega real sin revisión guardada (revision null o
  // 'pendiente'); procesada = 'confirmado' o 'revision'. Al procesar, las
  // verdes se confirman automáticamente y las amarillas/rojas se envían a
  // revisión humana (no se penaliza a nadie automáticamente).
  const [progresoProcesamiento, setProgresoProcesamiento] = useState(null)
  const pendientesProcesar = useMemo(() => {
    if (!modoReal) return []
    return reales.filter((e) => {
      const r = revisiones[e.id]
      return r !== 'confirmado' && r !== 'revision'
    })
  }, [modoReal, reales, revisiones])
  const totalReales = reales.length
  const procesadasReales = totalReales - pendientesProcesar.length
  const porcentajeProcesadas = totalReales ? Math.round((procesadasReales / totalReales) * 100) : 0
  const pendientesHumanas = pendientesProcesar.filter((e) => e.general !== 'verde').length
  const procesarPendientes = async () => {
    const pendientes = pendientesProcesar
    if (!pendientes.length || procesandoLote) return
    setProcesandoLote(true)
    setMensajeLote(null)
    setProgresoProcesamiento(0)
    try {
      const auto = pendientes.filter((e) => e.general === 'verde')
      const aRevision = pendientes.filter((e) => e.general !== 'verde')
      const total = pendientes.length
      let hechas = 0
      const aplicar = async (listaPend, valor) => {
        for (let i = 0; i < listaPend.length; i += 500) {
          const lote = writeBatch(db)
          listaPend.slice(i, i + 500).forEach((e) => lote.update(doc(db, 'podVerifications', e.id), {
            revision: valor,
            revisionPor: user?.uid || null,
            revisionEn: new Date().toISOString(),
          }))
          await lote.commit()
          hechas += listaPend.slice(i, i + 500).length
          setProgresoProcesamiento(Math.round((hechas / total) * 100))
        }
      }
      await aplicar(auto, 'confirmado')
      await aplicar(aRevision, 'revision')
      setRevisiones((r) => {
        const next = { ...r }
        auto.forEach((e) => { next[e.id] = 'confirmado' })
        aRevision.forEach((e) => { next[e.id] = 'revision' })
        return next
      })
      setMensajeLote(`Procesadas ${total} entregas en MilePay: ${auto.length} confirmadas automáticamente (verdes) y ${aRevision.length} enviadas a revisión humana (amarillas/rojas). Quedan ${aRevision.length} por revisar humanamente.`)
    } catch (err) {
      setMensajeLote(`No se pudo completar el procesamiento: ${err?.message || 'error de Firestore'}.`)
    } finally {
      setProcesandoLote(false)
      setProgresoProcesamiento(100)
    }
  }

  // ── PISO 1 · Importador de índice (cola) ─────────────────────────────────
  // Separa "estar en MilePay" de "estar calificado": importa la lista
  // maestra de guías de un sitio (exportación de Gofo en Excel/CSV, o un
  // CSV con una guía por línea) a la colección gofoQueue, UN documento
  // por guía, SIN calificaciones. La calificación sigue llegando por
  // podVerifications; la cola solo dice qué existe y qué falta. Escribe
  // en lotes y al final cuenta los documentos reales de ese sitio con
  // getCountFromServer y guarda el total en
  // settings/{companyId}.colaPodHoySitios. Nada de pagos ni claims.
  const importarIndice = async (file) => {
    if (!file || !companyId || importandoCola) return
    setImportandoCola(true)
    setMensajeCola(null)
    setProgresoCola(0)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      if (!filas.length) throw new Error('El archivo no trae filas legibles.')
      let hIdx = filas.findIndex((f) => f.some((c) => /waybill|tracking|gu[ií]a|awb/i.test(String(c))))
      let colGuia = 0
      let colCourier = -1
      if (hIdx >= 0) {
        colGuia = filas[hIdx].findIndex((c) => /waybill|tracking|gu[ií]a|awb/i.test(String(c)))
        colCourier = filas[hIdx].findIndex((c) => /courier|driver|chofer|repartidor/i.test(String(c)))
      } else {
        hIdx = -1 // sin encabezado: primera columna = guía
      }
      const datos = filas.slice(hIdx + 1)
      const unicos = new Map()
      datos.forEach((f) => {
        const w = String(f[colGuia] ?? '').trim().toUpperCase()
        if (!/^[A-Z0-9]{8,}$/.test(w)) return
        if (!unicos.has(w)) {
          unicos.set(w, {
            waybill: w,
            courier: colCourier >= 0 ? String(f[colCourier] ?? '').trim() || null : null,
          })
        }
      })
      if (!unicos.size) {
        const encabezados = (filas[0] || []).map((c) => String(c)).filter(Boolean).join(' | ')
        throw new Error(`No encontré ninguna guía válida. Primera fila del archivo: ${encabezados || '(vacía)'}. Si Gofo cambió los encabezados, pásame esa fila y ajusto el importador.`)
      }
      const yaCalificadas = new Set(reales.map((e) => e.waybill))
      const lista = Array.from(unicos.values())
      for (let i = 0; i < lista.length; i += 400) {
        const lote = writeBatch(db)
        lista.slice(i, i + 400).forEach((g) => {
          lote.set(doc(db, 'gofoQueue', `${companyId}__${g.waybill}`), {
            companyId,
            carrier: 'gofo',
            site: impSitio,
            waybill: g.waybill,
            courier: g.courier,
            fechaEntrega: impFecha,
            estado: yaCalificadas.has(g.waybill) ? 'calificada' : 'pendiente',
            fuente: 'importador-milepay',
            actualizadoEn: new Date().toISOString(),
          }, { merge: true })
        })
        await lote.commit()
        setProgresoCola(Math.round((Math.min(i + 400, lista.length) / lista.length) * 100))
      }
      const conteo = await getCountFromServer(query(collection(db, 'gofoQueue'), where('companyId', '==', companyId), where('site', '==', impSitio)))
      const totalCola = conteo.data().count
      await updateDoc(doc(db, 'settings', companyId), {
        [`colaPodHoySitios.${impSitio}`]: { total: totalCola, fecha: impFecha, actualizadoEn: new Date().toISOString() },
      })
      setMensajeCola(`Índice importado para ${impSitio}: ${lista.length} guías del archivo escritas en la cola; el índice de ese sitio tiene ${totalCola} guías en total. Las ya calificadas quedaron marcadas; el resto queda pendiente de calificar, sin inventar ninguna calificación.`)
    } catch (err) {
      setMensajeCola(`No se pudo importar el índice: ${err?.message || 'error desconocido'}.`)
    } finally {
      setImportandoCola(false)
      setProgresoCola(null)
    }
  }

  // ── MODO FLUJO · SIN COLA ────────────────────────────────────────────────
  // Nada de listas de exclusión por tanda ni esperas: quien califica pide
  // LA SIGUIENTE pendiente de la cola y el sistema la marca "tomada" en
  // una transacción, para que ningún otro agente o persona la repita.
  // Si al abrir una guía su documento ya existe, ya está revisada: se
  // salta al instante y se toma la siguiente. Una tras otra, sin cola.
  const contarFlujo = async (s) => {
    try {
      const c = await getCountFromServer(query(collection(db, 'gofoQueue'), where('companyId', '==', companyId), where('site', '==', s), where('estado', '==', 'pendiente')))
      setFlujoPendientes(c.data().count)
    } catch { setFlujoPendientes(null) }
  }
  const tomarSiguiente = async () => {
    if (!companyId) return
    setFlujoOcupado(true)
    setFlujoMsg(null)
    try {
      const snap = await getDocs(query(collection(db, 'gofoQueue'), where('companyId', '==', companyId), where('site', '==', flujoSitio), where('estado', '==', 'pendiente'), limit(10)))
      let tomada = null
      for (const d of snap.docs) {
        const ref = d.ref
        const ok = await runTransaction(db, async (tx) => {
          const cur = await tx.get(ref)
          if (!cur.exists() || cur.data().estado !== 'pendiente') return false
          tx.update(ref, { estado: 'tomada', tomadaPor: user?.uid || 'staff', tomadaEn: new Date().toISOString() })
          return true
        })
        if (ok) {
          const data = d.data()
          tomada = { id: d.id, waybill: data.waybill, courier: data.courier || null, site: data.site, fechaEntrega: data.fechaEntrega || impFecha }
          break
        }
      }
      if (tomada) {
        setFlujoActual(tomada)
        setFlujoTipo('Casa')
        setFlujoFotos(ROLES_FOTO.map(() => ({ estado: 'verde', motivo: '' })))
        setFlujoMsg(`Tomada ${tomada.waybill}: quedó marcada como tomada, nadie más la puede tomar. Mírala en Gofo con el enlace y califica sus 3 fotos aquí mismo.`)
      } else {
        setFlujoActual(null)
        setFlujoMsg(`No hay pendientes por tomar en ${flujoSitio} en este momento: o se acabaron o las primeras ya las tomó otro.`)
      }
      await contarFlujo(flujoSitio)
    } catch (err) {
      setFlujoMsg(`No se pudo tomar la siguiente: ${err?.message || 'error'}. Si habla de permisos, falta publicar la regla de gofoQueue.`)
    } finally {
      setFlujoOcupado(false)
    }
  }
  const guardarFlujo = async () => {
    if (!flujoActual) return
    if (flujoFotos.some((f) => !f.motivo.trim())) { setFlujoMsg('Falta el motivo de alguna foto: escribe en cada una lo que realmente viste en Gofo, sin inventar.'); return }
    setFlujoOcupado(true)
    setFlujoMsg(null)
    try {
      const crit = criterioFlujo(flujoTipo)
      const fotos = ROLES_FOTO.map((rol, i) => ({
        rol, titulo: TITULOS_FOTO[rol], estado: flujoFotos[i].estado,
        motivo: flujoFotos[i].motivo.trim(), criterio: crit[rol], url: null,
      }))
      const lote = writeBatch(db)
      lote.set(doc(db, 'podVerifications', flujoActual.id), {
        companyId, carrier: 'gofo', site: flujoActual.site, waybill: flujoActual.waybill,
        courier: flujoActual.courier, tipo: flujoTipo, fechaEntrega: flujoActual.fechaEntrega,
        origen: 'portal-gofo', gofoUrl: 'https://dms.gofoexpress.com/login',
        revision: 'pendiente', revisionPor: null, revisionEn: null, fotos,
      })
      lote.update(doc(db, 'gofoQueue', flujoActual.id), { estado: 'calificada', calificadaEn: new Date().toISOString() })
      await lote.commit()
      const wb = flujoActual.waybill
      setFlujoActual(null)
      setFlujoMsg(`Guardada ${wb}: ya está en MilePay y en la cola quedó como calificada. Tomando la siguiente…`)
      setFlujoOcupado(false)
      await tomarSiguiente()
    } catch (err) {
      setFlujoMsg(`No se pudo guardar: ${err?.message || 'error'}. La entrega sigue tomada por ti; reintenta o libérala.`)
      setFlujoOcupado(false)
    }
  }
  const liberarFlujo = async (bloqueada) => {
    if (!flujoActual) return
    setFlujoOcupado(true)
    try {
      await updateDoc(doc(db, 'gofoQueue', flujoActual.id), {
        estado: bloqueada ? 'bloqueada' : 'pendiente',
        tomadaPor: null,
        ultimoProblema: bloqueada ? 'Marcada bloqueada en modo flujo (no se pudo revisar)' : 'Liberada sin calificar en modo flujo',
      })
      setFlujoMsg(bloqueada
        ? `${flujoActual.waybill} quedó bloqueada y fuera del flujo, para revisión posterior. Toma la siguiente cuando quieras.`
        : `${flujoActual.waybill} volvió a pendientes: otro podrá tomarla.`)
      setFlujoActual(null)
      await contarFlujo(flujoSitio)
    } catch (err) {
      setFlujoMsg(`No se pudo liberar: ${err?.message || 'error'}.`)
    } finally {
      setFlujoOcupado(false)
    }
  }

  const cambiarDesde = (v) => { setDesde(v); if (v && hasta && v > hasta) setHasta(v) }
  const cambiarHasta = (v) => { setHasta(v); if (v && desde && v < desde) setDesde(v) }
  const limpiarRango = () => { const r = rangoUltimos7Dias(); setDesde(r.desde); setHasta(r.hasta) }

  // Gofo únicamente: el menú ya oculta esta sección en SpeedX (soloCarrier),
  // y la entrada directa también queda bloqueada aquí.
  if (carrier !== 'gofo') {
    return (
      <div>
        <PageTitle>Verificación POD</PageTitle>
        <EstadoVacio titulo="Solo disponible con Gofo" texto="Esta sección pertenece al módulo Gofo. Cambia a Gofo para verla." />
      </div>
    )
  }

  return (
    <div>
      <PageTitle right={modoReal
        ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">REAL · Firestore</span>
        : <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">EJEMPLO · Sin conexión a Gofo</span>}>
        Verificación POD
      </PageTitle>

      <Card className="mb-5 p-4 text-sm text-slate-600 dark:text-slate-300">
        {modoReal ? (
          <>Modo real: entregas leídas de Firestore (colección <code>podVerifications</code>, empresa activa, carrier Gofo).
          El estado general de cada entrega es el peor estado de sus 3 fotos. Confirmar o marcar para revisión
          <strong> se guarda en Firestore</strong>, también en lote. No hay penalización automática a choferes por
          el veredicto, y no se cobra ni se modifican pagos, claims o facturas.</>
        ) : (
          <>Vista previa solo de interfaz: entradas de ejemplo, sin conexión al portal de Gofo,
          sin sync en vivo y sin guardar nada en Firestore. El estado general de cada entrega
          es el peor estado de sus 3 fotos. Confirmar o marcar para revisión solo cambia
          esta pantalla; no guarda, no cobra ni modifica pagos, claims o facturas.</>
        )}
        {cargandoReales && <p className="mt-2 font-semibold">Cargando entregas reales…</p>}
        {errorReales && (
          <p className="mt-2 font-semibold text-red-700">
            No se pudieron leer las entregas reales ({errorReales}). Se muestran los ejemplos marcados.
            Revisa que la regla de <code>podVerifications</code> esté desplegada (ver APLICAR.md).
          </p>
        )}
        {!modoReal && !cargandoReales && (
          <p className="mt-2">En modo ejemplo el rango de fechas no oculta ejemplos: no tienen fecha de entrega real.</p>
        )}
      </Card>

      {mensajeLote && (
        <Card className="mb-5 p-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {mensajeLote}
          <button type="button" onClick={() => setMensajeLote(null)} className="ml-3 rounded-lg border px-2 py-0.5 text-xs">Cerrar</button>
        </Card>
      )}

      {/* Procesamiento EN MilePay: cuántas faltan y barra de avance */}
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-brand-navy dark:text-slate-100">Procesar entregas pendientes · En MilePay</h2>
            <p className="text-xs text-slate-500">
              {modoReal
                ? `En vivo: ${reales.filter((e) => revisiones[e.id] === 'confirmado').length} verificadas · ${totalReales - reales.filter((e) => revisiones[e.id] === 'confirmado').length} sin verificar · ${totalReales} en total. Te faltan por procesar ${pendientesProcesar.length} de ${totalReales} entregas reales (${procesadasReales} ya procesadas). De las pendientes, ${pendientesHumanas} son amarillas/rojas y quedarán para revisión humana; las verdes se confirman solas. Los números cambian solos en tiempo real cuando llegan nuevas entregas o se verifican otras, sin recargar.`
                : 'En modo ejemplo no hay entregas reales que procesar: se muestran ejemplos marcados.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Análisis de hoy en Gofo: {progresoAnalisis ? `${progresoAnalisis.estado || 'En curso'} · Sitios ${sitiosCompletadosAnalisis}/${sitiosTotalesAnalisis} · ${porcentajeAnalisis}%` : 'sin datos todavía en MilePay'}
            </p>
          </div>
          <button type="button" onClick={procesarPendientes} disabled={!modoReal || pendientesProcesar.length === 0 || procesandoLote} className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40">
            {procesandoLote ? 'Procesando…' : `Procesar entregas pendientes (${pendientesProcesar.length} restantes)`}
          </button>
        </div>
        <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={progresoProcesamiento ?? porcentajeProcesadas} aria-valuemin="0" aria-valuemax="100">
          <div className={`h-full rounded-full bg-sky-500 transition-all ${procesandoLote ? 'animate-pulse' : ''}`} style={{ width: `${progresoProcesamiento ?? porcentajeProcesadas}%` }} />
        </div>
        <p className="mt-1 text-right text-xs font-bold">
          {procesandoLote ? `Procesando… ${progresoProcesamiento ?? 0}% · ` : ''}{progresoProcesamiento ?? porcentajeProcesadas}% procesado · {pendientesProcesar.length} restantes
          {!modoReal ? '' : (pendientesProcesar.length === 0 ? ' · Nada pendiente' : ' · Pulsa “Procesar entregas pendientes” para que la barra avance')}
        </p>
      </Card>

      {/* Progreso POR CIUDAD en MilePay (2026-10-29): las 11 a la vez.
          Cada fila lee settings.analisisPodHoySitios en tiempo real; si un
          sitio aún no tiene datos, dice "sin datos todavía" y muestra
          cuántas entregas de ese sitio ya están en MilePay. */}
      <Card className="mb-5 p-4">
        <h2 className="font-bold text-brand-navy dark:text-slate-100">Progreso por ciudad{fechaProgresoDatos ? ` · Datos del ${fechaProgresoDatos}` : ' · En MilePay'}</h2>
        {fechaProgresoDatos && !progresoEsDeHoy ? (
          <p className="mt-1 text-xs font-semibold text-amber-600">⚠ Estos datos son del {fechaProgresoDatos}, no de hoy. Cuando empiece el trabajo de hoy, cada ciudad escribirá su avance con la fecha de hoy y esta tarjeta cambiará sola.</p>
        ) : null}
        {!fechaProgresoDatos ? (
          <p className="mt-1 text-xs font-semibold text-amber-600">⚠ Estas entradas de progreso todavía no guardan su fecha: corresponden al último alcance trabajado, no necesariamente a hoy.</p>
        ) : null}
        <p className="text-xs text-slate-500">Todas las ciudades a la vez. El % y los conteos de cada ciudad se actualizan solos cuando el trabajo por sitios escribe su avance en los ajustes.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SITIOS_GOFO.map((s) => {
            const p = progresoSitios?.[s] || null
            const pct = p && typeof p.porcentaje === 'number' ? Math.max(0, Math.min(100, p.porcentaje)) : 0
            const enMilePay = conteoPorSitio[s] || 0
            return (
              <div key={s} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{s}</span>
                  <span className="text-xs font-bold">{p ? `${pct}%` : 'sin datos todavía'}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {p ? `${p.estado || 'En curso'}${typeof p.entregadas === 'number' ? ` · ${p.entregadas} entregadas` : ''}${typeof p.enProgreso === 'number' ? ` · ${p.enProgreso} en progreso` : ''}${typeof p.calificadas === 'number' ? ` · ${p.calificadas} calificadas` : ''}${typeof p.fecha === 'string' ? ` · datos del ${p.fecha}` : ''}` : 'Sin avance reportado todavía'}
                  {` · ${enMilePay} en MilePay`}
                </p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* PISO 1 · Índice / cola del día: qué guías existen en MilePay por
          ciudad y cuántas faltan por calificar, sin mezclar la cola con
          las verificadas. El total viene de settings.colaPodHoySitios
          (lo escribe el importador); si un sitio no tiene índice, se
          dice tal cual. */}
      <Card className="mb-5 p-4">
        <h2 className="font-bold text-brand-navy dark:text-slate-100">Índice del día · Cola de verificación (Piso 1)</h2>
        <p className="text-xs text-slate-500">
          La cola guarda la lista maestra de guías por ciudad, sin calificaciones: dice qué existe y qué falta. Pendientes en cola = guías del índice que aún no están calificadas en MilePay. Importa aquí la exportación de Gofo (Excel o CSV) de una ciudad y su lista completa entra de una vez, en lotes.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Ciudad de la exportación</span>
            <select value={impSitio} onChange={(e) => setImpSitio(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              {SITIOS_GOFO.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Fecha de entrega</span>
            <input type="date" value={impFecha} onChange={(e) => setImpFecha(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Archivo de Gofo (.xlsx o .csv)</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={!modoReal || importandoCola}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importarIndice(f); e.target.value = '' }}
              className="block text-xs"
            />
          </label>
          {importandoCola ? <span className="text-xs font-semibold text-sky-700">Importando… {progresoCola ?? 0}%</span> : null}
        </div>
        {mensajeCola ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{mensajeCola}</p> : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SITIOS_GOFO.map((s) => {
            const c = colaSitios?.[s] || null
            const total = c && typeof c.total === 'number' ? c.total : null
            const enMilePay = conteoPorSitio[s] || 0
            const pendientes = total !== null ? Math.max(0, total - enMilePay) : null
            return (
              <div key={s} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{s}</span>
                  <span className="text-xs font-bold">{total !== null ? `${pendientes} pendientes en cola` : 'sin índice todavía'}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {total !== null ? `${total} guías en el índice · ${enMilePay} ya calificadas en MilePay` : 'Importa la exportación de esta ciudad para crear su índice.'}
                </p>
              </div>
            )
          })}
        </div>
      </Card>

      {/* MODO FLUJO · SIN COLA: tomar la siguiente pendiente, calificarla
          aquí mismo y seguir con la otra, sin listas ni esperas. La
          entrega tomada se marca en la cola y nadie más la repite. */}
      <Card className="mb-5 p-4">
        <h2 className="font-bold text-brand-navy dark:text-slate-100">Modo flujo · Sin cola</h2>
        <p className="text-xs text-slate-500">
          Tomas una entrega pendiente, la revisas en Gofo con el enlace, calificas sus 3 fotos aquí y el sistema te da la siguiente. Cada entrega tomada queda marcada para que ningún otro agente la repita, y si una ya está revisada, ni siquiera te la ofrece. Una tras otra, sin lista de espera.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Ciudad</span>
            <select value={flujoSitio} disabled={!!flujoActual} onChange={(e) => { setFlujoSitio(e.target.value); setFlujoPendientes(null); contarFlujo(e.target.value) }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              {SITIOS_GOFO.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-semibold">Pendientes por tomar</span>
            <span className="block py-2 text-sm font-bold">{flujoPendientes === null ? '—' : flujoPendientes}</span>
          </div>
          <button type="button" onClick={tomarSiguiente} disabled={!modoReal || flujoOcupado || !!flujoActual} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
            {flujoOcupado ? 'Trabajando…' : 'Tomar la siguiente pendiente'}
          </button>
          <button type="button" onClick={() => contarFlujo(flujoSitio)} disabled={flujoOcupado} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            Actualizar conteo
          </button>
        </div>
        {flujoMsg ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{flujoMsg}</p> : null}
        {flujoActual ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <strong>{flujoActual.waybill}</strong>
                {flujoActual.courier ? ` · ${flujoActual.courier}` : ''} · {flujoActual.site} · Entrega {flujoActual.fechaEntrega}
              </p>
              <a href="https://dms.gofoexpress.com/login" target="_blank" rel="noreferrer" className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50">Ver fotos en Gofo</a>
            </div>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-semibold">Tipo de entrega (según lo que ves en las fotos)</span>
              <select value={flujoTipo} onChange={(e) => setFlujoTipo(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
                {TIPOS_FLUJO.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <div className="mt-3 grid gap-2">
              {ROLES_FOTO.map((rol, i) => (
                <div key={rol} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                  <span className="w-44 text-xs font-bold">{TITULOS_FOTO[rol]}</span>
                  <select
                    value={flujoFotos[i].estado}
                    onChange={(e) => setFlujoFotos((prev) => prev.map((f, j) => (j === i ? { ...f, estado: e.target.value } : f)))}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                  >
                    <option value="verde">🟢 Verde</option>
                    <option value="amarillo">🟡 Amarillo</option>
                    <option value="rojo">🔴 Rojo</option>
                  </select>
                  <input
                    type="text"
                    value={flujoFotos[i].motivo}
                    onChange={(e) => setFlujoFotos((prev) => prev.map((f, j) => (j === i ? { ...f, motivo: e.target.value } : f)))}
                    placeholder="Motivo: lo que realmente se ve en esta foto"
                    className="min-w-52 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{criterioFlujo(flujoTipo).en_sitio}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={guardarFlujo} disabled={flujoOcupado} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
                Guardar calificación y tomar la siguiente
              </button>
              <button type="button" onClick={() => liberarFlujo(false)} disabled={flujoOcupado} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                No pude revisarla, liberarla
              </button>
              <button type="button" onClick={() => liberarFlujo(true)} disabled={flujoOcupado} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40">
                Marcar bloqueada y seguir
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {/* Filtros: semáforo + ciudad + búsqueda + rango de fechas */}
      {/* El rango filtra la lista Y los contadores del semáforo (base). */}
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Semáforo</span>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              <option value="todas">Todas ({conteos.total})</option>
              <option value="rojo">🔴 Urgentes ({conteos.rojo})</option>
              <option value="amarillo">🟡 Intermedias ({conteos.amarillo})</option>
              <option value="verde">🟢 Verificadas y OK ({conteos.verde})</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Ciudad / Sitio</span>
            <select value={sitio} onChange={(e) => setSitio(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800">
              <option value="todas">Todas las ciudades</option>
              {SITIOS_GOFO.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Buscar guía o chofer</span>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="EJ-0201 o nombre…" className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Desde (fecha de entrega)</span>
            <input type="date" value={desde} onChange={(e) => cambiarDesde(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">Hasta (fecha de entrega)</span>
            <input type="date" value={hasta} onChange={(e) => cambiarHasta(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800" />
          </label>
          <button type="button" onClick={limpiarRango} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
            Volver a últimos 7 días
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Por defecto: últimos 7 días (hoy incluido). Si eliges un Desde mayor que el Hasta, el Hasta se ajusta solo.
        </p>
      </Card>

      {/* Acciones en lote: solo sobre las entregas filtradas y visibles */}
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={todasFiltradas} onChange={toggleTodasFiltradas} disabled={lista.length === 0} aria-label="Seleccionar todas las filtradas" />
            Seleccionar todas las filtradas
          </label>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {seleccionFiltrada.length} seleccionada{seleccionFiltrada.length === 1 ? '' : 's'} de {lista.length} filtradas
          </span>
          <button type="button" onClick={() => marcarLote('confirmado')} disabled={seleccionFiltrada.length === 0 || procesandoLote} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40">
            Confirmar veredicto de las seleccionadas
          </button>
          <button type="button" onClick={() => marcarLote('revision')} disabled={seleccionFiltrada.length === 0 || procesandoLote} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40">
            Marcar para revisión las seleccionadas
          </button>
          {seleccionFiltrada.length > 0 && (
            <button type="button" onClick={() => setSeleccion([])} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Limpiar selección</button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          En modo real, las acciones en lote se guardan en Firestore en bloques de 500 y al terminar se limpia
          la selección. En modo ejemplo, solo cambian en pantalla.
        </p>
      </Card>

      {/* Lista de entregas, ordenadas por semáforo */}
      <div className="grid gap-4">
        {lista.length === 0 && (
          <EstadoVacio titulo="Sin entregas con estos filtros" texto={modoReal ? 'Cambia el semáforo, la ciudad, el rango de fechas o la búsqueda.' : 'Cambia el semáforo, la ciudad o la búsqueda para ver otros ejemplos.'} />
        )}
        {lista.map((e) => {
          const est = ESTADOS[e.general]
          const rev = revisiones[e.id]
          const seleccionado = seleccionFiltrada.includes(e.id)
          return (
            <Card key={e.id} className={`p-4 border-l-4 ${est.borde}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="checkbox" checked={seleccionado} onChange={() => toggleSeleccion(e.id)} aria-label={`Seleccionar ${e.waybill}`} />
                    <span className="font-bold text-brand-navy dark:text-slate-100">{e.waybill}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${est.chip}`}>
                      <IconoEstado estado={e.general} /> {est.label}
                    </span>
                    <span className="text-xs text-slate-500">{e.tipo} · {e.sitio} · {e.chofer}</span>
                    <span className="text-xs text-slate-500">{e.esEjemplo ? 'EJEMPLO' : (e.origen === 'portal-gofo' ? 'Portal Gofo' : e.origen === 'milepay' ? 'MilePay' : 'Real')}</span>
                    <span className="text-xs text-slate-500">{e.fechaEntrega ? `Entrega: ${e.fechaEntrega}` : 'Sin fecha'}</span>
                    {e.fotos.length !== 3 && <span className="text-xs font-semibold text-amber-700">Fotos registradas: {e.fotos.length}/3</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Estado general = peor estado de sus 3 fotos. Lista de fotos: toca una para ver su detalle y el link a Gofo.</p>
                </div>
                <div className="flex gap-2">
                  {!e.esEjemplo && e.gofoUrl && (
                    <a href={e.gofoUrl} target="_blank" rel="noreferrer" title={`Abrir Gofo y buscar la guía ${e.waybill} para ver sus fotos POD`} className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50">Ver fotos en Gofo ↗</a>
                  )}
                  <button type="button" onClick={() => marcarUno(e, 'confirmado')} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Confirmar veredicto</button>
                  <button type="button" onClick={() => marcarUno(e, 'revision')} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50">Marcar para revisión</button>
                </div>
              </div>

              {rev && (
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {e.esEjemplo ? 'Revisión local (no guardada): ' : 'Revisión guardada en Firestore: '}
                  {rev === 'confirmado' ? 'veredicto confirmado' : 'pendiente de revisión humana'}
                </p>
              )}

              {/* Modo lista (2026-10-29): sin previews. Las fotos de Gofo no
                  están cargadas en MilePay, así que un cuadro gris no aporta
                  nada; cada foto es una fila con su estado, motivo y criterio,
                  y el link a Gofo está en la tarjeta. Si una foto trae URL
                  real, se muestra una miniatura pequeña junto a su fila. */}
              <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {e.fotos.map((f) => {
                  const fe = ESTADOS[f.estado]
                  return (
                    <li key={f.titulo}>
                      <button
                        type="button"
                        onClick={() => setAmpliada({ entrega: e, foto: f })}
                        className={`flex w-full items-start gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${fe.borde} border-l-4`}
                      >
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs font-bold"><Camera size={14} /> {f.titulo}</span>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${fe.chip}`}>
                          <IconoEstado estado={f.estado} size={12} /> {fe.label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs text-slate-600 dark:text-slate-300">{f.motivo}</span>
                          {f.criterio && <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">{f.criterio}</span>}
                        </span>
                        {f.url && <img src={f.url} alt={f.titulo} loading="lazy" className="h-12 w-16 shrink-0 rounded-lg object-cover" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )
        })}
      </div>

      {/* Referencia de criterio y fallos duros */}
      <Card className="mt-5 p-4">
        <h2 className="flex items-center gap-2 font-bold text-brand-navy dark:text-slate-100"><MapPin size={16} /> Fallos duros (Gofo GF POD, Partes 1 y 2)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          {FALLOS_DUROS.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Regla de flexibilidad de Gofo: si el POD cumple los requisitos y coincide con la vista de calle,
          puede juzgarse con flexibilidad aunque la ubicación no sea la dirección exacta. Los POD conformes
          no se limitan a los escenarios de ejemplo. Lluvia / nieve: bajo techo; viento: paquetes ligeros
          en zonas protegidas.
        </p>
      </Card>

      {/* Vista ampliada de una foto */}
      {ampliada && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setAmpliada(null)} role="presentation">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-brand-navy dark:text-slate-100">{ampliada.entrega.waybill} · {ampliada.foto.titulo}</h3>
                <p className="text-xs text-slate-500">{ampliada.entrega.tipo} · {ampliada.entrega.sitio}</p>
              </div>
              <button type="button" onClick={() => setAmpliada(null)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Cerrar</button>
            </div>
            {ampliada.foto.url ? (
              <img src={ampliada.foto.url} alt={ampliada.foto.titulo} className="mt-3 h-56 w-full rounded-xl object-cover" />
            ) : (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">
                {ampliada.entrega.esEjemplo ? 'Vista de ejemplo: sin foto real.' : 'Foto no cargada en MilePay. Ábrela en Gofo con el link de abajo.'}
              </p>
            )}
            <p className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${ESTADOS[ampliada.foto.estado].chip}`}>
              <IconoEstado estado={ampliada.foto.estado} size={12} /> {ESTADOS[ampliada.foto.estado].label}
            </p>
            <p className="mt-2 text-sm">{ampliada.foto.motivo}</p>
            <p className="mt-1 text-xs text-slate-500">{ampliada.foto.criterio}</p>
            {!ampliada.entrega.esEjemplo && ampliada.entrega.gofoUrl && !ampliada.foto.url && (
              <a href={ampliada.entrega.gofoUrl} target="_blank" rel="noreferrer" title={`Abrir Gofo y buscar la guía ${ampliada.entrega.waybill}`} className="mt-3 inline-block rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50">Ver fotos en Gofo ↗</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
