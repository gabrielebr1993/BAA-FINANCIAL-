// ============================================================================
// BULK · Portal del TRANSPORTISTA — mismo lenguaje visual del panel del admin
// (KPIs, tablas, badges, colores navy/dorado/verde/crema), pero mostrando SOLO lo
// de su propio carrier. AISLAMIENTO: todas las consultas filtran por su carrierId
// (== bulkCarrierId del claim); las reglas de Firestore refuerzan el aislamiento.
//   Pestañas: Órdenes · Mis choferes · Equipos · Estado de cuenta · Mensajes.
// ============================================================================
import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Truck, ClipboardList, Users, DollarSign, Phone, IdCard,
  MessageSquare, Plus, X, UserPlus, Wallet, Search, Trash2, MapPin, FileText, Radio,
  Home, LogOut, Grid2x2, Camera, KeyRound, Languages, User, Download,
} from 'lucide-react'
// Gráficas de la home (orden "Negocio y roles", Bloque 1). Import estático normal:
// Recharts ya viene en el bundle (misma librería del panel admin de Package).
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList, LineChart, Line,
} from 'recharts'
import RepararAcceso from '../components/RepararAcceso'
import AvisosGeocerca from '../components/AvisosGeocerca'
import ChatOrden from '../components/ChatOrden'
// Detalle de orden 2026 (Bloque 3): esqueleto COMPARTIDO por los 5 roles.
import DetalleOrdenApp from '../components/DetalleOrdenApp'
import RecorridoOrden from '../components/RecorridoOrden'
import CalificacionViaje, { Estrellas } from '../components/CalificacionViaje'
import BotonReunion from '../components/BotonReunion'
import FiltroFechas, { enRangoFechas, RANGO_VACIO } from '../components/FiltroFechas'
import { etaOrden, etaTexto } from '../domain/eta'
import AvisosMensajes from '../components/AvisosMensajes'
import { onAbrirConversacion } from '../data/notifsMensajes'
import { DocCard, DocDrawer, BotonDoc } from '../components/FacturaDoc'
import FastPayModal from '../components/FastPayModal'
import ImprimirTicket from '../components/ImprimirTicket'
import { DocumentoFactura } from '../pages/FacturaPagina'
import DashboardFacturacion from '../components/DashboardFacturacion'
import CambiarClave from '../components/CambiarClave'
import PanelConversaciones from '../components/PanelConversaciones'
import GruposModal from '../components/GruposModal'
import { usePrivados } from '../components/usePrivados'
import { useGrupos } from '../data/useGrupos'
import { menuGrupoConv } from '../data/grupos'
import { convCarrier, noLeidosPorConv, resumenPorConversacion } from '../data/chat'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { useAvatares } from '../data/useCodigoUsuario'
import Avatar from '../components/Avatar'
import { leerFotoReducida } from '../components/foto'
import { crearConId, guardar, guardarAvatar, where, documentId } from '../data/repo'
import { asignarOrdenManual } from '../data/asignacionManual'
import { auditar } from '../data/auditoria'
import CampanaNotificaciones from '../components/CampanaNotificaciones'
import { notificacionesTransportista } from '../domain/notificaciones'
import { useNotifsGeocerca } from '../data/geoeventos'
import { BULK_ROLES, ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR, ORDEN_HITOS } from '../domain/constants'
import { calcularPagoChofer, configDeChofer, etiquetaPago } from '../domain/pagoChofer'
import { PRESENCIA_TTL_MS } from '../domain/asignacionAuto'
import { tsMillis } from '../data/chatKeys'
import { Card, KPI, Badge, Cargando, Aviso, EstadoVacio, Select, Input, Boton, Tabla, Spinner } from '../../components/ui'
// Kit del REDISEÑO 2026 (Bloque 1): la carcasa, la home y el perfil usan este lenguaje.
import { IconButton, PrimaryButton, SecondaryButton, FeatureCard, StatCard, ListRow, StatusPill, FloatingTabBar, Card as CardApp } from '../ui'
import BuscadorFacturas from '../components/BuscadorFacturas'
import { filtrarFacturas, hayFiltroActivo, FILTRO_FACTURAS_VACIO } from '../domain/filtroFacturas'
import { money } from '../../utils/format'
import { LangToggle, useLang } from '../../i18n'

// Color del punto de los StatusPill 2026 según el color de badge del estado.
const PILL_COLOR = { green: 'var(--mp-green)', blue: 'var(--mp-blue)', gold: 'var(--mp-gold)', red: 'var(--mp-red)', navy: 'var(--mp-navy)', slate: 'var(--mp-ink-2)' }

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const FINAL = [...ENTREGADAS, E.CANCELADA]
const nuevoId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const fecha = (v) => (v ? new Date(tsMillis(v) || v).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—')
const FLOTA_ESTADO = { disponible: { c: 'green', l: 'Disponible' }, en_viaje: { c: 'blue', l: 'En viaje' }, mantenimiento: { c: 'gold', l: 'Mantenimiento' } }

// ── GRÁFICAS de la home (orden "Negocio y roles", Bloque 1) ──────────────────
// Colores del sistema (tokens de src/styles/tokens.css): serie principal dorado,
// pasado navy al 30 %, grilla en el color de los divisores, alerta ámbar.
const GRAF = { gold: '#C9A24A', navy: '#0B1628', navy30: 'rgba(11,22,40,0.30)', grid: '#E6E1D2', amber: '#D9822B', ink2: '#7A776F' }
const DIA_MS = 86400000
const numV = (v) => Number(v) || 0
// Fecha "contable" de una orden entregada (mismo criterio que la tarjeta de
// ingresos de la home: entrega → liberación → creación).
const msOrden = (o) => { const v = o.hitos?.entrega || o.hitos?.liberacion || o.creadoEn; const m = tsMillis(v) || Date.parse(v); return Number.isFinite(m) ? m : null }
// Semana ISO 'YYYY-Www' — MISMO formato de los agregados nocturnos (bulk_stats),
// para poder mezclar semanas del servidor con semanas calculadas en cliente.
function semanaISO(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) + 3) // jueves de esa semana
  const inicio = new Date(Date.UTC(x.getUTCFullYear(), 0, 4))
  const sem = 1 + Math.round(((x - inicio) / DIA_MS - 3 + ((inicio.getUTCDay() + 6) % 7)) / 7)
  return `${x.getUTCFullYear()}-W${String(sem).padStart(2, '0')}`
}
// Lunes (00:00 local) de la semana que contiene `ms`.
const lunesDe = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime() }
// Acumula UNA orden entregada en el stat de su semana (misma forma que un doc de
// bulk_stats; la espera guarda la suma en minutos para poder promediar al final).
function sumarOrdenStat(s, o, nombrePlanta) {
  s.ingresos += numV(o.precioTransportista); s.viajes += 1
  const ton = numV(o.pesoReal ?? o.pesoEstimado); s.toneladas += ton
  if (o.choferNombre) { const c = (s.porChofer[o.choferNombre] ||= { ton: 0, viajes: 0 }); c.ton += ton; c.viajes += 1 }
  // Espera en planta: solo si la orden trae AMBOS hitos y el lapso es razonable.
  const lleg = tsMillis(o.hitos?.llegadaPlanta); const sal = tsMillis(o.hitos?.salidaPlanta)
  if (lleg && sal && sal > lleg && sal - lleg < DIA_MS) {
    const p = (s.esperaPlanta[o.plantaId || '?'] ||= { nombre: nombrePlanta(o.plantaId) || 'Planta', sum: 0, n: 0 })
    p.sum += (sal - lleg) / 60000; p.n += 1
  }
}

export default function TransportistaPortal() {
  const { t } = useLang()
  const { usuario, tenantId, rol, crearUsuario, puede, cerrarSesion } = useBulkAuth()
  const navigate = useNavigate()
  const carrierId = usuario?.carrierId || '__none__'

  // ── Datos (TODO filtrado a MI carrier) ─────────────────────────────────────
  const avatares = useAvatares()
  const { datos: _ordenesRaw, cargando } = useColeccion('orders', [where('transportistaId', '==', carrierId)])
  const { datos: pagosCarrier } = useColeccion('orderPay_carrier', [where('transportistaId', '==', carrierId)])
  const { datos: pagosChofer } = useColeccion('orderPay_chofer', [where('transportistaId', '==', carrierId)])
  const { datos: carriers } = useColeccion('carriers', [where(documentId(), '==', carrierId)])
  const { datos: configs } = useColeccion('carrierConfig', [where(documentId(), '==', carrierId)])
  const { datos: statements } = useColeccion('carrierStatements', [where('carrierId', '==', carrierId)])
  // Agregados NOCTURNOS por semana (bulk_stats) para las gráficas de la home; la
  // semana en curso siempre se recalcula en cliente (la función corre de noche).
  const { datos: statsAgg } = useColeccion('stats', [where('carrierId', '==', carrierId)])
  // Calificaciones de MIS viajes (estrellas del cliente) → promedio por chofer.
  const { datos: califs } = useColeccion('ratings', [where('carrierId', '==', carrierId || '__none__')])
  const califPorChofer = useMemo(() => {
    const m = {}
    for (const r of califs || []) {
      for (const k of [r.choferId, r.choferNombre].filter(Boolean)) {
        const e = m[k] || (m[k] = { suma: 0, n: 0 })
        e.suma += Number(r.estrellas) || 0; e.n += 1
      }
    }
    return m
  }, [califs])
  // Retiros Fast Pay de MI carrier (los míos y los de mis choferes): para
  // descontarlos al pagar a cada chofer y no pagar doble.
  const { datos: retiros } = useColeccion('retiros', [where('carrierId', '==', carrierId)])
  const { datos: geocercasEta } = useColeccion('geofences')
  const { datos: presencias } = useColeccion('presence', [where('carrierId', '==', carrierId)])
  const { datos: plantas } = useColeccion('plants')
  // Catálogo de TIPOS DE CAMIÓN del sistema (bulk_equipment; legible por todo el
  // tenant). Antes el alta de chofer usaba texto libre y parecía "select vacío".
  const { datos: equiposCat, cargando: cargandoEquipos } = useColeccion('equipment')
  const tiposCamion = useMemo(() => {
    const nombres = new Set((equiposCat || []).filter((e) => e.activo !== false).map((e) => (e.nombre || '').trim()).filter(Boolean))
    return [...nombres].sort((a, b) => a.localeCompare(b))
  }, [equiposCat])
  const { datos: mensajes } = useColeccion('messages', [where('orderId', '==', convCarrier(carrierId))])
  // Chats de ORDEN en los que participa este transporte (para hablar con sus choferes,
  // organizados por viaje). El aislamiento lo garantizan las reglas (carrierId ∈ participantes).
  const { datos: mensajesOrdenes } = useColeccion('messages', [where('participantes', 'array-contains', carrierId)])
  // Chats PRIVADOS 1-a-1 del transportista: se identifican por su UID (no por el
  // carrierId), por eso llevan su propia suscripción por `participantes ∋ mi uid`.
  const { datos: mensajesPriv } = useColeccion('messages', [where('participantes', 'array-contains', usuario?.id || '__none__')])

  const ordenes = useMemo(() => {
    const mc = {}; for (const p of pagosCarrier || []) mc[p.orderId || p.id] = p.precioTransportista
    const md = {}; for (const p of pagosChofer || []) md[p.orderId || p.id] = p.pagoChofer
    return (_ordenesRaw || []).map((o) => ({
      ...o,
      precioTransportista: mc[o.id] != null ? mc[o.id] : o.precioTransportista,
      pagoChofer: md[o.id] != null ? md[o.id] : o.pagoChofer,
    }))
  }, [_ordenesRaw, pagosCarrier, pagosChofer])

  const [tab, setTab] = useState('inicio')
  const [verGrupos, setVerGrupos] = useState(false)
  const { items: gruposItems, grupos, invitaciones } = useGrupos()
  const carrier = carriers.find((c) => c.id === carrierId)
  const choferes = carrier?.choferes || []
  // Candidatos a grupos del transportista: sus choferes (con cuenta/uid).
  const candidatosGrupo = useMemo(() => choferes.filter((d) => d.uid).map((d) => ({ uid: d.uid, nombre: d.nombre, rol: 'chofer', foto: d.foto || null })), [choferes])
  const config = configs.find((c) => c.id === carrierId) || {}
  const pagoChoferes = config.pagoChoferes || {}
  const flota = config.flota || []
  const nombrePlanta = (id) => plantas.find((p) => p.id === id)?.nombre || ''
  const rosterIdDe = (id) => choferes.find((c) => c.uid === id)?.id || id

  // TRABAJOS (jobs) del transporte: se derivan de SUS órdenes (no puede leer bulk_jobs).
  // El "código" del trabajo es el prefijo del número de orden (ABC-0012 → ABC).
  const codigoTrabajo = (o) => String(o?.numero || '').split('-').slice(0, -1).join('-') || (o?.jobId || '')
  const trabajos = useMemo(() => [...new Set((ordenes || []).map(codigoTrabajo).filter(Boolean))].sort(), [ordenes])
  // Asigna a un chofer los trabajos que puede atender (se guarda en su ficha del roster).
  const guardarTrabajosChofer = async (choferId, jobs) => {
    await guardar('carriers', carrierId, { choferes: choferes.map((d) => (d.id === choferId ? { ...d, jobs } : d)), actualizadoEn: new Date().toISOString() })
  }

  const noLeidosOficina = (noLeidosPorConv(mensajes, usuario?.id)[convCarrier(carrierId)]) || 0
  // Resumen de los chats de orden (por chofer/viaje) para la sección CHOFERES.
  const resumenOrd = useMemo(() => resumenPorConversacion(mensajesOrdenes, usuario?.id), [mensajesOrdenes, usuario])
  const noLeidosChoferes = useMemo(() => Object.values(resumenOrd).reduce((a, r) => a + (r.noLeidos || 0), 0), [resumenOrd])
  // Chat interno PRIVADO 1-a-1 (transportista↔chofer de su flota, transportista↔oficina…).
  const yoPriv = useMemo(() => ({ uid: usuario?.id, rol: 'transportista', carrierId: carrierId || null }), [usuario?.id, carrierId])
  const { seccion: seccionPriv, abrir: abrirPriv, modal: modalPriv, noLeidos: noLeidosPriv } = usePrivados({ mensajes: mensajesPriv, uid: usuario?.id, tenantId, yo: yoPriv })
  // Abrir una conversación al tocar su aviso flotante: salta a la pestaña Mensajes.
  const [abrirExterno, setAbrirExterno] = useState(null)
  useEffect(() => onAbrirConversacion((k) => { setTab('mensajes'); if (k && k !== '__mensajes__') { setAbrirExterno(k); setTimeout(() => setAbrirExterno(null), 0) } }), [])
  const mensajesNuevos = noLeidosOficina + noLeidosChoferes + noLeidosPriv
  // Secciones del panel de mensajes: CHOFERES (chats por viaje) · ADMINISTRADOR (oficina).
  const seccionesMsg = useMemo(() => {
    const choferPorNombre = (nombre) => { const k = (nombre || '').trim().toLowerCase(); return choferes.find((x) => (x.nombre || '').trim().toLowerCase() === k) || null }
    const fotoChofer = (nombre) => { const d = choferPorNombre(nombre); return d?.foto || (d?.uid && avatares[d.uid]) || null }
    const itemsChoferes = ordenes
      .filter((o) => resumenOrd[o.id] || !FINAL.includes(o.estado))
      .filter((o) => o.choferNombre) // solo órdenes con chofer asignado (a quién escribir)
      .map((o) => {
        const r = resumenOrd[o.id] || {}
        const d = choferPorNombre(o.choferNombre)
        return { key: o.id, chatId: o.id, icon: 'chofer', foto: fotoChofer(o.choferNombre), titulo: o.choferNombre, rolLabel: t('Conductor'), rolColor: 'navy', viaje: o.numero || '', material: o.material || '', carga: o.tipoEquipo || '', lastText: r.lastText || '', lastTs: r.lastTs || o.creadoEn || '', noLeidos: r.noLeidos || 0, participantes: [o.choferId, o.transportistaId, o.clienteId].filter(Boolean), contacto: { uid: d?.uid || o.choferId || null, nombre: o.choferNombre, rol: 'chofer' } }
      })
    const rOfi = resumenPorConversacion(mensajes, usuario?.id)[convCarrier(carrierId)] || {}
    const itemsAdmin = [{ key: convCarrier(carrierId), chatId: convCarrier(carrierId), icon: 'admin', titulo: t('Administrador / Oficina'), rolLabel: t('Administrador'), rolColor: 'navy', lastText: rOfi.lastText || '', lastTs: rOfi.lastTs || '', noLeidos: noLeidosOficina, participantes: null }]
    return [
      { k: 'choferes', label: t('Choferes'), icon: 'chofer', items: itemsChoferes, vacio: t('Sin conversaciones con tus choferes todavía.') },
      { k: 'admin', label: t('Administrador'), icon: 'admin', items: itemsAdmin, vacio: t('Sin mensajes con la oficina.') },
      seccionPriv,
      { k: 'grupos', label: t('Grupos'), icon: 'grupo', items: gruposItems, vacio: t('Aún no perteneces a ningún grupo.') },
    ]
  }, [ordenes, resumenOrd, mensajes, usuario, carrierId, noLeidosOficina, choferes, gruposItems, avatares, seccionPriv, t])
  const geoNotifs = useNotifsGeocerca(carrierId) // entradas/salidas de geocerca de SU carrier
  // Pulso de 1 min: la alerta de GPS apagado necesita que el reloj avance solo.
  const [minuto, setMinuto] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setMinuto(Date.now()), 60000); return () => clearInterval(id) }, [])
  const notifsT = useMemo(() => [...geoNotifs, ...notificacionesTransportista({ ordenes, statements, mensajesNuevos, ahoraMs: minuto })], [geoNotifs, ordenes, statements, mensajesNuevos, minuto])

  // Presencia viva (en línea) por uid de chofer.
  const now = Date.now()
  const enLineaUid = useMemo(() => {
    const s = new Set()
    for (const p of presencias || []) {
      if (p.enLinea === true && (now - tsMillis(p.heartbeat || p.desde)) <= PRESENCIA_TTL_MS) s.add(p.uid || p.id)
    }
    return s
  }, [presencias, now])
  const choferEnLinea = (c) => enLineaUid.has(c.uid) || enLineaUid.has(c.id)
  const viajeActual = (c) => ordenes.find((o) => !FINAL.includes(o.estado) && (o.choferId === c.uid || o.choferId === c.id))

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const util = entregadas.reduce((a, o) => a + ((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0)), 0)
    const ganado = entregadas.reduce((a, o) => a + (Number(o.precioTransportista) || 0), 0)
    return { viajes: entregadas.length, activas: ordenes.filter((o) => !FINAL.includes(o.estado)).length, util, ganado, entregadas }
  }, [ordenes])
  const choferesEnLineaN = choferes.filter(choferEnLinea).length

  // ── Estado de cuenta ────────────────────────────────────────────────────────
  const cuenta = useMemo(() => {
    const pagado = (statements || []).filter((s) => s.estado === 'pagado').reduce((a, s) => a + (Number(s.total) || 0), 0)
    return { ganado: stats.ganado, pagado, pendiente: Math.max(0, stats.ganado - pagado) }
  }, [statements, stats.ganado])

  // ── Acciones ────────────────────────────────────────────────────────────────
  const guardarPago = async (driverId, tipo, valor) => {
    const nuevaCfg = { tipo, valor: Number(valor) || 0 }
    await crearConId('carrierConfig', carrierId, tenantId, { pagoChoferes: { ...pagoChoferes, [driverId]: nuevaCfg } })
    // El cambio NO es solo para el futuro: recalcula el pago del chofer en sus
    // viajes EN CURSO (los liberados/cerrados/cancelados son históricos y no se
    // tocan). La utilidad del transporte se recalcula sola (tarifa − pago).
    const FINALES = ['liberada', 'cerrada', 'cancelada']
    const uid = choferes.find((c) => c.id === driverId)?.uid || null
    const activas = (ordenes || []).filter((o) =>
      (o.choferId === uid || o.choferId === driverId) && !FINALES.includes(o.estado) && o.precioTransportista != null)
    let n = 0
    for (const o of activas) {
      const nuevo = calcularPagoChofer(o.precioTransportista, nuevaCfg)
      if (nuevo == null || Number(nuevo) === Number(o.pagoChofer)) continue
      try {
        await crearConId('orderPay_chofer', o.id, tenantId, { pagoChofer: nuevo, tipoPago: nuevaCfg.tipo })
        try { await guardar('orders', o.id, { pagoChofer: nuevo }) } catch { /* precios ya viven en el doc de pago */ }
        n++
      } catch { /* sin permiso sobre esa orden: se omite */ }
    }
    if (n > 0) window.alert(`${t('Pago actualizado. Se recalculó el pago de')} ${n} ${t('viaje(s) en curso; tu utilidad se actualizó igual.')}`)
  }
  const quitarPago = async (driverId) => {
    const next = { ...pagoChoferes }; delete next[driverId]
    await crearConId('carrierConfig', carrierId, tenantId, { pagoChoferes: next })
  }
  const asignarChofer = async (orden, driverId) => {
    const d = choferes.find((c) => c.id === driverId)
    const conf = configDeChofer(pagoChoferes, driverId)
    const pago = calcularPagoChofer(orden.precioTransportista, conf)
    await asignarOrdenManual(tenantId, orden, { uid: d?.uid || null, id: driverId, nombre: d?.nombre || '', carrierId: orden.transportistaId || carrierId }, { usuario, rol }, { pagoChofer: pago != null ? pago : undefined, tipoPago: conf?.tipo })
  }
  // Alta de chofer: agrega al roster de MI carrier y, si se dio correo/clave, crea su
  // cuenta de acceso (rol chofer, mismo carrier) para que entre a la app del chofer.
  const agregarChofer = async ({ nombre, email, password, telefono, licencia, equipo }) => {
    let uid = null
    if (email && password) {
      const r = await crearUsuario({ nombre, email, password, rol: BULK_ROLES.CHOFER, carrierId })
      uid = r?.uid || null
    }
    const chofer = { id: nuevoId('d'), nombre: nombre.trim(), telefono: (telefono || '').trim(), licencia: (licencia || '').trim(), equipos: equipo ? [equipo] : [], equipo: equipo || '', uid, activo: true }
    await guardar('carriers', carrierId, { choferes: [...choferes, chofer] })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'alta_chofer', entidad: 'chofer', detalle: `${chofer.nombre}${uid ? ' (con acceso)' : ''}` })
  }
  const toggleActivoChofer = async (chofer) => {
    await guardar('carriers', carrierId, { choferes: choferes.map((d) => (d.id === chofer.id ? { ...d, activo: d.activo === false } : d)) })
  }
  // Flota (equipos/camiones) del carrier → vive en carrierConfig (lo escribe el propio
  // transportista). No toca carrier.equipos (tipos aprobados, que gestiona el admin).
  const guardarFlota = async (lista) => { await crearConId('carrierConfig', carrierId, tenantId, { flota: lista }) }
  const agregarEquipo = async (v) => guardarFlota([...flota, { id: nuevoId('v'), ...v }])
  const editarEquipo = async (id, patch) => guardarFlota(flota.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  const eliminarEquipo = async (id) => guardarFlota(flota.filter((f) => f.id !== id))

  // ── DETALLE DE ORDEN 2026 (Bloque 3) ───────────────────────────────────────
  // Tocar una orden en la cola/órdenes abre el esqueleto compartido. Se guarda
  // el ID (no el objeto) para que el detalle se refresque con los datos en vivo.
  const [detalleId, setDetalleId] = useState(null)
  const [chatDe, setChatDe] = useState(null)       // orden con su chat abierto
  const [asignarDe, setAsignarDe] = useState(null) // orden en el sheet de asignación
  const ordenDetalle = ordenes.find((o) => o.id === detalleId) || null
  const abrirDetalle = (o) => setDetalleId(o.id)
  // Mismo criterio que el select de la tabla de órdenes: choferes asignados al
  // trabajo de la orden; si ninguno lo tiene, se ofrecen todos.
  const choferesDeTrabajoDe = (cod) => { const asig = choferes.filter((c) => (c.jobs || []).includes(cod)); return asig.length ? asig : choferes }

  if (cargando) return <div className="grid min-h-screen place-items-center"><Cargando /></div>

  // ── Pestañas 2026 ──────────────────────────────────────────────────────────
  // Barra flotante: Inicio · Choferes · Chats · Facturas. Las DEMÁS pestañas del
  // portal (cola, órdenes, equipos, estado de cuenta, pago a choferes, perfil)
  // siguen existiendo como pantallas internas: se llega desde la home (Accesos)
  // o tocando el avatar (perfil). Los permisos de Roles siguen mandando.
  const tabFacturas = puede('facturacion.ver') ? 'facturacion' : 'cuenta'
  // Si la pestaña actual quedó oculta por permisos, cae a la home.
  const activo = ((tab === 'cola' || tab === 'ordenes') && !puede('ordenes.ver')) ? 'inicio'
    : (tab === 'facturacion' && !puede('facturacion.ver')) ? 'cuenta'
      : tab
  const barActivo = activo === 'mensajes' ? 'mensajes'
    : ['choferes', 'equipos', 'pagos'].includes(activo) ? 'choferes'
      : ['cuenta', 'facturacion'].includes(activo) ? tabFacturas
        : 'inicio'

  return (
    // Carcasa móvil 2026: fondo crema, altura fija (h-dvh) y el CUERPO desplaza
    // por dentro (overflow-y-auto en <main>); en Chats el panel mide exacto.
    <div className="mp-app h-dvh mx-auto flex max-w-md flex-col overflow-hidden">
      {/* Avisos en-app de entrada/salida de geocercas (de SU carrier). */}
      <AvisosGeocerca carrierId={carrierId} />
      {/* Aviso VISUAL rápido de mensajes nuevos. */}
      <AvisosMensajes />
      <header className="mp-app-safe flex items-center gap-3 px-4 pb-1 pt-2">
        <button type="button" onClick={() => setTab('perfil')} title={t('Mi perfil')} className="transition active:scale-95">
          <Avatar foto={avatares[usuario?.id]} nombre={usuario?.nombre} size={40} redondo />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-mp-ink">{usuario?.nombre}</div>
          <div className="truncate text-[12px] text-mp-ink-2">{carrier?.nombre ? `${carrier.nombre} · ${t('Transportista')}` : t('Transportista')}</div>
        </div>
        <CampanaNotificaciones notifs={notifsT} claveLS="bulk_notif_transportista" />
        <IconButton icon={Grid2x2} label={t('Cambiar módulo')} onClick={() => navigate('/elegir')} />
        <IconButton icon={LogOut} label={t('Salir')} onClick={cerrarSesion} />
      </header>

      <main className={`relative flex-1 p-3 ${activo === 'mensajes' ? 'overflow-hidden pb-2' : 'overflow-y-auto pb-32'}`}>
        {!usuario?.carrierId && (
          <Aviso tipo="warn" className="mb-3">
            <div>{t('Tu cuenta no está ligada a un transportista. Si el administrador ya la asignó, toca “Reparar mi acceso”. Si no, pídele que la asigne.')}</div>
            <RepararAcceso className="mt-2 px-3 py-1 text-xs" />
          </Aviso>
        )}

        {activo === 'inicio' && (() => {
          // ── HOME 2026 (Bloque 2.2) ────────────────────────────────────────
          const num = (v) => Number(v) || 0
          const ms = (v) => { const m = tsMillis(v) || Date.parse(v); return Number.isFinite(m) ? m : null }
          const hoy = new Date()
          const hoyStr = hoy.toDateString()
          const esHoy = (v) => { const m = ms(v); return m != null && new Date(m).toDateString() === hoyStr }
          // Ingresos de la semana (lunes→hoy) vs la semana pasada, con las MISMAS
          // órdenes entregadas que ya alimentan el estado de cuenta.
          const iniSem = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - ((hoy.getDay() + 6) % 7)).getTime()
          const iniPrev = iniSem - 7 * 86400000
          let ingSem = 0; let ingPrev = 0; let viajesSem = 0
          for (const o of stats.entregadas) {
            const f = ms(o.hitos?.entrega || o.hitos?.liberacion || o.creadoEn)
            if (f == null) continue
            if (f >= iniSem) { ingSem += num(o.precioTransportista); viajesSem++ }
            else if (f >= iniPrev) ingPrev += num(o.precioTransportista)
          }
          const difPct = ingPrev > 0 ? Math.round(((ingSem - ingPrev) / ingPrev) * 100) : null
          const viajesHoy = ordenes.filter((o) => esHoy(o.hitos?.entrega)).length
          const enRuta = choferes.map((c) => ({ c, o: viajeActual(c) })).filter((x) => x.o)
          const totalFlota = flota.length || choferes.length
          const avisosPend = (statements || []).filter((s) => s.estado !== 'pagado').length
          const verOrdenes = puede('ordenes.ver')
          return (
            <div className="space-y-2 px-1">
              <div className="pb-1 pt-1">
                <div className="text-[12px] text-mp-ink-2">{t('Hola')}, {String(usuario?.nombre || '').split(' ')[0]} 👋</div>
                <h1 className="m-0 text-[22px] font-medium text-mp-ink">{t('Tu semana')}</h1>
              </div>

              {/* Tarjeta protagonista: ingresos de la semana (sin botón dorado aquí). */}
              <FeatureCard>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-mp-cream/70">{t('Ingresos de la semana')}</span>
                  {difPct != null && (
                    <StatusPill sobreNavy color={difPct >= 0 ? 'var(--mp-green)' : 'var(--mp-red)'}>
                      {difPct >= 0 ? '+' : ''}{difPct}% {t('vs semana pasada')}
                    </StatusPill>
                  )}
                </div>
                <div className="mt-2 text-[32px] font-medium leading-none">{money(ingSem)}</div>
                <div className="mt-2 text-[13px] text-mp-cream/80">{viajesSem} {t('viaje(s) entregados')}</div>
              </FeatureCard>

              {/* Stats de hoy */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard etiqueta={t('Camiones activos')} valor={choferesEnLineaN} sufijo={totalFlota ? `/${totalFlota}` : ''} />
                <StatCard etiqueta={t('Viajes hoy')} valor={viajesHoy} />
              </div>

              {/* Por facturar → ÚNICO botón dorado de la pantalla. */}
              <div className="rounded-card bg-white p-4 shadow-card">
                <div className="text-[12px] text-mp-ink-2">{t('Por facturar')}</div>
                <div className="mt-1 text-[28px] font-medium leading-none text-mp-ink">{money(cuenta.pendiente)}</div>
                <div className="mt-1 text-[12px] text-mp-ink-2">{stats.entregadas.length} {t('viaje(s) entregados')} · {avisosPend} {t('aviso(s) de pago pendientes')}</div>
                <PrimaryButton className="mt-3" icon={FileText} onClick={() => setTab(tabFacturas)}>{t('Facturar')}</PrimaryButton>
              </div>

              {/* Sparkline (Negocio·B1): facturación acumulada de ESTE mes vs el
                  anterior, con las mismas órdenes entregadas de la home. */}
              <SparklineFacturar t={t} entregadas={stats.entregadas} />

              {/* Choferes con orden activa */}
              {enRuta.length > 0 && (
                <>
                  <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Choferes en ruta')}</div>
                  {enRuta.map(({ c, o }) => (
                    <ListRow key={c.id} icon={Truck}
                      titulo={<span className="inline-flex max-w-full items-center gap-1.5"><span className="truncate">{c.nombre}</span>{choferEnLinea(c) && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill" style={{ background: 'var(--mp-green)' }} />}</span>}
                      meta={`${t(o.material || 'Carga')} · ${o.numero || ''}`}
                      derecha={<StatusPill color={PILL_COLOR[ORDEN_ESTADO_COLOR[o.estado]] || 'var(--mp-gold)'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>}
                      onClick={verOrdenes ? () => abrirDetalle(o) : undefined} />
                  ))}
                </>
              )}

              {/* Accesos: el resto de las pestañas del portal vive aquí */}
              <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Accesos')}</div>
              {verOrdenes && <ListRow icon={Radio} titulo={t('Cola')} meta={t('En proceso')} onClick={() => setTab('cola')} />}
              {verOrdenes && <ListRow icon={ClipboardList} titulo={t('Órdenes')} meta={t('Todas tus órdenes y asignación de choferes')} onClick={() => setTab('ordenes')} />}
              <ListRow icon={Truck} titulo={t('Equipos')} meta={t('Tu flota de camiones')} onClick={() => setTab('equipos')} />
              <ListRow icon={DollarSign} titulo={t('Pago a choferes')} onClick={() => setTab('pagos')} />
              {tabFacturas === 'facturacion' && <ListRow icon={Wallet} titulo={t('Estado de cuenta')} onClick={() => setTab('cuenta')} />}

              {/* Gráficas (Negocio·B1): agregados nocturnos + cálculo en cliente. */}
              <SeccionGraficas t={t} entregadas={stats.entregadas} statsAgg={statsAgg}
                nombrePlanta={nombrePlanta} choferes={choferes} avatares={avatares}
                irAChoferes={() => setTab('choferes')} />
            </div>
          )
        })()}

        {activo === 'cola' && puede('ordenes.ver') && <TabCola {...{ t, ordenes, nombrePlanta, trabajos, codigoTrabajo, abrirDetalle }} />}
      {activo === 'ordenes' && puede('ordenes.ver') && <TabOrdenes {...{ t, ordenes, choferes, rosterIdDe, asignarChofer, nombrePlanta, trabajos, codigoTrabajo, geocercas: geocercasEta, abrirDetalle }} />}
      {activo === 'choferes' && <TabChoferes {...{ t, choferes, choferEnLinea, viajeActual, pagoChoferes, guardarPago, quitarPago, toggleActivoChofer, agregarChofer, trabajos, guardarTrabajosChofer, avatares, tiposCamion, cargandoEquipos, califs: califPorChofer }} />}
      {activo === 'equipos' && <TabEquipos {...{ t, flota, choferes, carrier, agregarEquipo, editarEquipo, eliminarEquipo }} />}
      {activo === 'cuenta' && <TabCuenta {...{ t, cuenta, stats, statements }} />}
      {activo === 'pagos' && <TabPagoChoferes {...{ t, choferes, ordenes, retiros, avatares }} />}
      {activo === 'facturacion' && puede('facturacion.ver') && <TabFacturacion {...{ t, statements, cuenta }} />}
      {activo === 'mensajes' && (
        usuario?.carrierId
          ? <>
              <PanelConversaciones secciones={seccionesMsg} alturaClass="h-mensajes-chofer" abrir={abrirExterno || abrirPriv} estiloApp
                menuConversacion={(item) => menuGrupoConv({ item, grupos, uid: usuario?.id, t })}
                accion={<span className="flex items-center gap-1.5"><BotonReunion /><Boton variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setVerGrupos(true)}><Users size={15} strokeWidth={1.75} /> {t('Grupos')}{invitaciones.length > 0 && <span className="ml-1 grid h-4 min-w-[16px] place-items-center rounded-pill bg-mp-gold px-1 text-[10px] font-bold text-mp-navy">{invitaciones.length}</span>}</Boton></span>} />
              {verGrupos && <GruposModal grupos={grupos} invitaciones={invitaciones} candidatos={candidatosGrupo} puedeCrear uid={usuario?.id} onClose={() => setVerGrupos(false)} />}
              {modalPriv}
            </>
          : <Card className="p-4"><span className="text-sm text-slate-400">{t('Tu cuenta no está ligada a un transportista. Pídele al administrador que la asigne.')}</span></Card>
      )}
      {activo === 'perfil' && (
        <PerfilTransportista t={t} usuario={usuario} tenantId={tenantId} carrier={carrier} avatares={avatares} navigate={navigate} cerrarSesion={cerrarSesion} />
      )}
      </main>

      {/* DETALLE DE ORDEN 2026 (Bloque 3): capa completa sobre el portal. */}
      {ordenDetalle && (
        <DetalleOrdenTransportista t={t} orden={ordenDetalle} choferes={choferes} nombrePlanta={nombrePlanta}
          avatares={avatares} choferEnLinea={choferEnLinea} noLeidos={resumenOrd[ordenDetalle.id]?.noLeidos || 0}
          onVolver={() => setDetalleId(null)} onChat={() => setChatDe(ordenDetalle)} onAsignar={() => setAsignarDe(ordenDetalle)} />
      )}

      {/* Sheet de asignación/transferencia: el MISMO flujo asignarChofer del
          select de la tabla, en formato táctil (roster del trabajo). */}
      {asignarDe && (
        <SheetAsignarChofer t={t} orden={asignarDe} choferes={choferesDeTrabajoDe(codigoTrabajo(asignarDe))}
          rosterIdDe={rosterIdDe} choferEnLinea={choferEnLinea} avatares={avatares}
          onAsignar={async (driverId) => { await asignarChofer(asignarDe, driverId); setAsignarDe(null) }}
          onClose={() => setAsignarDe(null)} />
      )}

      {/* Chat de la orden abierta: capa completa por encima del detalle. */}
      {chatDe && (
        <div className="fixed inset-0 z-[70] mx-auto flex max-w-md flex-col bg-white dark:bg-slate-900">
          <ChatOrden orden={chatDe} fill estiloApp onVolver={() => setChatDe(null)} />
        </div>
      )}

      {/* Barra FLOTANTE 2026 (Bloque 2.2): 4 tabs, Chats SIEMPRE en tercera
          posición. Cola/Órdenes/Equipos/Pagos/Estado de cuenta/Perfil siguen
          existiendo como pantallas (se llega desde la home o el avatar). */}
      <FloatingTabBar
        activo={barActivo}
        onSelect={setTab}
        tabs={[
          { k: 'inicio', label: t('Inicio'), icon: Home },
          { k: 'choferes', label: t('Choferes'), icon: Users },
          { k: 'mensajes', label: t('Chats'), icon: MessageSquare, badge: mensajesNuevos },
          { k: tabFacturas, label: t('Facturas'), icon: FileText },
        ]}
      />
    </div>
  )
}

// ── SECCIÓN DE GRÁFICAS de la home (Negocio·B1) ──────────────────────────────
// Doble fuente: agregados nocturnos (bulk_stats, por semana ISO) y, como respaldo
// y para la semana EN CURSO, el cálculo en cliente sobre las mismas órdenes
// entregadas de la home (ingreso = precioTransportista). Todo estilo del sistema.

// Tick del eje Y de "Toneladas por chofer": avatar redondo (si el sistema ya lo
// tiene a mano) + nombre a la izquierda. Recharts clona el elemento con x/y/payload.
function TickChofer({ x = 0, y = 0, payload = {}, fotos = {} }) {
  const nombre = String(payload.value || '')
  const foto = fotos[nombre] || null
  const corto = nombre.length > 12 ? `${nombre.slice(0, 11)}…` : nombre
  const clip = `gcht_${payload.index || 0}`
  return (
    <g transform={`translate(${x},${y})`}>
      {foto && (
        <>
          <defs><clipPath id={clip}><circle cx={-100} cy={0} r={8} /></clipPath></defs>
          <image href={foto} x={-108} y={-8} width={16} height={16} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        </>
      )}
      <text x={foto ? -88 : -108} y={0} dy={3.5} fontSize={11} fill={GRAF.ink2} textAnchor="start">{corto}</text>
    </g>
  )
}

function SeccionGraficas({ t, entregadas = [], statsAgg = [], nombrePlanta, choferes = [], avatares = {}, irAChoferes }) {
  const [modo, setModo] = useState('sem')  // toggle pill Semana / Mes
  const [sel, setSel] = useState(null)     // barra tocada en "Ingresos" (índice)

  // Todo lo que pintan las gráficas, con la regla de fuentes en un solo lugar.
  const datos = useMemo(() => {
    // 1) Cálculo en CLIENTE por semana ISO (respaldo + día en curso).
    const cli = {}
    for (const o of entregadas) {
      const m = msOrden(o); if (m == null) continue
      const k = semanaISO(new Date(m))
      const s = (cli[k] ||= { semana: k, ingresos: 0, viajes: 0, toneladas: 0, porChofer: {}, esperaPlanta: {} })
      sumarOrdenStat(s, o, nombrePlanta)
    }
    // 2) Agregados nocturnos por semana.
    const agg = {}; for (const s of statsAgg) if (s.semana) agg[s.semana] = s
    const kAhora = semanaISO(new Date())
    // Fuente de cada semana: agregado si existe; la semana ACTUAL siempre cliente.
    const de = (k) => (k === kAhora ? cli[k] : (agg[k] || cli[k])) || null

    // Serie SEMANAS: últimas 8 (lunes local → etiqueta corta d/m).
    const lunes0 = lunesDe(Date.now())
    const semanas = []; const clavesSem = []
    for (let i = 7; i >= 0; i--) {
      const m = lunes0 - i * 7 * DIA_MS
      const k = semanaISO(new Date(m)); clavesSem.push(k)
      const d = new Date(m); const s = de(k)
      semanas.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, ingresos: numV(s?.ingresos), viajes: numV(s?.viajes), actual: k === kAhora })
    }

    // Serie MESES: últimos 6, sumando cada semana (misma fuente elegida) en el
    // mes de su jueves — así los agregados nocturnos también cuentan aquí.
    const hoy = new Date()
    const iniMeses = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1).getTime()
    const mesAcc = {}; const vistos = new Set(); const clavesMes = []
    for (let w = lunesDe(iniMeses); w <= lunes0; w += 7 * DIA_MS) {
      const k = semanaISO(new Date(w))
      if (vistos.has(k)) continue; vistos.add(k); clavesMes.push(k)
      const s = de(k); if (!s) continue
      const j = new Date(w + 3 * DIA_MS) // jueves de la semana
      const km = `${j.getFullYear()}-${j.getMonth()}`
      const acc = (mesAcc[km] ||= { ingresos: 0, viajes: 0 })
      acc.ingresos += numV(s.ingresos); acc.viajes += numV(s.viajes)
    }
    const meses = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
      const acc = mesAcc[`${d.getFullYear()}-${d.getMonth()}`] || { ingresos: 0, viajes: 0 }
      meses.push({ label: d.toLocaleDateString('es', { month: 'short' }), ingresos: acc.ingresos, viajes: acc.viajes, actual: i === 0 })
    }

    // Resumen del PERÍODO VISIBLE (toneladas por chofer + espera por planta).
    const resumen = (claves) => {
      const porChofer = {}; const espera = {}
      for (const k of claves) {
        const s = de(k); if (!s) continue
        for (const [n, v] of Object.entries(s.porChofer || {})) { const c = (porChofer[n] ||= { ton: 0, viajes: 0 }); c.ton += numV(v.ton); c.viajes += numV(v.viajes) }
        for (const [id, v] of Object.entries(s.esperaPlanta || {})) {
          const e = (espera[id] ||= { nombre: v.nombre || nombrePlanta(id) || 'Planta', sum: 0, n: 0 })
          const nn = numV(v.n) || 1
          e.sum += v.sum != null ? numV(v.sum) : numV(v.minProm) * nn // cliente trae suma; el agregado, promedio
          e.n += nn
        }
      }
      const topChoferes = Object.entries(porChofer).map(([nombre, v]) => ({ nombre, ton: Math.round(v.ton * 10) / 10, viajes: v.viajes }))
        .sort((a, b) => b.ton - a.ton).slice(0, 8)
      const esperaPlantas = Object.values(espera).filter((e) => e.n > 0)
        .map((e) => ({ nombre: e.nombre, minProm: Math.round(e.sum / e.n) }))
        .sort((a, b) => b.minProm - a.minProm).slice(0, 8)
      return { topChoferes, esperaPlantas }
    }

    return {
      semanas, meses,
      porModo: { sem: resumen(clavesSem), mes: resumen(clavesMes) },
      inicioPeriodo: { sem: lunes0 - 7 * 7 * DIA_MS, mes: iniMeses },
    }
  }, [entregadas, statsAgg, nombrePlanta])

  const serie = modo === 'sem' ? datos.semanas : datos.meses
  const hayIngresos = serie.some((p) => p.ingresos > 0 || p.viajes > 0)
  const { topChoferes, esperaPlantas } = datos.porModo[modo]
  const puntoSel = serie[sel != null && sel < serie.length ? sel : serie.length - 1]
  const fotosChofer = useMemo(() => {
    const m = {}; for (const c of choferes) { const f = c.foto || avatares[c.uid]; if (f) m[c.nombre] = f }
    return m
  }, [choferes, avatares])

  // Exportar CSV del período visible (orden, fecha, chofer, planta, ton, ingreso).
  // Comparte el ARCHIVO con navigator.share si el dispositivo lo permite; si no,
  // copia al portapapeles y avisa. Nada de <a download> (la app nativa lo bloquea).
  const exportar = async () => {
    const desde = datos.inicioPeriodo[modo]
    const filas = entregadas.filter((o) => { const m = msOrden(o); return m != null && m >= desde }).sort((a, b) => (msOrden(a) || 0) - (msOrden(b) || 0))
    if (filas.length === 0) { window.alert(t('Sin datos en el período.')); return }
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const csv = [
      [t('Orden'), t('Fecha'), t('Chofer'), t('Planta'), t('Toneladas'), t('Ingreso')].map(esc).join(','),
      ...filas.map((o) => [o.numero || o.id, new Date(msOrden(o)).toISOString().slice(0, 10), o.choferNombre || '', nombrePlanta(o.plantaId) || '', numV(o.pesoReal ?? o.pesoEstimado), numV(o.precioTransportista)].map(esc).join(',')),
    ].join('\n')
    try {
      const archivo = new File([csv], 'milepay-viajes.csv', { type: 'text/csv' })
      if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo], title: t('Ingresos') }); return }
    } catch (e) { if (e?.name === 'AbortError') return /* canceló el share */ }
    try { await navigator.clipboard.writeText(csv); window.alert(t('Copiado para compartir.')) } catch { window.alert(t('No se pudo exportar:') + ' CSV') }
  }

  return (
    <>
      {/* Título de la sección + Exportar (discreto, NO dorado). */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="text-[15px] font-medium text-mp-ink">{t('Estadísticas')}</div>
        <button type="button" onClick={exportar}
          className="inline-flex items-center gap-1.5 rounded-pill px-2 py-1 text-[12px] text-mp-ink-2 transition active:scale-95">
          <Download size={14} strokeWidth={1.75} /> {t('Exportar')}
        </button>
      </div>

      {/* 1) Ingresos por semana/mes: la barra del período ACTUAL en dorado, las
          anteriores en navy al 30 %. Tocar una barra → detalle bajo la gráfica. */}
      <CardApp>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] text-mp-ink-2">{modo === 'sem' ? t('Ingresos por semana') : t('Ingresos por mes')}</div>
          <div className="flex rounded-pill bg-mp-navy/5 p-0.5 text-[12px]">
            {[['sem', t('Semana')], ['mes', t('Mes')]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setModo(k); setSel(null) }}
                className={`rounded-pill px-3 py-1 transition ${modo === k ? 'bg-mp-navy text-mp-cream' : 'text-mp-ink-2'}`}>{l}</button>
            ))}
          </div>
        </div>
        {hayIngresos ? (
          <>
            <div className="mt-3 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRAF.grid} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 10, fill: GRAF.ink2 }} />
                  <Bar dataKey="ingresos" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} cursor="pointer"
                    onClick={(_, i) => setSel(i)}>
                    {serie.map((p, i) => <Cell key={i} fill={p.actual ? GRAF.gold : GRAF.navy30} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {puntoSel && (
              <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-mp-line pt-2 text-[13px]">
                <span className="text-mp-ink-2">{modo === 'sem' ? `${t('Semana')} ${puntoSel.label}` : puntoSel.label}</span>
                <span className="font-medium text-mp-ink">{money(puntoSel.ingresos)} · {puntoSel.viajes} {t('viaje(s)')}</span>
              </div>
            )}
          </>
        ) : <div className="mt-3 text-[13px] text-mp-ink-2">{t('Sin datos en el período.')}</div>}
      </CardApp>

      {/* 2) Toneladas por chofer: horizontales, top 8 del período visible; tocar
          la gráfica lleva a la pestaña Choferes. */}
      {topChoferes.length > 0 && (
        <CardApp onClick={irAChoferes}>
          <div className="text-[12px] text-mp-ink-2">{t('Toneladas por chofer')}</div>
          <div className="mt-2" style={{ height: topChoferes.length * 32 + 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topChoferes} layout="vertical" margin={{ top: 0, right: 34, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRAF.grid} />
                <XAxis type="number" hide domain={[0, (max) => Math.ceil((max || 1) * 1.15)]} />
                <YAxis type="category" dataKey="nombre" width={112} axisLine={false} tickLine={false} tick={<TickChofer fotos={fotosChofer} />} />
                <Bar dataKey="ton" fill={GRAF.gold} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} cursor="pointer">
                  <LabelList dataKey="ton" position="right" style={{ fontSize: 11, fill: GRAF.ink2 }} formatter={(v) => `${v} ${t('Ton').toLowerCase()}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardApp>
      )}

      {/* 3) Tiempo de espera por planta (minutos promedio): >30 min en ámbar.
          Sin hitos llegada/salida de planta, la tarjeta ni aparece. */}
      {esperaPlantas.length > 0 && (
        <CardApp>
          <div className="text-[12px] text-mp-ink-2">{t('Tiempo de espera por planta')}</div>
          <div className="mt-2" style={{ height: esperaPlantas.length * 32 + 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={esperaPlantas} layout="vertical" margin={{ top: 0, right: 46, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRAF.grid} />
                <XAxis type="number" hide domain={[0, (max) => Math.ceil((max || 1) * 1.15)]} />
                <YAxis type="category" dataKey="nombre" width={112} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: GRAF.ink2 }} />
                <Bar dataKey="minProm" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
                  {esperaPlantas.map((p, i) => <Cell key={i} fill={p.minProm > 30 ? GRAF.amber : GRAF.navy30} />)}
                  <LabelList dataKey="minProm" position="right" style={{ fontSize: 11, fill: GRAF.ink2 }} formatter={(v) => `${v} ${t('min')}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardApp>
      )}
    </>
  )
}

// Mini gráfica de LÍNEA bajo "Por facturar": facturación acumulada del mes en
// curso (dorado) contra el mes anterior (navy 30 %). Sin ejes, ~48 px de alto.
function SparklineFacturar({ t, entregadas = [] }) {
  const puntos = useMemo(() => {
    const hoy = new Date(); const a = hoy.getFullYear(); const m = hoy.getMonth()
    const aPrev = m === 0 ? a - 1 : a; const mPrev = m === 0 ? 11 : m - 1
    const diasAct = new Date(a, m + 1, 0).getDate(); const diasPrev = new Date(aPrev, mPrev + 1, 0).getDate()
    const act = Array(diasAct).fill(0); const prev = Array(diasPrev).fill(0)
    let hay = false
    for (const o of entregadas) {
      const ms = msOrden(o); if (ms == null) continue
      const d = new Date(ms)
      if (d.getFullYear() === a && d.getMonth() === m) { act[d.getDate() - 1] += numV(o.precioTransportista); hay = true }
      else if (d.getFullYear() === aPrev && d.getMonth() === mPrev) { prev[d.getDate() - 1] += numV(o.precioTransportista); hay = true }
    }
    if (!hay) return null
    const lista = []; let sa = 0; let sp = 0
    for (let d = 1; d <= Math.max(diasAct, diasPrev); d++) {
      if (d <= diasAct) sa += act[d - 1]
      if (d <= diasPrev) sp += prev[d - 1]
      // La línea dorada se corta HOY (lo que va del mes); la navy corre completa.
      lista.push({ d, act: d <= hoy.getDate() ? sa : null, prev: d <= diasPrev ? sp : null })
    }
    return lista
  }, [entregadas])
  if (!puntos) return null
  return (
    <CardApp>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-[12px] text-mp-ink-2">{t('Facturación acumulada')}</span>
        <span className="flex items-center gap-2.5 text-[11px] text-mp-ink-2">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-pill" style={{ background: GRAF.gold }} /> {t('Este mes')}</span>
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-pill" style={{ background: GRAF.navy30 }} /> {t('Mes anterior')}</span>
        </span>
      </div>
      <div className="mt-2 h-[48px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={puntos} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <Line dataKey="prev" stroke={GRAF.navy30} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="act" stroke={GRAF.gold} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </CardApp>
  )
}

// ── Pestaña PERFIL (2026, mínima): avatar editable (sistema central de avatares),
// idioma, cambio de contraseña, cambio de módulo y salir. Sin datos inventados.
function PerfilTransportista({ t, usuario, tenantId, carrier, avatares, navigate, cerrarSesion }) {
  const [verClave, setVerClave] = useState(false)
  const [foto, setFoto] = useState(null)
  const fotoActual = foto || avatares[usuario?.id] || null
  const onFoto = async (e) => {
    const f = await leerFotoReducida(e.target.files?.[0])
    if (!f) return
    setFoto(f)
    try { await guardarAvatar(tenantId, usuario.id, f) } catch { window.alert(t('No se pudo guardar la foto.')) }
  }
  return (
    <div className="space-y-2 px-1">
      <div className="rounded-card bg-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <Avatar foto={fotoActual} nombre={usuario?.nombre} size={64} redondo />
            <label className="absolute -bottom-1 -right-1 grid h-7 w-7 cursor-pointer place-items-center rounded-pill bg-mp-gold text-mp-navy shadow-card" title={t('Cambiar foto')}>
              <Camera size={14} strokeWidth={1.75} />
              <input type="file" accept="image/*" onChange={onFoto} className="hidden" />
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-mp-ink">{usuario?.nombre}</div>
            <div className="truncate text-[12px] text-mp-ink-2">{usuario?.email}</div>
            <div className="mt-1.5"><StatusPill color="var(--mp-gold)">{carrier?.nombre || t('Transportista')}</StatusPill></div>
          </div>
        </div>
      </div>

      <div className="rounded-card bg-white p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-[14px] font-medium text-mp-ink"><Languages size={18} strokeWidth={1.75} /> {t('Idioma')}</span>
          <LangToggle />
        </div>
      </div>

      <SecondaryButton icon={KeyRound} onClick={() => setVerClave(true)}>{t('Cambiar contraseña')}</SecondaryButton>
      <SecondaryButton icon={Grid2x2} onClick={() => navigate('/elegir')}>{t('Cambiar módulo')}</SecondaryButton>
      <button type="button" onClick={cerrarSesion}
        className="flex h-[44px] w-full items-center justify-center gap-2 rounded-pill border text-[14px] font-medium transition active:scale-[0.99]"
        style={{ borderColor: 'var(--mp-red)', color: 'var(--mp-red)' }}>
        <LogOut size={18} strokeWidth={1.75} /> {t('Cerrar sesión')}
      </button>

      <div className="rounded-card bg-white p-4 shadow-card">
        <div className="mb-1.5 text-[12px] text-mp-ink-2">{t('¿No ves tus órdenes o cambió tu transportista? Refresca tus permisos aquí.')}</div>
        <RepararAcceso variant="ghost" />
      </div>

      {verClave && <CambiarClave onClose={() => setVerClave(false)} />}
    </div>
  )
}

// ── Tab Cola / En proceso: solo LECTURA. Muestra las órdenes de su transporte que
// un chofer YA ACEPTÓ y están en curso (aceptada → en destino). La asignación de
// choferes se hace en la pestaña "Órdenes"; aquí no se asigna.
const EN_PROCESO_EST = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
function TabCola({ t, ordenes, nombrePlanta, trabajos = [], codigoTrabajo = () => '', abrirDetalle = () => {} }) {
  const PRIO = { aceptada: 0, en_planta: 1, cargando: 2, en_ruta: 3, en_destino: 4 }
  const [fTrabajo, setFTrabajo] = useState('')
  const cola = ordenes.filter((o) => EN_PROCESO_EST.includes(o.estado))
    .filter((o) => !fTrabajo || codigoTrabajo(o) === fTrabajo)
    .sort((a, b) => (PRIO[a.estado] ?? 9) - (PRIO[b.estado] ?? 9) || (a.numero || '').localeCompare(b.numero || ''))

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Truck size={16} className="text-amber-500" />
        <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('En proceso')}</h3>
        <Badge color="gold">{cola.length}</Badge>
        {trabajos.length > 0 && (
          <Select value={fTrabajo} onChange={(e) => setFTrabajo(e.target.value)} className="ml-auto py-1.5 text-sm"><option value="">{t('Todos los trabajos')}</option>{trabajos.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        )}
      </div>
      {cola.length === 0
        ? <EstadoVacio titulo={t('No hay órdenes en proceso')} texto={t('Aquí verás tus órdenes una vez que un chofer las acepte y estén en curso.')} mostrarBoton={false} />
        : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cola.map((o) => (
              // Tocar la tarjeta abre el DETALLE de la orden (Bloque 3).
              <Card key={o.id} className="cursor-pointer p-3.5" onClick={() => abrirDetalle(o)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                  <Badge color="navy">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                  <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {o.tipoEquipo || '—'}</div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} className="text-amber-500" /> {nombrePlanta(o.plantaId) || t('Planta')} → {o.direccionEntrega || '—'}</div>
                <div className="mt-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-1.5 text-xs dark:bg-slate-800/60">
                  <span className="text-slate-500 dark:text-slate-400">{t('Recibes')} <b className="text-brand-navy dark:text-slate-100">{money(o.precioTransportista)}</b></span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{money((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0))}</span>
                </div>
                {o.choferNombre && <div className="mt-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t('Chofer:')} {o.choferNombre}</div>}
              </Card>
            ))}
          </div>
        )}
    </>
  )
}

// ── Tab Órdenes: tabla filtrada a MIS órdenes, con estados de color ───────────
function TabOrdenes({ t, ordenes, choferes, rosterIdDe, asignarChofer, nombrePlanta, trabajos = [], codigoTrabajo = () => '', geocercas = [], abrirDetalle = () => {} }) {
  const { usuario, tenantId, rol } = useBulkAuth()
  const [q, setQ] = useState('')
  const [fEstado, setFEstado] = useState('')
  const [fTrabajo, setFTrabajo] = useState('')
  const estados = [...new Set(ordenes.map((o) => o.estado))]
  // Choferes que atienden un trabajo (los que lo tienen en su ficha); si ninguno está
  // asignado a ese trabajo, se ofrecen todos. Así el transporte manda al driver correcto.
  const choferesDeTrabajo = (cod) => { const asig = choferes.filter((c) => (c.jobs || []).includes(cod)); return asig.length ? asig : choferes }
  const rows = ordenes
    .filter((o) => !fEstado || o.estado === fEstado)
    .filter((o) => !fTrabajo || codigoTrabajo(o) === fTrabajo)
    .filter((o) => { const s = q.trim().toLowerCase(); return !s || `${o.numero} ${o.material} ${o.choferNombre}`.toLowerCase().includes(s) })
    .sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
    .map((o) => ({ ...o, _key: o.id }))

  if (ordenes.length === 0) return <EstadoVacio titulo={t('Aún no tienes órdenes asignadas')} texto={t('Cuando el dispatcher te asigne órdenes, aparecerán aquí para que asignes tus choferes.')} mostrarBoton={false} />

  const cols = [
    { key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') },
    { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'tipoEquipo', label: t('Camión') },
    { key: 'chofer', label: t('Chofer') }, { key: 'ruta', label: t('Ruta'), wrap: true },
    { key: 'estado', label: t('Estado') }, { key: 'fecha', label: t('Fecha') },
    { key: 'pago', label: t('Pago del viaje'), align: 'right' },
    { key: 'ticket', label: t('Ticket'), align: 'center' },
  ]
  const render = (o, k) => {
    if (k === 'numero') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{o.numero}</span>
    if (k === 'material') return t(o.material || '—')
    if (k === 'ton') return o.pesoReal ?? o.pesoEstimado ?? '—'
    if (k === 'tipoEquipo') return o.tipoEquipo || '—'
    if (k === 'chofer') {
      if (!FINAL.includes(o.estado) && choferes.length > 0) {
        return (
          <Select className="w-full min-w-[9rem] py-1 text-xs" value={rosterIdDe(o.choferId) || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => e.target.value && asignarChofer(o, e.target.value)}>
            <option value="">{o.choferId ? t('Cambiar chofer…') : t('Asignar chofer…')}</option>
            {choferesDeTrabajo(codigoTrabajo(o)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        )
      }
      return o.choferNombre || <span className="text-slate-400">{t('Sin asignar')}</span>
    }
    if (k === 'ruta') return <span className="text-xs text-slate-500 dark:text-slate-400">{nombrePlanta(o.plantaId) || t('Planta')} → {o.direccionEntrega || '—'}</span>
    if (k === 'estado') { const e = etaOrden(o, geocercas); return <span className="inline-flex flex-col items-center gap-0.5"><Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>{e && <span className={`text-[10px] font-bold ${e.viejo ? 'text-slate-400' : 'text-blue-600 dark:text-blue-300'}`}>{etaTexto(e)}</span>}</span> }
    if (k === 'fecha') return <span className="text-xs text-slate-500">{fecha(o.creadoEn)}</span>
    if (k === 'pago') return <span className="font-semibold text-brand-navy dark:text-slate-100">{money(o.precioTransportista)}</span>
    // Ticket solo-impresión (el transportista NO genera folios ni escribe la orden):
    // disponible cuando la carga ya salió o el staff ya emitió el ticket.
    if (k === 'ticket') return (o.ticketCarga || o.ticketEntrega || ['entregada', 'liberada', 'cerrada'].includes(o.estado) || o.hitos?.carga)
      ? <span onClick={(e) => e.stopPropagation()}><ImprimirTicket orden={o} empresa={usuario?.empresa || 'Freight'} canGenerar={false} tenantId={tenantId} usuario={usuario} rol={rol} compacto /></span>
      : <span className="text-slate-300 dark:text-slate-600">—</span>
    return null
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar orden, material o chofer…')} className="w-64 pl-8" /></div>
        <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="py-2"><option value="">{t('Todos los estados')}</option>{estados.map((s) => <option key={s} value={s}>{t(ORDEN_ESTADO_LABEL[s] || s)}</option>)}</Select>
        {trabajos.length > 0 && <Select value={fTrabajo} onChange={(e) => setFTrabajo(e.target.value)} className="py-2"><option value="">{t('Todos los trabajos')}</option>{trabajos.map((c) => <option key={c} value={c}>{c}</option>)}</Select>}
        <span className="ml-auto text-xs text-slate-400">{rows.length} {t('órdenes')}</span>
      </div>
      {/* Tocar una fila abre el DETALLE de la orden (Bloque 3); el select de
          chofer y el ticket ya cortan la propagación del clic. */}
      <Tabla columns={cols} rows={rows} renderCell={render} minWidth="min-w-[860px]" emptyText={t('Ninguna orden coincide con el filtro.')} onRowClick={(o) => abrirDetalle(o)} />
    </>
  )
}

// ── Tab Mis choferes: tabla con estado en línea, viaje actual y forma de pago ──
function TabChoferes({ t, choferes, choferEnLinea, viajeActual, pagoChoferes, guardarPago, quitarPago, toggleActivoChofer, agregarChofer, trabajos = [], guardarTrabajosChofer = async () => {}, avatares = {}, tiposCamion = [], cargandoEquipos = false, califs = {} }) {
  // Promedio de estrellas del chofer (por uid, id del roster o nombre).
  const califDe = (c) => {
    const e = califs[c.uid] || califs[c.id] || califs[c.nombre]
    return e && e.n ? { prom: e.suma / e.n, n: e.n } : null
  }
  const [alta, setAlta] = useState(false)
  const [pagoEdit, setPagoEdit] = useState(null) // chofer.id en edición de pago
  const toggleTrabajo = (c, cod) => {
    const cur = c.jobs || []
    const jobs = cur.includes(cod) ? cur.filter((x) => x !== cod) : [...cur, cod]
    guardarTrabajosChofer(c.id, jobs)
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Aviso tipo="info" className="flex-1">{t('Gestiona tu flota de choferes. Define cómo le pagas a cada uno (porcentaje o valor fijo por carga); se aplica al asignarlo a una orden.')}</Aviso>
        <Boton variant="gold" onClick={() => setAlta((v) => !v)}>{alta ? <><X size={16} /> {t('Cerrar')}</> : <><UserPlus size={16} /> {t('Agregar chofer')}</>}</Boton>
      </div>

      {alta && <AltaChoferForm t={t} tiposCamion={tiposCamion} cargandoEquipos={cargandoEquipos} onCrear={async (d) => { await agregarChofer(d); setAlta(false) }} />}

      {choferes.length === 0 ? (
        <EstadoVacio titulo={t('Agrega tu primer chofer')} texto={t('Da de alta a tus choferes para asignarles cargas y definir su pago.')} mostrarBoton={false} />
      ) : (
        <div className="space-y-2">
          {choferes.map((c) => {
            const viaje = viajeActual(c)
            const online = choferEnLinea(c)
            return (
              <Card key={c.id} className="p-3.5">
                <div className="flex items-start gap-3">
                  <Avatar foto={c.foto || avatares[c.uid]} nombre={c.nombre} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-semibold text-brand-navy dark:text-slate-100">{c.nombre}</span>
                          {califDe(c) && (
                            <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-[11px] font-semibold text-amber-600" title={`${califDe(c).n} ${t('calificación(es) de clientes')}`}>
                              <Estrellas valor={Math.round(califDe(c).prom)} size={11} /> {califDe(c).prom.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                          {c.telefono && <span className="inline-flex items-center gap-1"><Phone size={10} /> {c.telefono}</span>}
                          {c.licencia && <span className="inline-flex items-center gap-1"><IdCard size={10} /> {c.licencia}</span>}
                        </div>
                      </div>
                      {/* Acciones alineadas a la derecha */}
                      <div className="ml-auto flex flex-shrink-0 items-center gap-3">
                        <button onClick={() => setPagoEdit(pagoEdit === c.id ? null : c.id)} className="text-xs font-semibold text-amber-600 hover:underline">{etiquetaPago(pagoChoferes[c.id]) ? t('Cambiar pago') : t('Definir pago')}</button>
                        <button onClick={() => toggleActivoChofer(c)} className={`text-xs font-semibold hover:underline ${c.activo === false ? 'text-emerald-600' : 'text-rose-500'}`}>{c.activo === false ? t('Activar') : t('Desactivar')}</button>
                      </div>
                    </div>
                    {/* Estado del chofer: fila de badges alineada */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge color="navy">{c.equipo || (c.equipos || [])[0] || t('Sin equipo')}</Badge>
                      <Badge color={online ? 'green' : 'slate'}>{online ? t('En línea') : t('Fuera de línea')}</Badge>
                      {viaje ? <Badge color="blue">{t('En viaje')} · {viaje.numero}</Badge> : <Badge color="slate">{t('Sin viaje')}</Badge>}
                      {etiquetaPago(pagoChoferes[c.id]) && <Badge color="gold"><DollarSign size={10} className="mr-0.5 inline" />{t(etiquetaPago(pagoChoferes[c.id]))}</Badge>}
                      {c.uid ? <Badge color="green">{t('Con acceso')}</Badge> : <Badge color="slate">{t('Sin acceso')}</Badge>}
                    </div>
                  </div>
                </div>
                {trabajos.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                    <span className="text-[11px] font-semibold uppercase text-slate-400">{t('Trabajos:')}</span>
                    {trabajos.map((cod) => {
                      const on = (c.jobs || []).includes(cod)
                      return <button key={cod} type="button" onClick={() => toggleTrabajo(c, cod)} className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${on ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}>{cod}</button>
                    })}
                    {(c.jobs || []).length === 0 && <span className="text-[11px] font-semibold text-rose-500">{t('⚠ sin trabajos: NO recibirá órdenes — asígnale al menos uno')}</span>}
                  </div>
                )}
                {pagoEdit === c.id && (
                  <PagoEditor t={t} config={pagoChoferes[c.id]} onGuardar={async (tipo, valor) => { await guardarPago(c.id, tipo, valor); setPagoEdit(null) }} onQuitar={async () => { await quitarPago(c.id); setPagoEdit(null) }} />
                )}
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function AltaChoferForm({ t, onCrear, tiposCamion = [], cargandoEquipos = false }) {
  const [f, setF] = useState({ nombre: '', email: '', password: '', telefono: '', licencia: '', equipo: '' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const crear = async () => {
    if (!f.nombre.trim()) return
    setOcupado(true); setMsg(null)
    try { await onCrear(f) }
    catch (e) { setMsg(e?.message || t('No se pudo crear el chofer.')); setOcupado(false) }
  }
  return (
    <Card className="mb-3 p-4">
      <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo chofer')}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input placeholder={t('Nombre')} value={f.nombre} onChange={set('nombre')} />
        <Input placeholder={t('Teléfono')} value={f.telefono} onChange={set('telefono')} />
        <Input placeholder={t('Licencia')} value={f.licencia} onChange={set('licencia')} />
        {/* Tipo de camión: del CATÁLOGO del sistema (bulk_equipment), con estados de
            carga y de catálogo vacío — nunca un select mudo sin opciones. */}
        {cargandoEquipos ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-400 dark:border-slate-700"><Spinner /> {t('Cargando tipos de camión…')}</div>
        ) : tiposCamion.length > 0 ? (
          <Select value={f.equipo} onChange={set('equipo')}>
            <option value="">{t('— Tipo de camión —')}</option>
            {tiposCamion.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            {t('No hay tipos de camión registrados en el sistema. Pídele al administrador que los cree en “Tipos de equipo”.')}
          </div>
        )}
        <Input type="email" placeholder={t('Correo (para su acceso a la app)')} value={f.email} onChange={set('email')} />
        <Input type="password" placeholder={t('Contraseña (opcional)')} value={f.password} onChange={set('password')} />
      </div>
      {msg && <div className="mt-2 text-xs text-rose-500">{msg}</div>}
      <p className="mt-2 text-[11px] text-slate-400">{t('Si pones correo y contraseña, se crea su cuenta para entrar a la app del chofer. Si no, queda solo en tu lista para asignarle cargas.')}</p>
      <div className="mt-3"><Boton variant="gold" onClick={crear} disabled={ocupado || !f.nombre.trim()}><UserPlus size={16} /> {ocupado ? t('Creando…') : t('Agregar chofer')}</Boton></div>
    </Card>
  )
}

function PagoEditor({ t, config, onGuardar, onQuitar }) {
  const [tipo, setTipo] = useState(config?.tipo || 'porcentaje')
  const [valor, setValor] = useState(config?.valor != null ? String(config.valor) : '')
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700/60">
      <Select className="py-1 text-xs" value={tipo} onChange={(e) => setTipo(e.target.value)}>
        <option value="porcentaje">{t('Porcentaje de la carga (%)')}</option>
        <option value="fijo">{t('Valor fijo por carga ($)')}</option>
      </Select>
      <Input type="number" step="0.01" className="w-40 py-1 text-xs" placeholder={tipo === 'porcentaje' ? t('Ej. 80 (= 80%)') : t('Ej. 120 ($ por carga)')} value={valor} onChange={(e) => setValor(e.target.value)} />
      <Boton variant="gold" onClick={() => onGuardar(tipo, valor)} disabled={!(Number(valor) > 0)} className="px-2.5 py-1 text-xs">{t('Guardar')}</Boton>
      {config && <Boton variant="ghost" onClick={onQuitar} className="px-2.5 py-1 text-xs text-rose-500">{t('Quitar')}</Boton>}
    </div>
  )
}

// ── Tab Equipos: flota de camiones del carrier (carrierConfig.flota) ──────────
function TabEquipos({ t, flota, choferes, carrier, agregarEquipo, editarEquipo, eliminarEquipo }) {
  const [alta, setAlta] = useState(false)
  const tiposBase = (carrier?.equipos || [])
  const nombreChofer = (id) => choferes.find((c) => c.id === id)?.nombre || ''

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <div className="text-sm text-slate-500 dark:text-slate-400">{t('Tus camiones y su estado. El tipo debe estar entre los equipos aprobados por el administrador.')}</div>
        <Boton variant="gold" onClick={() => setAlta((v) => !v)} className="ml-auto">{alta ? <><X size={16} /> {t('Cerrar')}</> : <><Plus size={16} /> {t('Agregar equipo')}</>}</Boton>
      </div>
      {alta && <AltaEquipoForm t={t} tipos={tiposBase} choferes={choferes} onCrear={async (v) => { await agregarEquipo(v); setAlta(false) }} />}

      {flota.length === 0 ? (
        <EstadoVacio titulo={t('Agrega tu primer equipo')} texto={t('Registra tus camiones (tipo, placa y estado) para llevar el control de tu flota.')} mostrarBoton={false} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flota.map((v) => {
            const est = FLOTA_ESTADO[v.estado] || FLOTA_ESTADO.disponible
            return (
              <Card key={v.id} className="p-3.5">
                <div className="flex items-start gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-navy text-brand-gold"><Truck size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-brand-navy dark:text-slate-100">{v.tipo || t('Camión')}</div>
                    <div className="font-mono text-xs text-slate-400">{v.placa || t('sin placa')}</div>
                  </div>
                  <button onClick={() => eliminarEquipo(v.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge color={est.c}>{t(est.l)}</Badge>
                  {v.choferId && <Badge color="navy">{nombreChofer(v.choferId)}</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Select className="py-1 text-xs" value={v.estado || 'disponible'} onChange={(e) => editarEquipo(v.id, { estado: e.target.value })}>
                    {Object.entries(FLOTA_ESTADO).map(([k, o]) => <option key={k} value={k}>{t(o.l)}</option>)}
                  </Select>
                  <Select className="py-1 text-xs" value={v.choferId || ''} onChange={(e) => editarEquipo(v.id, { choferId: e.target.value || null })}>
                    <option value="">{t('Sin chofer')}</option>
                    {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </Select>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function AltaEquipoForm({ t, tipos, onCrear }) {
  const [f, setF] = useState({ tipo: tipos[0] || '', placa: '', estado: 'disponible' })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  return (
    <Card className="mb-3 p-4">
      <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo equipo')}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {tipos.length
          ? <Select value={f.tipo} onChange={set('tipo')}>{tipos.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
          : <Input placeholder={t('Tipo (ej. Dump Truck)')} value={f.tipo} onChange={set('tipo')} />}
        <Input placeholder={t('Placa / identificador')} value={f.placa} onChange={set('placa')} />
        <Select value={f.estado} onChange={set('estado')}>{Object.entries(FLOTA_ESTADO).map(([k, o]) => <option key={k} value={k}>{t(o.l)}</option>)}</Select>
      </div>
      <div className="mt-3"><Boton variant="gold" onClick={() => f.tipo && onCrear(f)} disabled={!f.tipo}><Plus size={16} /> {t('Agregar equipo')}</Boton></div>
    </Card>
  )
}

// ── Tab Facturación: avisos de pago del transportista (bulk_carrierStatements) ──
function TabFacturacion({ t, statements, cuenta }) {
  // Buscador: solo reduce el listado de SUS avisos (ya aislados por carrierId).
  const [busq, setBusq] = useState(FILTRO_FACTURAS_VACIO)
  const [detalle, setDetalle] = useState(null)
  const [verDoc, setVerDoc] = useState(null)
  const filtrados = filtrarFacturas(statements, busq)
  // Resumen sobre el conjunto FILTRADO (por fecha de emisión y demás criterios).
  let kTotal = 0, kPag = 0
  for (const s of filtrados) { const v = Number(s.total) || 0; kTotal += v; if (s.estado === 'pagado') kPag += v }
  const periodoTxt = (busq.desde || busq.hasta) ? `${busq.desde || '…'} → ${busq.hasta || t('hoy')}` : (hayFiltroActivo(busq) ? t('resultados del filtro') : t('histórico total'))
  const ordenados = filtrados.slice().sort((a, b) => (b.ts || b.numero || '').localeCompare(a.ts || a.numero || ''))
  return (
    <>
      <div className="mb-4"><DashboardFacturacion rol="carrier" avisos={statements} soloResumen t={t} /></div>
      <div className="mb-2 flex items-center gap-2"><FileText size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Avisos de pago')}</h3></div>
      {(statements || []).length > 0 && <BuscadorFacturas f={busq} setF={setBusq} montoLabel={t('Monto de pago…')} />}
      {(statements || []).length === 0
        ? <EstadoVacio titulo={t('Aún no tienes avisos de pago')} texto={t('Cuando el administrador emita tu facturación/aviso de pago, aparecerá aquí con su detalle.')} mostrarBoton={false} />
        : ordenados.length === 0
          ? <p className="text-sm text-slate-400">{t('No hay avisos de pago que coincidan con los criterios de búsqueda.')}</p>
          : (
            <div className="space-y-2.5">
              {ordenados.map((s) => <DocCard key={s.id} r={s} tipo="carrier" t={t} onVer={() => setDetalle(s)} />)}
            </div>
          )}
      {detalle && (
        <DocDrawer r={detalle} tipo="carrier" empresa="Freight" persona={null} t={t} onClose={() => setDetalle(null)}
          pie={<BotonDoc icon={FileText} primary onClick={() => { setVerDoc(detalle); setDetalle(null) }}>{t('Ver documento')}</BotonDoc>} />
      )}
      {verDoc && <DocumentoFactura doc={verDoc} tipo="carrier" empresa="Freight" jobsMap={{}} overlay onBack={() => setVerDoc(null)} />}
    </>
  )
}

// ── Tab Estado de cuenta: resumen + detalle por viaje (usa el cálculo existente) ─
function TabCuenta({ t, cuenta, stats, statements }) {
  const { usuario } = useBulkAuth()
  const carrierId = usuario?.carrierId || '__none__'
  const [fastPay, setFastPay] = useState(false)
  const [rango, setRango] = useState(RANGO_VACIO) // filtro por fechas (finanzas)
  // Historial PERMANENTE de retiros Fast Pay del carrier (solo lee los suyos).
  const { datos: retirosFP } = useColeccion('retiros', [where('carrierId', '==', carrierId)])
  const retiradoFP = (retirosFP || []).reduce((a, r) => a + (['pagado', 'procesando'].includes(r.estado || 'pagado') ? Number(r.montoBase) || 0 : 0), 0)
  const entregadasF = stats.entregadas.filter((o) => enRangoFechas(o.hitos?.entrega || o.creadoEn, rango))
  const resumenRango = {
    viajes: entregadasF.length,
    ganado: entregadasF.reduce((a, o) => a + (Number(o.precioTransportista) || 0), 0),
    util: entregadasF.reduce((a, o) => a + ((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0)), 0),
  }
  const rows = entregadasF
    .slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
    .map((o) => ({ ...o, _key: o.id }))
  const cols = [
    { key: 'numero', label: t('Viaje') }, { key: 'material', label: t('Material') },
    { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'tarifa', label: t('Tarifa'), align: 'right' },
    { key: 'pagoChofer', label: t('Pago chofer'), align: 'right' }, { key: 'util', label: t('Tu utilidad'), align: 'right' },
    { key: 'fecha', label: t('Fecha') },
  ]
  const render = (o, k) => {
    if (k === 'numero') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{o.numero}</span>
    if (k === 'material') return t(o.material || '—')
    if (k === 'ton') return o.pesoReal ?? o.pesoEstimado ?? '—'
    if (k === 'tarifa') return money(o.precioTransportista)
    if (k === 'pagoChofer') return <span className="text-slate-500">{money(o.pagoChofer)}</span>
    if (k === 'util') return <span className="font-semibold text-emerald-600 dark:text-emerald-400">{money((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0))}</span>
    if (k === 'fecha') return <span className="text-xs text-slate-500">{fecha(o.hitos?.entrega || o.creadoEn)}</span>
    return null
  }
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KPI label={t('Total ganado (periodo)')} value={money(cuenta.ganado)} icon={Wallet} accent="navy" />
        <KPI label={t('Pagado')} value={money(cuenta.pagado)} icon={DollarSign} accent="green" />
        <KPI label={t('Pendiente')} value={money(cuenta.pendiente)} icon={ClipboardList} accent="gold" />
      </div>
      <FiltroFechas rango={rango} onChange={setRango} className="mb-3" />
      {(rango.desde || rango.hasta) && (
        <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-300">
          {t('En el rango')}: {resumenRango.viajes} {t('viaje(s)')} · {t('tarifa')} {money(resumenRango.ganado)} · {t('tu utilidad')} {money(resumenRango.util)}
        </p>
      )}

      {/* Fast Pay del CARRIER: adelanto instantáneo del balance elegible. */}
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><DollarSign size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-brand-navy dark:text-slate-100">Fast Pay</div>
            <div className="text-xs text-slate-400">{t('Adelanta tu balance disponible al instante (con comisión). El saldo exacto y tu límite se calculan al abrir.')}{retiradoFP > 0 ? ` · ${t('Ya adelantado')}: ${money(retiradoFP)}` : ''}</div>
          </div>
          <Boton variant="gold" onClick={() => setFastPay(true)} className="px-4">{t('Fast Pay · Cobrar')}</Boton>
        </div>
        {(retirosFP || []).length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Historial de retiros')}</div>
            {(retirosFP || []).slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs font-bold text-brand-navy dark:text-slate-100">{r.numero || 'FP'}</span>
                <span className="text-xs text-slate-400">{String(r.ts || '').slice(0, 16).replace('T', ' ')}</span>
                <Badge color={r.estado === 'pagado' ? 'green' : r.estado === 'revertido' ? 'slate' : r.estado === 'error' ? 'red' : 'gold'}>{t(r.estado || 'pagado')}</Badge>
                <span className={`ml-auto font-bold tabular-nums ${r.estado === 'revertido' ? 'text-slate-400 line-through' : 'text-brand-navy dark:text-slate-100'}`}>−{money(r.montoBase)}</span>
                {r.balanceDespues != null && <span className="text-[11px] tabular-nums text-slate-400">{t('saldo')}: {money(r.balanceDespues)}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
      <FastPayModal abierto={fastPay} onClose={() => setFastPay(false)} nombre={usuario?.nombre} />
      {statements && statements.length > 0 && (
        <Card className="mb-4 p-4">
          <h3 className="m-0 mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Avisos de pago')}</h3>
          <div className="flex flex-wrap gap-2">
            {statements.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700/60">
                <div className="font-mono font-semibold text-brand-navy dark:text-slate-100">{s.numero}</div>
                <div className="text-slate-500">{money(s.total)} · <Badge color={s.estado === 'pagado' ? 'green' : 'gold'}>{t(s.estado === 'pagado' ? 'Pagado' : 'Pendiente')}</Badge></div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="mb-2 flex items-center gap-2"><MapPin size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Detalle por viaje')}</h3></div>
      {rows.length === 0
        ? <EstadoVacio titulo={t('Aún no hay viajes cerrados')} texto={t('Cuando completes viajes, su detalle y tu utilidad aparecerán aquí.')} mostrarBoton={false} />
        : <Tabla columns={cols} rows={rows} renderCell={render} minWidth="min-w-[720px]" />}
    </>
  )
}

// ── Pago a choferes: herramienta del transportista ──────────────────────────
// Desglose por chofer de sus viajes finalizados (peso, material, pago), lo que
// retiró por Fast Pay, y el NETO a pagarle (ganado − Fast Pay) para no pagar
// doble. El pago del viaje ya viene ajustado al peso real del ticket (OCR).
function TabPagoChoferes({ t, choferes = [], ordenes = [], retiros = [], avatares = {} }) {
  const [abierto, setAbierto] = useState(null) // uid del chofer expandido
  const [rango, setRango] = useState(RANGO_VACIO) // filtro por fechas (pagos)
  const FINALES_PAGO = ['entregada', 'liberada', 'cerrada']
  const RETIRO_ACTIVO = ['procesando', 'pagado']
  const n = (v) => Number(v) || 0

  const filas = (choferes || []).filter((c) => c.uid).map((c) => {
    const viajes = (ordenes || [])
      .filter((o) => o.choferId === c.uid && FINALES_PAGO.includes(o.estado) && enRangoFechas(o.hitos?.entrega || o.creadoEn, rango))
      .sort((a, b) => String(b.hitos?.entrega || '').localeCompare(String(a.hitos?.entrega || '')))
    const ganado = viajes.reduce((a, o) => a + n(o.pagoChofer), 0)
    const fastPay = (retiros || [])
      .filter((r) => r.choferId === c.uid && r.tipo !== 'carrier' && RETIRO_ACTIVO.includes(r.estado || 'pagado') && enRangoFechas(r.ts, rango))
      .reduce((a, r) => a + n(r.montoBase), 0)
    return { chofer: c, viajes, ganado, fastPay, neto: Math.round((ganado - fastPay) * 100) / 100 }
  }).sort((a, b) => b.neto - a.neto)

  const totNeto = filas.reduce((a, f) => a + f.neto, 0)

  return (
    <>
      <Aviso tipo="info" className="mb-3">
        {t('Cuánto debes pagarle a cada chofer: sus viajes finalizados (con el peso real del ticket) menos lo que ya retiró por Fast Pay. Paga solo el NETO.')}
      </Aviso>
      <FiltroFechas rango={rango} onChange={setRango} className="mb-3" />
      <Card className="mb-3 flex items-center justify-between p-4">
        <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Total neto por pagar (todos los choferes)')}</span>
        <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{money(Math.max(0, totNeto))}</span>
      </Card>
      {filas.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-400">{t('Aún no hay choferes con cuenta activa.')}</Card>
      ) : filas.map(({ chofer: c, viajes, ganado, fastPay, neto }) => (
        <Card key={c.uid} className="mb-2 p-0">
          <button onClick={() => setAbierto(abierto === c.uid ? null : c.uid)} className="flex w-full items-center gap-3 p-3.5 text-left">
            <Avatar foto={c.foto || avatares[c.uid]} nombre={c.nombre} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-brand-navy dark:text-slate-100">{c.nombre}</span>
              <span className="block text-[11px] text-slate-400">{viajes.length} {t('viaje(s) finalizados')}</span>
            </span>
            <span className="text-right">
              <span className={`block text-base font-black ${neto < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(neto)}</span>
              <span className="block text-[10px] font-bold uppercase text-slate-400">{t('neto a pagar')}</span>
            </span>
          </button>
          {abierto === c.uid && (
            <div className="border-t border-slate-100 p-3.5 dark:border-slate-800">
              <div className="mb-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800"><div className="font-black text-brand-navy dark:text-slate-100">{money(ganado)}</div><div className="text-[10px] uppercase text-slate-400">{t('Ganado')}</div></div>
                <div className="rounded-xl bg-amber-500/10 p-2"><div className="font-black text-amber-600 dark:text-amber-400">− {money(fastPay)}</div><div className="text-[10px] uppercase text-slate-400">Fast Pay</div></div>
                <div className="rounded-xl bg-emerald-500/10 p-2"><div className={`font-black ${neto < 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(neto)}</div><div className="text-[10px] uppercase text-slate-400">{t('Neto')}</div></div>
              </div>
              {neto < 0 && <p className="mb-2 text-[11px] font-semibold text-rose-500">{t('Retiró por Fast Pay más de lo ganado hasta hoy: no le pagues; el excedente se descuenta de sus próximos viajes.')}</p>}
              {viajes.length === 0 ? <p className="text-xs text-slate-400">{t('Sin viajes finalizados todavía.')}</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-[10px] uppercase text-slate-400"><th className="py-1 pr-2">{t('Viaje')}</th><th className="py-1 pr-2">{t('Fecha')}</th><th className="py-1 pr-2">{t('Material')}</th><th className="py-1 pr-2 text-right">{t('Ton')}</th><th className="py-1 text-right">{t('Pago')}</th></tr></thead>
                    <tbody>
                      {viajes.map((o) => (
                        <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-1.5 pr-2 font-mono font-bold text-brand-navy dark:text-slate-200">{o.numero}</td>
                          <td className="py-1.5 pr-2 text-slate-500">{o.hitos?.entrega ? new Date(o.hitos.entrega).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—'}</td>
                          <td className="py-1.5 pr-2 text-slate-500">{t(o.material || '—')}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{o.pesoReal ?? o.pesoEstimado}</td>
                          <td className="py-1.5 text-right font-bold tabular-nums text-brand-navy dark:text-slate-100">{money(o.pagoChofer)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {fastPay > 0 && (
                <div className="mt-2 rounded-xl bg-amber-500/5 p-2">
                  <div className="mb-1 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">{t('Retiros Fast Pay descontados')}</div>
                  {(retiros || []).filter((r) => r.choferId === c.uid && r.tipo !== 'carrier' && RETIRO_ACTIVO.includes(r.estado || 'pagado') && enRangoFechas(r.ts, rango)).map((r) => (
                    <div key={r.numero || r.opId} className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{r.numero || 'FP'} · {String(r.ts || '').slice(0, 10)}</span>
                      <span className="font-bold">− {money(r.montoBase)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
      <p className="mt-2 text-[11px] text-slate-400">{t('El pago de cada viaje ya está ajustado al peso real del ticket de báscula. Los retiros Fast Pay en proceso también se descuentan (ese dinero ya va en camino al chofer).')}</p>
    </>
  )
}

// ── DETALLE DE ORDEN 2026 (Bloque 3): esqueleto compartido + contenido del rol ─
// El transportista ve el viaje (planta → entrega), el estado y el pago, al chofer
// asignado y las evidencias reales (foto de ticket/POD). La ÚNICA acción dorada:
// asignar chofer (si no tiene) o transferir (si tiene y el viaje sigue activo).
function DetalleOrdenTransportista({ t, orden: o, choferes, nombrePlanta, avatares, choferEnLinea, noLeidos, onVolver, onChat, onAsignar }) {
  const [verChofer, setVerChofer] = useState(false) // atajo Chofer → expande sus datos
  const [verDocs, setVerDocs] = useState(false)     // atajo Documentos → expande evidencias
  const hora = (ts) => (ts ? new Date(tsMillis(ts) || ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null)
  // Origen "hecho" = ya cargó (hito de carga/salida o un estado posterior).
  const cargo = !!(o.hitos?.carga || o.hitos?.salidaPlanta) || [E.EN_RUTA, E.EN_DESTINO, ...ENTREGADAS].includes(o.estado)
  const entregado = ENTREGADAS.includes(o.estado)
  const completada = FINAL.includes(o.estado)
  const chofer = choferes.find((c) => c.uid === o.choferId || c.id === o.choferId) || null
  const fichaChofer = [chofer?.telefono, chofer?.licencia, chofer?.equipo || (chofer?.equipos || [])[0]].filter(Boolean).join(' · ')
  // Documentos REALES de la orden (evidencias que suben el chofer/la báscula).
  const docs = [
    o.ticket?.foto ? { k: 'ticket', src: o.ticket.foto, label: t('Ticket') } : null,
    o.pod?.foto ? { k: 'pod', src: o.pod.foto, label: t('Entrega') } : null,
    o.pod?.firma ? { k: 'firma', src: o.pod.firma, label: t('Firma') } : null,
  ].filter(Boolean)
  return (
    <DetalleOrdenApp
      numero={o.numero}
      material={t(o.material || 'material s/e')}
      cliente={o.clienteNombre || ''}
      toneladas={o.pesoReal ?? o.pesoEstimado}
      origen={{ nombre: nombrePlanta(o.plantaId) || t('Planta'), hecho: cargo, estado: cargo ? t('Cargada') : undefined, hora: hora(o.hitos?.salidaPlanta || o.hitos?.carga) }}
      destino={{ nombre: o.direccionEntrega || '—', hecho: entregado, estado: entregado ? t('Entregada') : undefined, hora: hora(o.hitos?.entrega || o.hitos?.liberacion) }}
      atajos={[
        { icon: MessageSquare, label: t('Chat'), onClick: onChat, badge: noLeidos },
        // Con chofer asignado muestra sus datos abajo; sin chofer, directo a asignar.
        { icon: User, label: t('Chofer'), onClick: () => ((o.choferId || o.choferNombre) ? setVerChofer((v) => !v) : onAsignar()) },
        { icon: FileText, label: t('Documentos'), onClick: () => setVerDocs((v) => !v) },
      ]}
      ticket={o.ticket ? { numero: o.ticket.numero, peso: o.ticket.peso } : null}
      accion={completada ? null : { label: o.choferId ? t('Transferir') : t('Asignar chofer'), icon: UserPlus, onClick: onAsignar }}
      onVolver={onVolver} onChat={onChat} chatBadge={noLeidos}
    >
      {/* Estado actual + pago del viaje (los mismos números de la cola de hoy). */}
      <div className="rounded-card bg-white p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-mp-ink-2">{t('Estado')}</span>
          <StatusPill color={PILL_COLOR[ORDEN_ESTADO_COLOR[o.estado]] || 'var(--mp-gold)'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>
        </div>
        {o.precioTransportista != null && (
          <div className="mt-2 space-y-1 border-t border-mp-line pt-2 text-[13px]">
            <div className="flex items-baseline justify-between gap-2"><span className="text-mp-ink-2">{t('Pago del viaje')}</span><span className="font-medium text-mp-ink">{money(o.precioTransportista)}</span></div>
            {o.pagoChofer != null && <div className="flex items-baseline justify-between gap-2"><span className="text-mp-ink-2">{t('Pago chofer')}</span><span className="text-mp-ink">{money(o.pagoChofer)}</span></div>}
            <div className="flex items-baseline justify-between gap-2"><span className="text-mp-ink-2">{t('Tu utilidad')}</span><span className="font-medium" style={{ color: 'var(--mp-green)' }}>{money((Number(o.precioTransportista) || 0) - (Number(o.pagoChofer) || 0))}</span></div>
          </div>
        )}
      </div>

      {/* Datos del chofer asignado (los abre el atajo Chofer). */}
      {verChofer && (o.choferId || o.choferNombre) && (
        <div className="rounded-card bg-white p-4 shadow-card">
          <div className="mb-2 text-[12px] text-mp-ink-2">{t('Datos del chofer')}</div>
          <div className="flex items-center gap-3">
            <Avatar foto={chofer?.foto || avatares[chofer?.uid]} nombre={o.choferNombre || chofer?.nombre} size={40} redondo />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-medium text-mp-ink">{o.choferNombre || chofer?.nombre}</span>
                {chofer && choferEnLinea(chofer) && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill" style={{ background: 'var(--mp-green)' }} title={t('en línea')} />}
              </div>
              {fichaChofer && <div className="truncate text-[12px] text-mp-ink-2">{fichaChofer}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Evidencias reales de la orden (las abre el atajo Documentos). */}
      {verDocs && (
        <div className="rounded-card bg-white p-4 shadow-card">
          <div className="mb-2 text-[12px] text-mp-ink-2">{t('Documentos')}</div>
          {docs.length === 0
            ? <div className="text-[13px] text-mp-ink-2">{t('Sin documentos de esta orden todavía.')}</div>
            : (
              <div className="flex flex-wrap gap-2">
                {docs.map((d) => (
                  <a key={d.k} href={d.src} target="_blank" rel="noreferrer" className="block">
                    <img src={d.src} alt={d.label} className="h-20 w-24 rounded-[10px] border border-mp-line bg-white object-cover" />
                    <span className="mt-0.5 block text-center text-[11px] text-mp-ink-2">{d.label}</span>
                  </a>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Recorrido GPS real (plegado) + calificación del cliente si existe. */}
      <RecorridoOrden orden={o} />
      <CalificacionViaje orden={o} />

      {/* Trayectoria: SOLO los hitos ya registrados (los pendientes no se pintan). */}
      {ORDEN_HITOS.some((h) => o.hitos?.[h.key]) && (
        <div className="rounded-card bg-white p-4 shadow-card">
          <div className="mb-2 text-[12px] text-mp-ink-2">{t('Trayectoria')}</div>
          <div className="space-y-1.5">
            {ORDEN_HITOS.filter((h) => o.hitos?.[h.key]).map((h) => (
              <div key={h.key} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-mp-ink">{t(h.label)}</span>
                <span className="flex-shrink-0 text-[12px] text-mp-ink-2">{hora(o.hitos[h.key])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </DetalleOrdenApp>
  )
}

// ── Sheet de ASIGNAR/TRANSFERIR chofer (Bloque 3) ────────────────────────────
// Formato táctil del MISMO flujo del select de la tabla de órdenes: candidatos
// = choferes del trabajo (o todos), marca quién está en línea y quién la tiene
// ahora; tocar uno llama asignarChofer (pago según la config del transportista).
function SheetAsignarChofer({ t, orden, choferes = [], rosterIdDe, choferEnLinea, avatares = {}, onAsignar, onClose }) {
  const [ocupado, setOcupado] = useState(false)
  const actualId = rosterIdDe(orden.choferId)
  const elegir = async (c) => {
    if (orden.choferId && c.id === actualId) { window.alert(t('Esta orden ya está con ese chofer.')); return }
    setOcupado(true)
    try { await onAsignar(c.id) } catch (e) { window.alert(t('No se pudo asignar: ') + (e?.message || '')); setOcupado(false) }
  }
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50" onClick={ocupado ? undefined : onClose}>
      <div className="mp-app flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-card bg-mp-cream p-4 pb-[max(env(safe-area-inset-bottom),16px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-pill bg-white text-mp-navy shadow-card"><UserPlus size={18} strokeWidth={1.75} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-mp-ink">{orden.choferId ? t('Transferir') : t('Asignar chofer')} · {orden.numero}</div>
            <div className="truncate text-[12px] text-mp-ink-2">{t('Pide equipo:')} {orden.tipoEquipo || '—'} · {t('el chofer recibe la oferta y debe aceptarla')}</div>
          </div>
          <IconButton icon={X} label={t('Cerrar')} onClick={onClose} />
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {choferes.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-mp-ink-2">{t('Da de alta a tus choferes para asignarles cargas y definir su pago.')}</div>
          ) : choferes.map((c) => {
            const actual = !!orden.choferId && c.id === actualId
            return (
              <button key={c.id} type="button" onClick={() => elegir(c)} disabled={ocupado || actual}
                className={`flex w-full items-center gap-2.5 rounded-row bg-white p-3 text-left shadow-card transition active:scale-[0.99] disabled:opacity-60 ${actual ? 'ring-1 ring-mp-green' : ''}`}>
                <Avatar foto={c.foto || avatares[c.uid]} nombre={c.nombre} size={36} redondo />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium text-mp-ink">{c.nombre}</span>
                    {choferEnLinea(c) && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill" style={{ background: 'var(--mp-green)' }} title={t('en línea')} />}
                    {actual && <StatusPill color="var(--mp-green)">{t('actual')}</StatusPill>}
                  </span>
                  <span className="block truncate text-[12px] text-mp-ink-2">{c.equipo || (c.equipos || [])[0] || t('sin equipo')}{c.telefono ? ` · ${c.telefono}` : ''}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
