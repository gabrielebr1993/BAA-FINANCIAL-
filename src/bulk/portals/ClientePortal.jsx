import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, ClipboardList, FileText, PenLine, LayoutDashboard, Layers, MessageSquare, Navigation, Home, Package, Plus, Grid2x2, LogOut, KeyRound, Printer, Repeat, Share2, X, Trash2, Pause, Play, Pencil } from 'lucide-react'
import CampanaNotificaciones from '../components/CampanaNotificaciones'
import { notificacionesCliente } from '../domain/notificaciones'
import { useBulkAuth } from '../BulkAuthContext'
import RepararAcceso from '../components/RepararAcceso'
import PanelConversaciones from '../components/PanelConversaciones'
import BotonReunion from '../components/BotonReunion'
import MapaLeaflet from '../components/MapaLeaflet'
import { suscribirTrack } from '../data/tracking'
import { etaOrden, etaTexto } from '../domain/eta'
import AvisosMensajes from '../components/AvisosMensajes'
import IndicadorConexion from '../components/IndicadorConexion'
import Avatar from '../components/Avatar'
import CambiarClave from '../components/CambiarClave'
import { useFotoUsuario } from '../data/useCodigoUsuario'
import { onAbrirConversacion } from '../data/notifsMensajes'
import { DocCard, DocDrawer, BotonDoc } from '../components/FacturaDoc'
import ImprimirTicket from '../components/ImprimirTicket'
import { DocumentoFactura } from '../pages/FacturaPagina'
import DashboardFacturacion from '../components/DashboardFacturacion'
import GruposModal from '../components/GruposModal'
import { usePrivados } from '../components/usePrivados'
import { useGrupos } from '../data/useGrupos'
import { menuGrupoConv } from '../data/grupos'
import { convClienteOrden, resumenPorConversacion } from '../data/chat'
import { tsMillis } from '../data/chatKeys'
import { useColeccion } from '../data/useColeccion'
import { where, guardar, crear, eliminar } from '../data/repo'
import { authBulk } from '../firebaseBulk'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR } from '../domain/constants'
import { generarFacturaPDF } from '../data/facturaPDF'
import FirmaPad from '../components/FirmaPad'
import BuscadorFacturas from '../components/BuscadorFacturas'
import { filtrarFacturas, hayFiltroActivo, FILTRO_FACTURAS_VACIO } from '../domain/filtroFacturas'
import { estadoDocumento } from '../domain/facturacion'
import { Card, KPI, Badge, Boton, Cargando, EstadoVacio, Tabla } from '../../components/ui'
// Detalle de pedido 2026 (Bloque 3): esqueleto compartido por los 5 roles.
import DetalleOrdenApp from '../components/DetalleOrdenApp'
import CalificacionViaje from '../components/CalificacionViaje'
import PortalEscritorio from '../components/PortalEscritorio'
// Kit del REDISEÑO 2026 (Bloque 1): la home y la carcasa usan este lenguaje.
import { IconButton, PrimaryButton, SecondaryButton, Card as CardApp, FeatureCard, StatCard, ListRow, StatusPill, FloatingTabBar } from '../ui'
import { money } from '../../utils/format'
import { useLang, LangToggle } from '../../i18n'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const FINAL = [...ENTREGADAS, E.CANCELADA]
const n = (v) => Number(v) || 0
// Código de proyecto derivado del número de orden (ej. "ABC-0012" → "ABC"). El
// cliente no puede leer bulk_jobs (reglas), así que agrupamos por sus propias órdenes.
const codigoProyecto = (o) => o.jobId || String(o.numero || '').split('-').slice(0, -1).join('-') || '—'
const fechaEntrega = (o) => o?.hitos?.entrega ? new Date(o.hitos.entrega) : null
// Avance del pedido EN CAMINO (home 2026): % de la barra dorada por estado.
const PROGRESO_CAMINO = { [E.ACEPTADA]: 20, [E.EN_PLANTA]: 40, [E.CARGANDO]: 55, [E.EN_RUTA]: 75, [E.EN_DESTINO]: 90 }
// ── Detalle de pedido (Bloque 3) · helpers del cliente ──────────────────────
// Estados en los que la carga YA salió de la planta (punto de origen "hecho").
const YA_CARGO = [E.EN_RUTA, E.EN_DESTINO, ...ENTREGADAS]
// Color CSS del StatusPill según el color de badge del estado.
const PILL_COLOR = { green: 'var(--mp-green)', gold: 'var(--mp-gold)', red: 'var(--mp-red)', blue: 'var(--mp-blue)', navy: 'var(--mp-navy)', slate: 'var(--mp-ink-2)' }
const fHora = (v) => { const ms = tsMillis(v) || Date.parse(v); return Number.isFinite(ms) ? new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '' }
const fFecha = (v) => { const ms = tsMillis(v) || Date.parse(v); return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '' }
// ¿El cliente ya puede imprimir/ver los tickets del pedido? (misma regla que la tabla)
const ticketDisponible = (o) => !!(o.ticketCarga || o.ticketEntrega || ENTREGADAS.includes(o.estado) || o.hitos?.carga)
// ── Pedidos del cliente en 3 toques (orden "Negocio y roles", Bloque 2) ─────
// Fecha local YYYY-MM-DD (+n días), mismo formato que el backend (hoyMX).
const ymdLocal = (masDias = 0) => new Date(Date.now() + masDias * 86400000).toLocaleDateString('en-CA')
// Texto corto de los días de una regla recurrente (0=domingo).
const DIAS_TXT = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const diasTexto = (dias = []) => {
  const s = new Set(dias)
  const lv = [1, 2, 3, 4, 5].every((d) => s.has(d))
  return [
    ...(lv ? ['L–V'] : [1, 2, 3, 4, 5].filter((d) => s.has(d)).map((d) => DIAS_TXT[d])),
    ...(s.has(6) ? ['S'] : []), ...(s.has(0) ? ['D'] : []),
  ].join(' · ') || '—'
}

export default function ClientePortal() {
  const { t } = useLang()
  const { usuario, tenantId, cerrarSesion } = useBulkAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('inicio')
  const [verClave, setVerClave] = useState(false)
  const miFotoHome = useFotoUsuario(usuario?.id) // avatar del header 2026
  const clienteId = usuario?.clienteId || '__none__'
  const { datos: _ordenesRaw, cargando } = useColeccion('orders', [where('clienteId', '==', clienteId)])
  // Inc.2 Fase 2: el precio del cliente se lee de su doc de pago por audiencia
  // (fallback al campo de la orden para las órdenes anteriores a la migración).
  const { datos: pagosCliente } = useColeccion('orderPay_cliente', [where('clienteId', '==', clienteId)])
  const ordenes = useMemo(() => {
    const m = {}; for (const p of pagosCliente || []) m[p.orderId || p.id] = p.precioCliente
    return (_ordenesRaw || []).map((o) => (m[o.id] != null ? { ...o, precioCliente: m[o.id] } : o))
  }, [_ordenesRaw, pagosCliente])
  const { datos: facturas } = useColeccion('invoices', [where('clienteId', '==', clienteId)])
  // Pedidos en 3 toques (Negocio B2): solicitudes propias aún sin convertir y
  // reglas recurrentes del cliente. Las órdenes reales las crea el backend.
  const { datos: pedidosCli } = useColeccion('pedidos', [where('clienteId', '==', clienteId)])
  const { datos: reglasRec } = useColeccion('recurringOrders', [where('clienteId', '==', clienteId)])
  // Hoja "Nuevo pedido": {} vacía, { prefill } al repetir, { regla } al editar recurrente.
  const [hoja, setHoja] = useState(null)
  const [aviso, setAviso] = useState('') // confirmación breve tras crear/copiar
  const avisar = (msg) => { setAviso(msg); setTimeout(() => setAviso(''), 2500) }
  // Link PÚBLICO de seguimiento (encargado de obra): lo emite /api/bulk-track.
  const compartirSeguimiento = async (ordenId) => {
    try {
      const tok = await authBulk.currentUser.getIdToken()
      const r = await fetch('/api/bulk-track', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ accion: 'compartir', ordenId }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) throw new Error(d.error || t('Error de conexión.'))
      if (navigator.share) await navigator.share({ url: d.url }).catch(() => {})
      else { await navigator.clipboard.writeText(d.url); avisar(t('Link copiado')) }
    } catch (e) { window.alert(t('No se pudo generar el link: ') + (e?.message || '')) }
  }
  // ¿El admin permite al cliente ver los chats por viaje? (señal bulk_signals/chat)
  const { datos: signalsChat } = useColeccion('signals')
  const veChatsViaje = ((signalsChat || []).find((x) => x.id === 'chat') || {}).clienteVeOrdenes !== false
  // Mapa en vivo del cliente: geocercas + trayectoria de la orden elegida.
  const { datos: geocercasCli } = useColeccion('geofences')
  const { datos: plantasCli } = useColeccion('plants')
  const [ordenMapa, setOrdenMapa] = useState('')
  const [trackCli, setTrackCli] = useState([])
  useEffect(() => {
    if (!ordenMapa || !tenantId) { setTrackCli([]); return }
    return suscribirTrack(tenantId, ordenMapa, setTrackCli)
  }, [tenantId, ordenMapa])
  // ── Detalle de pedido apilado (Bloque 3): id de la orden abierta ──────────
  const [detalle, setDetalle] = useState(null)
  const refEstadoDet = useRef(null) // tarjeta "Estado actual" (atajo Seguimiento en pedidos cerrados)
  const refDocsDet = useRef(null) // tarjeta "Documentos del pedido" (atajo Documentos)
  const [firmando, setFirmando] = useState(null) // factura en firma
  const [detalleFac, setDetalleFac] = useState(null) // factura abierta en el drawer de detalle
  const [verDocFac, setVerDocFac] = useState(null) // factura abierta como documento imprimible
  const [firma, setFirma] = useState(null)
  // Buscador: solo reduce el listado de SUS facturas (ya aisladas por la consulta).
  const [busqFac, setBusqFac] = useState(FILTRO_FACTURAS_VACIO)
  const facturasFiltradas = useMemo(() => filtrarFacturas(facturas, busqFac), [facturas, busqFac])
  // Resumen de facturas (responde al filtro de fecha del buscador).
  const kpisFac = useMemo(() => {
    let total = 0, pagado = 0, vencido = 0
    for (const r of facturasFiltradas) {
      if (r.estado === 'anulada') continue // las facturas anuladas no cuentan
      const v = Number(r.total) || 0; total += v
      if (r.estado === 'pagada') pagado += v
      else if (estadoDocumento(r.vence).estado === 'vencido') vencido += v
    }
    return { total, pagado, porPagar: total - pagado, vencido, n: facturasFiltradas.length }
  }, [facturasFiltradas])
  const periodoFacTxt = (busqFac.desde || busqFac.hasta) ? `${busqFac.desde || '…'} → ${busqFac.hasta || t('hoy')}` : (hayFiltroActivo(busqFac) ? t('resultados del filtro') : t('histórico total'))

  const stats = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const ton = entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)
    const gasto = entregadas.reduce((a, o) => a + n(o.precioCliente), 0)
    const hoy = new Date(); const d0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    const semana = new Date(d0); semana.setDate(d0.getDate() - d0.getDay())
    const mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const enRango = (o, desde) => { const f = fechaEntrega(o); return f && f >= desde }
    const sum = (arr) => arr.reduce((a, o) => a + n(o.precioCliente), 0)
    const porMaterial = {}
    for (const o of entregadas) { const m = o.material || '—'; porMaterial[m] = porMaterial[m] || { material: m, ton: 0, gasto: 0 }; porMaterial[m].ton += n(o.pesoReal ?? o.pesoEstimado); porMaterial[m].gasto += n(o.precioCliente) }
    // Proyectos: agrupa TODAS sus órdenes por código de proyecto.
    const proy = {}
    for (const o of ordenes) {
      const k = codigoProyecto(o)
      proy[k] = proy[k] || { key: k, codigo: k, total: 0, enCurso: 0, entregadas: 0, gasto: 0 }
      proy[k].total += 1
      if (!FINAL.includes(o.estado)) proy[k].enCurso += 1
      if (ENTREGADAS.includes(o.estado)) { proy[k].entregadas += 1; proy[k].gasto += n(o.precioCliente) }
    }
    const proyectos = Object.values(proy).sort((a, b) => b.total - a.total)
    // Toneladas ENTREGADAS del MES en curso (home 2026): pesoReal (fallback al
    // estimado en órdenes viejas sin ticket) de las entregadas con fecha del mes.
    const tonMes = entregadas.reduce((a, o) => {
      const f = fechaEntrega(o) || (o?.hitos?.liberacion ? new Date(o.hitos.liberacion) : null)
      return f && f >= mes ? a + n(o.pesoReal ?? o.pesoEstimado) : a
    }, 0)
    return {
      total: ordenes.length, entregadas: entregadas.length, ton, gasto, tonMes,
      activas: ordenes.filter((o) => !FINAL.includes(o.estado)).length,
      proyectosActivos: proyectos.filter((p) => p.enCurso > 0).length,
      proyectos,
      hoy: sum(entregadas.filter((o) => enRango(o, d0))),
      semana: sum(entregadas.filter((o) => enRango(o, semana))),
      mes: sum(entregadas.filter((o) => enRango(o, mes))),
      porMaterial: Object.values(porMaterial).sort((a, b) => b.gasto - a.gasto),
    }
  }, [ordenes])

  const firmarFactura = async () => {
    if (!firma || !firmando) return
    const datos = { estado: 'firmada', firma, firmante: usuario?.nombre || usuario?.email, firmadaEn: new Date().toISOString() }
    await guardar('invoices', firmando.id, datos)
    generarFacturaPDF({ ...firmando, ...datos }, { clienteNombre: firmando.clienteNombre, empresa: 'Freight' })
    setFirmando(null); setFirma(null)
  }
  // El cliente disputa/rechaza una factura enviada, con motivo (queda para el staff).
  const notifsC = useMemo(() => notificacionesCliente({ facturas }), [facturas])

  // Mensajes: SOLO con la oficina/administrador, ORGANIZADOS POR VIAJE. Cada viaje
  // usa un canal propio cliente↔oficina (co_<orderId>) donde no participan chofer ni
  // transporte. La consulta trae únicamente los mensajes donde el cliente participa
  // (aislamiento garantizado por reglas). No se mezclan viajes distintos.
  const { datos: misMensajes } = useColeccion('messages', [where('participantes', 'array-contains', clienteId)])
  const resumenMsg = useMemo(() => resumenPorConversacion(misMensajes, usuario?.id), [misMensajes, usuario])
  // Chats PRIVADOS 1-a-1 del cliente (con la oficina/administración), por su UID.
  const { datos: mensajesPriv } = useColeccion('messages', [where('participantes', 'array-contains', usuario?.id || '__none__')])
  const ordenesChat = useMemo(
    () => ordenes.filter((o) => !FINAL.includes(o.estado) || resumenMsg[convClienteOrden(o.id)]),
    [ordenes, resumenMsg],
  )
  const seccionesMsg = useMemo(() => {
    const items = ordenesChat.map((o) => {
      const key = convClienteOrden(o.id)
      const r = resumenMsg[key] || {}
      return { key, chatId: key, icon: 'admin', titulo: o.numero || t('Viaje'), rolLabel: t('Administrador'), rolColor: 'navy', viaje: o.numero || '', material: o.material || '', carga: o.tipoEquipo || '', lastText: r.lastText || '', lastTs: r.lastTs || o.creadoEn || '', noLeidos: r.noLeidos || 0, participantes: [clienteId] }
    })
    return [{ k: 'admin', label: t('Administrador'), icon: 'admin', items, vacio: t('Aún no tienes conversaciones. Se crean por viaje cuando escribes al administrador.') }]
  }, [ordenesChat, resumenMsg, clienteId, t])
  // Cuenta SOLO los hilos que su panel muestra (chats por viaje visibles y, si
  // el admin los apagó, ninguno). Antes sumaba TODAS las conversaciones donde
  // el cliente figura (p. ej. el chat de la orden del chofer, que este panel
  // no lista) → el globito quedaba congelado en un número imposible de "leer".
  const noLeidosMsg = useMemo(
    () => (veChatsViaje ? (seccionesMsg[0]?.items || []) : []).reduce((a, it) => a + (it.noLeidos || 0), 0),
    [seccionesMsg, veChatsViaje],
  )
  // Grupos del cliente (puede ser invitado; no crea). Se añaden como sección aparte.
  const { items: gruposItems, grupos, invitaciones, noLeidos: noLeidosGrupos } = useGrupos()
  const [verGrupos, setVerGrupos] = useState(false)
  const yoPriv = useMemo(() => ({ uid: usuario?.id, rol: 'cliente', clienteId: usuario?.clienteId || null }), [usuario?.id, usuario?.clienteId])
  const { seccion: seccionPriv, abrir: abrirPriv, modal: modalPriv, noLeidos: noLeidosPriv } = usePrivados({ mensajes: mensajesPriv, uid: usuario?.id, tenantId, yo: yoPriv })
  // Abrir una conversación al tocar su aviso flotante: salta a la pestaña Mensajes.
  const [abrirExterno, setAbrirExterno] = useState(null)
  useEffect(() => onAbrirConversacion((k) => { setTab('mensajes'); if (k && k !== '__mensajes__') { setAbrirExterno(k); setTimeout(() => setAbrirExterno(null), 0) } }), [])
  const seccionesCliente = useMemo(() => [
    // Chats POR VIAJE con la oficina: el admin puede apagarlos para el cliente.
    ...(veChatsViaje ? [{ k: 'admin', label: t('Administrador'), icon: 'admin', items: seccionesMsg[0]?.items || [], vacio: seccionesMsg[0]?.vacio }] : []),
    seccionPriv,
    { k: 'grupos', label: t('Grupos'), icon: 'grupo', items: gruposItems, vacio: t('No perteneces a ningún grupo.') },
  ], [seccionesMsg, gruposItems, seccionPriv, veChatsViaje, t])

  const rechazarFactura = async (r) => {
    const motivo = window.prompt(t('¿Por qué disputas esta factura?'))
    if (motivo == null) return
    await guardar('invoices', r.id, { estado: 'rechazada', motivoRechazo: motivo.trim() || 'Sin motivo', rechazadaEn: new Date().toISOString() })
  }

  if (cargando) return <div className="grid min-h-screen place-items-center"><Cargando /></div>

  const facturasPend = facturas.filter((x) => x.estado === 'enviada').length
  const noLeidosTotal = noLeidosMsg + noLeidosGrupos + noLeidosPriv

  // Nombre de la empresa cliente (denormalizado en sus órdenes/facturas; el cliente no
  // puede leer bulk_clients por reglas).
  const empresaCliente = (ordenes.find((o) => o.clienteNombre)?.clienteNombre) || (facturas.find((f) => f.clienteNombre)?.clienteNombre) || ''

  return (
    <>
      {/* Carcasa MÓVIL 2026 (Bloque 2.4): fondo crema de altura fija; el header es
          una fila sin barra de color (avatar → perfil + botones circulares) y el
          cuerpo desplaza por dentro (overflow-y-auto en <main>). Reemplaza al
          PortalLayout de sidebar; las pestañas viejas siguen viviendo aquí. */}
      <div className="mp-app h-dvh mx-auto flex max-w-md flex-col overflow-hidden md:max-w-none md:pl-64">
        {/* ESCRITORIO (≥768px): barra lateral estilo admin con TODAS las
            secciones; en el teléfono se conserva la carcasa tipo app. */}
        <PortalEscritorio
          activo={tab} onSelect={setTab} usuario={usuario} foto={miFotoHome}
          rolLabel={empresaCliente ? `${empresaCliente} · ${t('Cliente')}` : t('Cliente')}
          cerrarSesion={cerrarSesion} irModulos={() => navigate('/elegir')} onPerfil={() => setTab('perfil')}
          tabs={[
            { k: 'inicio', label: t('Inicio'), icon: Home },
            { k: 'ordenes', label: t('Pedidos'), icon: Package },
            { k: 'mapa', label: t('Mapa en vivo'), icon: Navigation },
            { k: 'mensajes', label: t('Chats'), icon: MessageSquare, badge: noLeidosTotal },
            { k: 'facturas', label: t('Facturas'), icon: FileText, badge: facturasPend },
            { k: 'resumen', label: t('Resumen'), icon: LayoutDashboard },
            { k: 'proyectos', label: t('Proyectos'), icon: Layers },
          ]}
        />
        <IndicadorConexion />
        {/* Aviso VISUAL rápido de mensajes nuevos. */}
        <AvisosMensajes />
        <header className="mp-app-safe flex items-center gap-3 px-4 pb-1 pt-2">
          <button type="button" onClick={() => setTab('perfil')} title={t('Mi perfil')} className="transition active:scale-95 md:hidden">
            <Avatar foto={miFotoHome} nombre={usuario?.nombre} size={40} redondo />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium text-mp-ink">{usuario?.nombre}</div>
            <div className="truncate text-[12px] text-mp-ink-2">{empresaCliente ? `${empresaCliente} · ` : ''}{t('Cliente')}</div>
          </div>
          <CampanaNotificaciones notifs={notifsC} claveLS="bulk_notif_cliente" />
          <IconButton className="md:!hidden" icon={Grid2x2} label={t('Cambiar módulo')} onClick={() => navigate('/elegir')} />
          <IconButton className="md:!hidden" icon={LogOut} label={t('Salir')} onClick={cerrarSesion} />
        </header>

        {/* En la pestaña Mensajes la página NO desplaza (overflow-hidden): el panel
            de chats mide exacto y desplaza por dentro. */}
        <main className={`relative flex-1 p-3 md:w-full md:max-w-[1150px] md:px-6 ${tab === 'mensajes' ? 'overflow-hidden pb-2' : 'overflow-y-auto pb-32 md:pb-8'}`}>
          {!usuario?.clienteId ? (
            <div className="pt-6 text-center">
              <EstadoVacio titulo={t('Cuenta no vinculada')} texto={t('Tu usuario aún no está ligado a un cliente. Si el administrador ya lo asignó, toca “Reparar mi acceso”. Si no, pídele que lo asigne.')} mostrarBoton={false} />
              <RepararAcceso className="mt-1 px-3 py-1.5 text-xs" />
            </div>
          ) : (
            <>
              {tab === 'inicio' && (() => {
                // ── HOME 2026 (Bloque 2.4) ──────────────────────────────────
                // Pedido EN CAMINO "más próximo" a entregarse = el de mayor avance.
                const enCamino = ordenes
                  .filter((o) => PROGRESO_CAMINO[o.estado] != null)
                  .sort((a, b) => (PROGRESO_CAMINO[b.estado] || 0) - (PROGRESO_CAMINO[a.estado] || 0))
                const destacado = enCamino[0] || null
                const eta = destacado ? etaOrden(destacado, geocercasCli, plantasCli) : null
                // Pedidos programados (aún sin chofer en camino).
                const programados = ordenes
                  .filter((o) => [E.CREADA, E.EN_COLA, E.NOTIFICANDO].includes(o.estado))
                  .sort((a, b) => String(b.creadoEn || '').localeCompare(String(a.creadoEn || '')))
                  .slice(0, 6)
                const fFec = (v) => { const ms = tsMillis(v) || Date.parse(v); return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '' }
                // Facturas ABIERTAS: emitidas y aún no pagadas (las anuladas no cuentan).
                const facturasAbiertas = facturas.filter((f) => f.estado !== 'pagada' && f.estado !== 'anulada').length
                // Calificación pendiente: la entrega MÁS RECIENTE de los últimos 7 días
                // (la tarjeta se oculta sola si ya la calificó — soloPedir).
                const porCalificar = ordenes
                  .filter((o) => ENTREGADAS.includes(o.estado))
                  .map((o) => ({ o, ms: tsMillis(o.hitos?.entrega || o.hitos?.liberacion) || 0 }))
                  .filter((x) => x.ms && Date.now() - x.ms < 7 * 86400000)
                  .sort((a, b) => b.ms - a.ms)[0]?.o || null
                return (
                  <div className="px-1">
                    <div className="pb-1 pt-1">
                      <div className="text-[12px] text-mp-ink-2">{t('Hola')}, {String(usuario?.nombre || '').split(' ')[0]} 👋</div>
                      <h1 className="m-0 text-[22px] font-medium text-mp-ink">{t('Tus pedidos')}</h1>
                    </div>
                    {/* En escritorio la home se acomoda en DOS columnas para no
                        dejar espacio en blanco; en el teléfono sigue en una. */}
                    <div className="md:grid md:grid-cols-2 md:items-start md:gap-4">
                    <div className="space-y-2">
                    {porCalificar && <CalificacionViaje orden={porCalificar} soloPedir />}

                    {/* Tarjeta protagonista: el pedido en camino con su avance en vivo.
                        Al tocarla se abre el DETALLE apilado del pedido (Bloque 3). */}
                    {destacado ? (
                      <button type="button" onClick={() => setDetalle(destacado.id)} className="block w-full text-left transition active:scale-[0.99]">
                      <FeatureCard>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[12px] text-mp-cream/70">{destacado.numero}</span>
                          <StatusPill sobreNavy color="var(--mp-gold)">{t(ORDEN_ESTADO_LABEL[destacado.estado] || destacado.estado)}</StatusPill>
                        </div>
                        <div className="mt-2 text-[22px] font-medium leading-tight">
                          {t(destacado.material || 'Carga')} · {destacado.pesoReal ?? destacado.pesoEstimado} {t('ton')}
                        </div>
                        {/* Barra de progreso dorada según el estado del viaje. */}
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-white/15">
                          <div className="h-full rounded-pill bg-mp-gold transition-[width] duration-500" style={{ width: `${PROGRESO_CAMINO[destacado.estado] || 0}%` }} />
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-mp-cream/80">
                          <span className="truncate">{destacado.choferNombre || t('Chofer por asignar')}</span>
                          {eta && <span className="flex-shrink-0">ETA {etaTexto(eta)}</span>}
                        </div>
                      </FeatureCard>
                      </button>
                    ) : (
                      <FeatureCard>
                        <StatusPill sobreNavy color="var(--mp-gold)">{t('Sin entregas en camino')}</StatusPill>
                        <div className="mt-2 text-[22px] font-medium leading-tight">{t('Cuando un pedido esté en camino, lo verás aquí en vivo.')}</div>
                      </FeatureCard>
                    )}

                    {/* ÚNICO botón dorado de la pantalla: abre la hoja "Nuevo pedido"
                        (3 toques; el backend lo convierte en órdenes reales). */}
                    <PrimaryButton icon={Plus} onClick={() => setHoja({})}>{t('Nuevo pedido')}</PrimaryButton>

                    {/* Stats del mes */}
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard etiqueta={t('Entregado (mes)')} valor={Math.round(stats.tonMes * 10) / 10} sufijo={t('ton')} />
                      <StatCard etiqueta={t('Facturas abiertas')} valor={facturasAbiertas} />
                    </div>
                    </div>{/* /columna izquierda */}
                    <div className="mt-2 space-y-2 md:mt-0">

                    {/* Pedidos programados (futuros / pendientes de salir) */}
                    {programados.length > 0 && (
                      <>
                        <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Programados')}</div>
                        {programados.map((o) => (
                          <ListRow key={o.id} icon={Package}
                            titulo={`${t(o.material || 'Carga')} · ${o.pesoReal ?? o.pesoEstimado} ${t('ton')}`}
                            meta={`${o.numero || ''}${fFec(o.creadoEn) ? ` · ${fFec(o.creadoEn)}` : ''}`}
                            derecha={<StatusPill color="var(--mp-gold)">{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>}
                            onClick={() => setDetalle(o.id)} />
                        ))}
                      </>
                    )}

                    {/* Accesos a las pantallas que salieron de la barra (en
                        escritorio ya están en el menú lateral: no se repiten). */}
                    <div className="md:hidden">
                      <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Explorar')}</div>
                      <div className="mt-2 space-y-2">
                        <ListRow icon={Navigation} titulo={t('Mapa en vivo')} onClick={() => setTab('mapa')} />
                        <ListRow icon={Layers} titulo={t('Proyectos')} onClick={() => setTab('proyectos')} />
                        <ListRow icon={LayoutDashboard} titulo={t('Resumen')} onClick={() => setTab('resumen')} />
                      </div>
                    </div>
                    {/* En escritorio, la columna derecha muestra los pedidos
                        recientes para llenar la pantalla con algo ÚTIL. */}
                    <div className="hidden md:block">
                      <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Entregas recientes')}</div>
                      <div className="mt-2 space-y-2">
                        {ordenes.filter((o) => ENTREGADAS.includes(o.estado))
                          .sort((a, b) => (tsMillis(b.hitos?.entrega || b.hitos?.liberacion) || 0) - (tsMillis(a.hitos?.entrega || a.hitos?.liberacion) || 0))
                          .slice(0, 6).map((o) => (
                            <ListRow key={`rec_${o.id}`} icon={Package}
                              titulo={`${t(o.material || 'Carga')} · ${o.pesoReal ?? o.pesoEstimado} ${t('ton')}`}
                              meta={`${o.numero || ''}${fFec(o.hitos?.entrega || o.hitos?.liberacion) ? ` · ${fFec(o.hitos?.entrega || o.hitos?.liberacion)}` : ''}`}
                              derecha={<StatusPill color="var(--mp-green)">{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>}
                              onClick={() => setDetalle(o.id)} />
                          ))}
                        {ordenes.filter((o) => ENTREGADAS.includes(o.estado)).length === 0 && (
                          <div className="rounded-card bg-white p-6 text-center text-[13px] text-mp-ink-2 shadow-card">{t('Aún no hay entregas.')}</div>
                        )}
                      </div>
                    </div>
                    </div>{/* /columna derecha */}
                    </div>{/* /grid escritorio */}
                  </div>
                )
              })()}

              {tab === 'resumen' && (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <KPI label={t('Proyectos activos')} value={stats.proyectosActivos} icon={Layers} accent="navy" />
                    <KPI label={t('Órdenes en curso')} value={stats.activas} icon={ClipboardList} accent="gold" />
                    <KPI label={t('Entregadas')} value={stats.entregadas} icon={ClipboardList} accent="green" />
                    <KPI label={t('Gasto total')} value={money(stats.gasto)} icon={DollarSign} accent="blue" />
                  </div>
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <Card className="p-4"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Gasto hoy')}</div><div className="mt-0.5 text-2xl font-black text-brand-navy dark:text-slate-100">{money(stats.hoy)}</div></Card>
                    <Card className="p-4"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Gasto esta semana')}</div><div className="mt-0.5 text-2xl font-black text-brand-navy dark:text-slate-100">{money(stats.semana)}</div></Card>
                    <Card className="p-4"><div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('Gasto este mes')}</div><div className="mt-0.5 text-2xl font-black text-brand-navy dark:text-slate-100">{money(stats.mes)}</div></Card>
                  </div>
                  <Card className="p-4">
                    <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Costos por material')}</h3>
                    {stats.porMaterial.length === 0 ? <p className="text-sm text-slate-400">{t('Sin entregas todavía.')}</p> : (
                      <Tabla columns={[{ key: 'material', label: t('Material') }, { key: 'ton', label: t('Toneladas'), align: 'right' }, { key: 'gasto', label: t('Gasto'), align: 'right' }]}
                        rows={stats.porMaterial.map((m) => ({ ...m, _key: m.material }))}
                        renderCell={(r, k) => k === 'gasto' ? money(r.gasto) : k === 'ton' ? Math.round(r.ton * 100) / 100 : r[k]} />
                    )}
                  </Card>
                </>
              )}

              {tab === 'proyectos' && (
                <Card className="p-4">
                  <div className="mb-3 flex items-center gap-2"><Layers size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mis proyectos')}</h3></div>
                  {stats.proyectos.length === 0 ? <EstadoVacio titulo={t('Aún no tienes proyectos')} texto={t('Cuando tengas órdenes, se agruparán aquí por proyecto.')} mostrarBoton={false} /> : (
                    <Tabla columns={[{ key: 'codigo', label: t('Proyecto') }, { key: 'total', label: t('Órdenes'), align: 'right' }, { key: 'enCurso', label: t('En curso'), align: 'right' }, { key: 'entregadas', label: t('Entregadas'), align: 'right' }, { key: 'gasto', label: t('Gasto'), align: 'right' }]}
                      rows={stats.proyectos.map((p) => ({ ...p, _key: p.key }))}
                      renderCell={(r, k) => {
                        if (k === 'codigo') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{r.codigo}</span>
                        if (k === 'enCurso') return r.enCurso > 0 ? <Badge color="gold">{r.enCurso}</Badge> : <span className="text-slate-400">0</span>
                        if (k === 'gasto') return money(r.gasto)
                        return r[k]
                      }} minWidth="min-w-[520px]" />
                  )}
                </Card>
              )}

              {tab === 'mapa' && (() => {
                const enViaje = ordenes.filter((o) => !FINAL.includes(o.estado))
                const conGps = enViaje.filter((o) => o.ultimaPos?.lat != null)
                const sel = conGps.find((o) => o.id === ordenMapa) || null
                const colorEst = { aceptada: '#64748b', en_planta: '#13233f', cargando: '#13233f', en_ruta: '#2563eb', en_destino: '#f59e0b' }
                const marcadores = conGps.map((o) => ({ id: o.id, lat: o.ultimaPos.lat, lng: o.ultimaPos.lng, icon: 'truck', color: colorEst[o.estado] || '#64748b', label: `${o.numero} · ${t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}` }))
                return (
                  <Card className="p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
                      <Navigation size={14} className="text-amber-500" />
                      <span className="font-bold text-brand-navy dark:text-slate-100">{t('Tus entregas en vivo')}</span>
                      <Badge color="navy">{conGps.length}</Badge>
                      {sel && <span className="ml-auto font-mono font-bold text-brand-navy dark:text-slate-100">{sel.numero}</span>}
                    </div>
                    {conGps.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-400"><Navigation size={30} strokeWidth={1.4} /><p className="max-w-xs text-sm">{t('Ningún camión con GPS en este momento. Cuando un chofer esté en camino con tu carga, lo verás aquí en tiempo real.')}</p></div>
                    ) : (
                      <MapaLeaflet geocercas={geocercasCli} marcadores={marcadores} puntos={sel ? trackCli : []} alto="52vh" onMarcador={(id) => setOrdenMapa(id === ordenMapa ? '' : id)} />
                    )}
                    {enViaje.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {enViaje.map((o) => {
                          const e = etaOrden(o, geocercasCli, plantasCli)
                          const activoSel = ordenMapa === o.id
                          return (
                            <button key={o.id} onClick={() => setOrdenMapa(activoSel ? '' : o.id)}
                              className={`rounded-xl border p-3 text-left transition ${activoSel ? 'border-amber-400 bg-amber-500/5' : 'border-slate-200 hover:border-amber-300 dark:border-slate-700'}`}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                                <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                                {e && <span className={`ml-auto text-[11px] font-bold ${e.viejo ? 'text-slate-400' : 'text-blue-600 dark:text-blue-300'}`}>ETA {etaTexto(e)}</span>}
                              </div>
                              <div className="mt-1 text-xs text-slate-400">{t(o.material || '—')} · {o.pesoReal ?? o.pesoEstimado} ton{o.ultimaPos?.lat != null ? ` · ${activoSel ? t('trayectoria visible') : t('toca para ver su trayectoria')}` : ` · ${t('sin GPS todavía')}`}</div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <p className="mt-2 px-1 text-[11px] text-slate-400">{t('La posición se actualiza con el GPS del chofer (~20 s). El ETA es un estimado según distancia y velocidad promedio; puede variar por tráfico.')}</p>
                  </Card>
                )
              })()}

              {tab === 'ordenes' && (() => {
                // Solicitudes propias aún sin convertir (el cliente puede borrarlas
                // mientras estén 'pendiente'/'programado'; reglas de Firestore).
                const solicitudes = (pedidosCli || [])
                  .filter((p) => ['pendiente', 'programado'].includes(p.estado))
                  .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))
                const reglas = (reglasRec || []).slice().sort((a, b) => String(a.material || '').localeCompare(String(b.material || '')))
                return (
                <div className="space-y-2 px-1">
                  {/* ÚNICO dorado de la pestaña: la misma hoja de 3 toques de la home. */}
                  <PrimaryButton icon={Plus} onClick={() => setHoja({})}>{t('Nuevo pedido')}</PrimaryButton>

                  {/* Solicitudes enviadas (pendientes de convertir o programadas). */}
                  {solicitudes.length > 0 && (
                    <>
                      <div className="pt-1 text-[15px] font-medium text-mp-ink">{t('Solicitudes')}</div>
                      {solicitudes.map((p) => (
                        <ListRow key={p.id} icon={Package} chevron={false}
                          titulo={`${t(p.material || '—')} · ${p.cantidadTon} ${t('ton')}`}
                          meta={`${p.fecha || ''}${p.destino ? ` · ${p.destino}` : ''}`}
                          derecha={<span className="flex flex-shrink-0 items-center gap-1">
                            <StatusPill color="var(--mp-gold)">{p.estado === 'programado' ? t('Programado') : t('Pendiente')}</StatusPill>
                            <button type="button" title={t('Eliminar')} className="grid h-8 w-8 place-items-center rounded-pill text-mp-ink-2 transition active:scale-95"
                              onClick={() => { if (window.confirm(t('¿Eliminar este pedido?'))) eliminar('pedidos', p.id) }}>
                              <Trash2 size={16} strokeWidth={1.75} />
                            </button>
                          </span>} />
                      ))}
                    </>
                  )}

                  {/* Reglas RECURRENTES del cliente: pausar/reanudar, editar, eliminar.
                      Las órdenes las genera el backend cada día elegido a las 00:05. */}
                  {reglas.length > 0 && (
                    <>
                      <div className="pt-1 text-[15px] font-medium text-mp-ink">{t('Recurrentes')}</div>
                      {reglas.map((r) => (
                        <CardApp key={r.id}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-[14px] font-medium text-mp-ink">{t(r.material || '—')} · {r.cantidadTon} {t('ton')}</div>
                              <div className="truncate text-[12px] text-mp-ink-2">{diasTexto(r.dias)}{r.hora ? ` · ${r.hora}` : ''}{r.destino ? ` · ${r.destino}` : ''}{r.fin ? ` · → ${r.fin}` : ''}</div>
                            </div>
                            <StatusPill color={r.pausada ? 'var(--mp-ink-2)' : 'var(--mp-green)'}>{r.pausada ? t('Pausada') : t('Activa')}</StatusPill>
                          </div>
                          <div className="mt-2.5 flex gap-2">
                            <button type="button" onClick={() => guardar('recurringOrders', r.id, { pausada: !r.pausada })}
                              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-pill border border-mp-navy text-[12px] font-medium text-mp-navy transition active:scale-95">
                              {r.pausada ? <Play size={14} strokeWidth={1.75} /> : <Pause size={14} strokeWidth={1.75} />} {r.pausada ? t('Reanudar') : t('Pausar')}
                            </button>
                            <button type="button" onClick={() => setHoja({ regla: r })}
                              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-pill border border-mp-navy text-[12px] font-medium text-mp-navy transition active:scale-95">
                              <Pencil size={14} strokeWidth={1.75} /> {t('Editar')}
                            </button>
                            <button type="button" onClick={() => { if (window.confirm(t('¿Eliminar esta regla recurrente?'))) eliminar('recurringOrders', r.id) }}
                              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-pill border border-mp-red/60 text-[12px] font-medium text-mp-red transition active:scale-95">
                              <Trash2 size={14} strokeWidth={1.75} /> {t('Eliminar')}
                            </button>
                          </div>
                        </CardApp>
                      ))}
                    </>
                  )}

                <Card className="p-4">
                  <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mis órdenes')}</h3>
                  {ordenes.length === 0 ? <EstadoVacio titulo={t('Aún no hay órdenes')} texto={t('Aquí verás tus órdenes con su estado en tiempo real.')} mostrarBoton={false} /> : (
                    <Tabla columns={[{ key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') }, { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'precioCliente', label: t('Precio'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'ticket', label: t('Ticket'), align: 'center' }]}
                      rows={ordenes.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).slice(0, 100).map((o) => ({ ...o, _key: o.id }))}
                      onRowClick={(o) => setDetalle(o.id)}
                      renderCell={(o, k) => {
                        if (k === 'ton') return o.pesoReal ?? o.pesoEstimado
                        if (k === 'precioCliente') return o.precioCliente != null ? money(o.precioCliente) : '—'
                        if (k === 'estado') return <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                        // Ticket solo-impresión (el cliente NO genera folios ni escribe la orden):
                        // disponible cuando la carga ya salió o el staff ya emitió el ticket.
                        if (k === 'ticket') return (o.ticketCarga || o.ticketEntrega || ENTREGADAS.includes(o.estado) || o.hitos?.carga)
                          ? <span onClick={(e) => e.stopPropagation()}><ImprimirTicket orden={o} empresa="Freight" canGenerar={false} tenantId={tenantId} usuario={usuario} rol="cliente" compacto clientesMap={usuario?.clienteId ? { [usuario.clienteId]: { nombre: empresaCliente } } : {}} ordenesJob={ordenes} /></span>
                          : <span className="text-slate-300 dark:text-slate-600">—</span>
                        return o[k]
                      }} />
                  )}
                </Card>
                </div>
                )
              })()}

              {tab === 'facturas' && (
                <>
                  {facturas.length > 0 && (
                    <div className="mb-4"><DashboardFacturacion rol="cliente" facturas={facturas} soloResumen jobsMap={{}} t={t} /></div>
                  )}
                  <Card className="p-4">
                  <div className="mb-3 flex items-center gap-2"><FileText size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Facturas')}</h3></div>
                  {facturas.length > 0 && <BuscadorFacturas f={busqFac} setF={setBusqFac} montoLabel={t('Monto de cobro…')} />}
                  {facturas.length === 0 ? <EstadoVacio titulo={t('Aún no tienes facturas')} texto={t('Cuando el administrador emita una factura, aparecerá aquí para revisar y firmar.')} mostrarBoton={false} />
                    : facturasFiltradas.length === 0 ? <p className="text-sm text-slate-400">{t('No hay facturas que coincidan con los criterios de búsqueda.')}</p> : (
                    <div className="space-y-2.5">
                      {facturasFiltradas.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((r) => (
                        <DocCard key={r.id} r={r} tipo="cliente" t={t} onVer={() => setDetalleFac(r)} />
                      ))}
                    </div>
                  )}
                  </Card>
                </>
              )}

              {tab === 'mensajes' && (
                <>
                  <PanelConversaciones secciones={seccionesCliente} alturaClass="h-mensajes-chofer" abrir={abrirExterno || abrirPriv} estiloApp
                    menuConversacion={(item) => menuGrupoConv({ item, grupos, uid: usuario?.id, t })}
                    accion={<span className="flex items-center gap-1.5"><BotonReunion /><Boton variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setVerGrupos(true)}><MessageSquare size={15} /> {t('Grupos')}{invitaciones.length > 0 && <span className="ml-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{invitaciones.length}</span>}</Boton></span>} />
                  {verGrupos && <GruposModal grupos={grupos} invitaciones={invitaciones} candidatos={[]} puedeCrear={false} uid={usuario?.id} onClose={() => setVerGrupos(false)} />}
                  {modalPriv}
                </>
              )}
            </>
          )}

          {/* Perfil mínimo 2026: idioma, contraseña, módulo y salir. Disponible
              aunque la cuenta no esté vinculada a un cliente. */}
          {tab === 'perfil' && (
            <div className="space-y-2 px-1">
              <CardApp>
                <div className="flex items-center gap-3">
                  <Avatar foto={miFotoHome} nombre={usuario?.nombre} size={52} redondo />
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-medium text-mp-ink">{usuario?.nombre}</div>
                    {empresaCliente && <div className="truncate text-[12px] text-mp-ink-2">{empresaCliente}</div>}
                    <div className="truncate text-[12px] text-mp-ink-2">{t('Cliente')}{usuario?.email ? ` · ${usuario.email}` : ''}</div>
                  </div>
                </div>
              </CardApp>
              <CardApp>
                <div className="mb-2 text-[12px] text-mp-ink-2">{t('Idioma')}</div>
                <LangToggle />
              </CardApp>
              <SecondaryButton icon={KeyRound} onClick={() => setVerClave(true)}>{t('Cambiar contraseña')}</SecondaryButton>
              <SecondaryButton icon={Grid2x2} onClick={() => navigate('/elegir')}>{t('Cambiar módulo')}</SecondaryButton>
              <SecondaryButton icon={LogOut} onClick={cerrarSesion}>{t('Salir')}</SecondaryButton>
            </div>
          )}
        </main>

        {/* Barra FLOTANTE 2026 (Bloque 2.4): 4 tabs, Chats en tercera posición.
            Resumen/Mapa/Proyectos/Perfil siguen existiendo como pantallas (se
            llega desde la home o el avatar), solo salen de la barra. */}
        {/* En escritorio la navegación vive en la barra lateral (estilo admin). */}
        <div className="md:hidden">
          <FloatingTabBar
            activo={['perfil', 'resumen', 'mapa', 'proyectos'].includes(tab) ? 'inicio' : tab}
            onSelect={setTab}
            tabs={[
              { k: 'inicio', label: t('Inicio'), icon: Home },
              { k: 'ordenes', label: t('Pedidos'), icon: Package },
              { k: 'mensajes', label: t('Chats'), icon: MessageSquare, badge: noLeidosTotal },
              { k: 'facturas', label: t('Facturas'), icon: FileText, badge: facturasPend },
            ]}
          />
        </div>
      </div>

      {verClave && <CambiarClave onClose={() => setVerClave(false)} />}

      {/* Hoja "Nuevo pedido" (3 toques) / editar recurrente — Negocio B2. */}
      {hoja && (
        <HojaNuevoPedido t={t} ordenes={ordenes} tenantId={tenantId} clienteId={usuario?.clienteId}
          clienteNombre={empresaCliente} prefill={hoja.prefill} regla={hoja.regla}
          onClose={() => setHoja(null)} onListo={(msg) => { setHoja(null); avisar(msg) }} />
      )}
      {/* Confirmación breve (pedido enviado / link copiado). */}
      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[85] flex justify-center px-4">
          <div className="rounded-pill bg-mp-navy px-4 py-2 text-[13px] text-mp-cream shadow-float">{aviso}</div>
        </div>
      )}

      {/* ── DETALLE DE PEDIDO apilado (Bloque 3): esqueleto compartido ────────
          Se abre al tocar un pedido en la home (destacado/programados) o una
          fila de la pestaña Pedidos. Capa fixed a pantalla completa sin tab bar;
          lee la orden EN VIVO de `ordenes` (sigue actualizándose abierta). */}
      {detalle && (() => {
        const o = ordenes.find((x) => x.id === detalle)
        if (!o) return null
        const cerrar = () => setDetalle(null)
        const hitos = o.hitos || {}
        const entregada = ENTREGADAS.includes(o.estado)
        const activa = !FINAL.includes(o.estado)
        const cargo = !!(hitos.carga || hitos.salidaPlanta) || YA_CARGO.includes(o.estado)
        const plantaNom = (plantasCli || []).find((p) => p.id === o.plantaId)?.nombre || o.plantaNombre || t('Planta')
        const eta = activa ? etaOrden(o, geocercasCli, plantasCli) : null
        // Chat del viaje: mismo canal cliente↔oficina que la pestaña Mensajes
        // (respeta el interruptor del admin `veChatsViaje`).
        const chatKey = convClienteOrden(o.id)
        const abrirChat = veChatsViaje ? () => { cerrar(); setTab('mensajes'); setAbrirExterno(chatKey); setTimeout(() => setAbrirExterno(null), 0) } : null
        // Factura LIGADA al pedido (una línea con su orderId); las anuladas no cuentan.
        const fac = (facturas || []).find((f) => f.estado !== 'anulada' && (f.lineas || []).some((l) => l.orderId === o.id))
        // Atajos (máx. 3, mismo layout): Chat · Seguimiento · Factura/Documentos.
        const atajos = [
          ...(abrirChat ? [{ icon: MessageSquare, label: t('Chat'), onClick: abrirChat, badge: resumenMsg[chatKey]?.noLeidos || 0 }] : []),
          // Seguimiento: pedido activo → mapa en vivo enfocado en él; pedido
          // cerrado → baja a la tarjeta de estado (última hora registrada).
          { icon: Navigation, label: t('Seguimiento'), onClick: activa ? () => { cerrar(); setOrdenMapa(o.id); setTab('mapa') } : () => refEstadoDet.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
          fac
            ? { icon: FileText, label: t('Factura'), badge: fac.estado === 'enviada' ? 1 : 0, onClick: () => { cerrar(); setTab('facturas'); setDetalleFac(fac) } }
            : ticketDisponible(o)
              ? { icon: Printer, label: t('Documentos'), onClick: () => refDocsDet.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
              // Sin factura ni ticket todavía (el cliente no crea pedidos): a su lista de facturas.
              : { icon: FileText, label: t('Facturas'), onClick: () => { cerrar(); setTab('facturas') } },
        ]
        // Acción del pie (ÚNICO botón dorado de la pantalla): firmar la factura
        // enviada del pedido entregado; o el seguimiento en vivo si hay GPS.
        const accion = entregada && fac?.estado === 'enviada'
          ? { label: t('Revisar y firmar'), icon: PenLine, onClick: () => { cerrar(); setTab('facturas'); setFirmando(fac); setFirma(null) } }
          : activa && o.ultimaPos?.lat != null
            ? { label: t('Ver seguimiento'), icon: Navigation, onClick: () => { cerrar(); setOrdenMapa(o.id); setTab('mapa') } }
            : null
        // Hora del último hito registrado (para la tarjeta de estado).
        const ultHito = [hitos.liberacion, hitos.entrega, hitos.llegadaDestino, hitos.salidaPlanta, hitos.carga, hitos.llegadaPlanta, hitos.tomada].find(Boolean)
        // Filas de datos REALES (solo se pintan las que tienen valor).
        const filas = [
          [t('Solicitado'), fFecha(o.creadoEn)],
          [t('Cantidad'), `${o.pesoReal ?? o.pesoEstimado} ${t('ton')}`],
          [t('Precio'), o.precioCliente != null ? money(o.precioCliente) : null],
          [t('Proyecto'), codigoProyecto(o) !== '—' ? codigoProyecto(o) : null],
          ['PO', o.po || null],
          [t('Chofer'), o.choferNombre || null],
          [t('Equipo'), o.tipoEquipo || null],
        ].filter(([, v]) => v)
        return (
          <DetalleOrdenApp
            numero={o.numero}
            material={t(o.material || 'Carga')}
            cliente={o.direccionEntrega || `${t('Proyecto')} ${codigoProyecto(o)}`}
            toneladas={o.pesoReal ?? o.pesoEstimado}
            origen={{ nombre: plantaNom, hecho: cargo, hora: fHora(hitos.salidaPlanta || hitos.carga), estado: cargo ? undefined : t(ORDEN_ESTADO_LABEL[o.estado] || o.estado) }}
            destino={{ nombre: o.direccionEntrega || t('Destino'), hecho: entregada, hora: fHora(hitos.entrega || hitos.liberacion), estado: entregada || o.estado === E.CANCELADA ? t(ORDEN_ESTADO_LABEL[o.estado] || o.estado) : eta ? `ETA ${etaTexto(eta)}` : undefined }}
            atajos={atajos}
            ticket={o.ticket ? { numero: o.ticket.numero, peso: o.ticket.peso, hora: fHora(o.ticket.ts) } : null}
            accion={accion}
            onVolver={cerrar}
            onChat={abrirChat || undefined}
            chatBadge={resumenMsg[chatKey]?.noLeidos || 0}
          >
            {/* Estado actual + datos reales del pedido */}
            {/* Calificación del viaje: el cliente la pone al recibir; luego queda visible. */}
            <CalificacionViaje orden={o} />
            <div ref={refEstadoDet}>
              <CardApp>
                <div className="mb-2 text-[12px] text-mp-ink-2">{t('Estado actual')}</div>
                <div className="flex items-center justify-between gap-2">
                  <StatusPill color={PILL_COLOR[ORDEN_ESTADO_COLOR[o.estado]] || 'var(--mp-gold)'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>
                  {ultHito && <span className="text-[12px] text-mp-ink-2">{fHora(ultHito)}</span>}
                </div>
                {filas.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {filas.map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="flex-shrink-0 text-mp-ink-2">{k}</span>
                        <span className="min-w-0 truncate text-right font-medium text-mp-ink">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardApp>
            </div>
            {/* Acciones del pedido (Negocio B2): repetir en 3 toques y, mientras
                está activo, el link público de seguimiento para el encargado. */}
            <ListRow icon={Repeat} titulo={t('Repetir pedido')} meta={t('Misma carga y destino; solo eliges la fecha.')}
              onClick={() => { cerrar(); setTab('ordenes'); setHoja({ prefill: { material: o.material || '', cantidadTon: n(o.pesoReal ?? o.pesoEstimado), destino: o.direccionEntrega || '', jobId: o.jobId || null } }) }} />
            {activa && (
              <ListRow icon={Share2} titulo={t('Compartir seguimiento')} meta={t('Link en vivo sin login para el encargado de obra')}
                onClick={() => compartirSeguimiento(o.id)} />
            )}
            {/* Documentos del pedido: ticket imprimible cuando la carga ya salió
                (solo-impresión: el cliente no genera folios). */}
            {ticketDisponible(o) && (
              <div ref={refDocsDet}>
                <CardApp>
                  <div className="mb-2 text-[12px] text-mp-ink-2">{t('Documentos del pedido')}</div>
                  <ImprimirTicket orden={o} empresa="Freight" canGenerar={false} tenantId={tenantId} usuario={usuario} rol="cliente" clientesMap={usuario?.clienteId ? { [usuario.clienteId]: { nombre: empresaCliente } } : {}} ordenesJob={ordenes} />
                </CardApp>
              </div>
            )}
          </DetalleOrdenApp>
        )
      })()}

      {detalleFac && (
        <DocDrawer r={detalleFac} tipo="cliente" empresa="Freight" persona={null} t={t} onClose={() => setDetalleFac(null)}
          pie={<>
            <BotonDoc icon={FileText} primary onClick={() => { setVerDocFac(detalleFac); setDetalleFac(null) }}>{t('Ver documento')}</BotonDoc>
            {detalleFac.estado === 'enviada' && <>
              <BotonDoc icon={PenLine} onClick={() => { setFirmando(detalleFac); setFirma(null); setDetalleFac(null) }}>{t('Revisar y firmar')}</BotonDoc>
              <BotonDoc onClick={() => { rechazarFactura(detalleFac); setDetalleFac(null) }}>{t('Disputar')}</BotonDoc>
            </>}
          </>} />
      )}

      {verDocFac && <DocumentoFactura doc={verDocFac} tipo="cliente" empresa="Freight" jobsMap={{}} overlay onBack={() => setVerDocFac(null)} />}

      {firmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setFirmando(null)}>
          <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-2 text-base font-bold text-brand-navy dark:text-slate-100">{t('Revisar factura')} {firmando.numero}</h3>
            <div className="scroll-thin mb-3 max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <Tabla columns={[{ key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') }, { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'precio', label: t('Precio'), align: 'right' }]}
                rows={(firmando.lineas || []).map((l, i) => ({ ...l, _key: i }))}
                renderCell={(l, k) => k === 'precio' ? money(l.precio) : l[k]} minWidth="min-w-[360px]" />
            </div>
            <div className="mb-2 text-right text-lg font-bold text-brand-navy dark:text-slate-100">{t('Total')}: {money(firmando.total)}</div>
            <div className="mb-1 text-xs font-semibold text-slate-500">{t('Firma de aprobación')}</div>
            <FirmaPad onChange={setFirma} />
            <div className="mt-3 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setFirmando(null)}>{t('Cancelar')}</Boton>
              <Boton variant="gold" onClick={firmarFactura} disabled={!firma}><PenLine size={15} /> {t('Aprobar y firmar')}</Boton>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

// ── Chip pill de la hoja (material / destino / fecha / días) ─────────────────
function Chip({ on, onClick, children, className = '' }) {
  return (
    <button type="button" onClick={onClick}
      className={`max-w-full truncate rounded-pill px-3.5 py-2 text-[13px] font-medium transition active:scale-95 ${on ? 'bg-mp-navy text-mp-cream' : 'bg-white text-mp-ink shadow-card'} ${className}`}>
      {children}
    </button>
  )
}

// ── Hoja "NUEVO PEDIDO" en 3 toques (orden "Negocio y roles", Bloque 2) ──────
// El cliente NO puede leer bulk_jobs: materiales, destinos y jobIds salen de SUS
// órdenes pasadas. La hoja escribe bulk_pedidos (estado 'pendiente') y el backend
// (bulkPedidoCliente) lo convierte en órdenes reales; con "Repetir cada…" activo
// escribe además la regla en bulk_recurringOrders (createRecurringOrders la corre
// cada día elegido a las 00:05). `prefill` = repetir una orden; `regla` = editar
// una recurrente existente (guarda sobre la misma).
function HojaNuevoPedido({ t, ordenes, tenantId, clienteId, clienteNombre, prefill = null, regla = null, onClose, onListo }) {
  // Órdenes más recientes primero: el "catálogo" personal del cliente.
  const recientes = useMemo(() => (ordenes || []).slice()
    .sort((a, b) => (tsMillis(b.creadoEn) || Date.parse(b.ts) || 0) - (tsMillis(a.creadoEn) || Date.parse(a.ts) || 0)), [ordenes])
  // Últimos 6 materiales usados (sin repetir).
  const materiales = useMemo(() => {
    const v = []
    for (const o of recientes) { if (o.material && !v.includes(o.material)) v.push(o.material); if (v.length >= 6) break }
    return v
  }, [recientes])
  // Últimas 4 direcciones de entrega DISTINTAS, cada una con el jobId de su orden.
  const destinos = useMemo(() => {
    const v = []
    for (const o of recientes) {
      const d = (o.direccionEntrega || '').trim()
      if (d && o.jobId && !v.some((x) => x.dir === d)) v.push({ dir: d, jobId: o.jobId })
      if (v.length >= 4) break
    }
    return v
  }, [recientes])
  // jobId para "Otra" dirección: la orden más reciente del material elegido.
  const jobDeMaterial = (mat) => (recientes.find((o) => o.material === mat && o.jobId) || recientes.find((o) => o.jobId) || {}).jobId || null

  const ini = regla || prefill || {}
  const [material, setMaterial] = useState(ini.material || materiales[0] || '')
  const [cantidad, setCantidad] = useState(ini.cantidadTon ? String(ini.cantidadTon) : '')
  const [destinoSel, setDestinoSel] = useState(() => {
    const d = (ini.destino || '').trim()
    if (d) return destinos.some((x) => x.dir === d) ? d : 'otra'
    return destinos[0]?.dir || 'otra'
  })
  const [destinoOtra, setDestinoOtra] = useState(() => {
    const d = (ini.destino || '').trim()
    return d && !destinos.some((x) => x.dir === d) ? d : ''
  })
  const [fechaSel, setFechaSel] = useState('hoy') // hoy | manana | elegir
  const [fechaOtra, setFechaOtra] = useState('')
  const [masOpc, setMasOpc] = useState(false)
  const [notas, setNotas] = useState('')
  // Recurrente: chips L–V / S / D (multiselección de bloques de días).
  const [rec, setRec] = useState(!!regla)
  const [dLV, setDLV] = useState(regla ? (regla.dias || []).some((d) => d >= 1 && d <= 5) : true)
  const [dS, setDS] = useState(regla ? (regla.dias || []).includes(6) : false)
  const [dD, setDD] = useState(regla ? (regla.dias || []).includes(0) : false)
  const [hora, setHora] = useState(regla?.hora || '')
  const [fin, setFin] = useState(regla?.fin || '')
  const [ocupado, setOcupado] = useState(false)

  // Sin órdenes previas no hay catálogo (ni jobId válido): la hoja lo explica.
  const sinCatalogo = materiales.length === 0 || !recientes.some((o) => o.jobId)
  // ESTIMADO: precio por tonelada de la orden más reciente del mismo material
  // (precioCliente ya viene fusionado desde bulk_orderPay_cliente en `ordenes`).
  const refPrecio = recientes.find((o) => o.material === material && n(o.precioCliente) > 0 && n(o.pesoReal ?? o.pesoEstimado) > 0)
  const porTon = refPrecio ? n(refPrecio.precioCliente) / n(refPrecio.pesoReal ?? refPrecio.pesoEstimado) : null
  const estimado = porTon && Number(cantidad) > 0 ? porTon * Number(cantidad) : null

  const pedir = async () => {
    const dir = destinoSel === 'otra' ? destinoOtra.trim() : destinoSel
    const ton = Number(cantidad)
    // jobId: el de la dirección conocida; con "Otra" el del material elegido
    // (o el de la regla/orden origen si la dirección no cambió).
    const jobId = destinoSel !== 'otra'
      ? destinos.find((x) => x.dir === destinoSel)?.jobId
      : (ini.destino && dir === ini.destino.trim() && ini.jobId) ? ini.jobId : jobDeMaterial(material)
    if (!material || !(ton > 0) || !dir || !jobId) { window.alert(t('Elige material, cantidad y destino.')); return }
    const fecha = fechaSel === 'hoy' ? ymdLocal(0) : fechaSel === 'manana' ? ymdLocal(1) : fechaOtra
    if (!rec && !fecha) { window.alert(t('Elige la fecha.')); return }
    const dias = [...(dLV ? [1, 2, 3, 4, 5] : []), ...(dS ? [6] : []), ...(dD ? [0] : [])]
    if (rec && dias.length === 0) { window.alert(t('Elige al menos un día.')); return }
    setOcupado(true)
    try {
      const base = { clienteId, jobId, material, cantidadTon: ton, destino: dir }
      if (rec) {
        const datos = { ...base, clienteNombre: clienteNombre || '', dias, hora: hora || '', fin: fin || null, activa: true, pausada: regla ? !!regla.pausada : false }
        if (regla) await guardar('recurringOrders', regla.id, datos)
        else await crear('recurringOrders', tenantId, datos)
        // El pedido de la PRIMERA fecha solo si es hoy/mañana; los siguientes
        // los crea el backend según la regla.
        if (!regla && fecha && fecha <= ymdLocal(1)) {
          await crear('pedidos', tenantId, { ...base, fecha, ...(notas.trim() ? { notas: notas.trim() } : {}), estado: 'pendiente' })
        }
        onListo(t('Regla guardada'))
      } else {
        await crear('pedidos', tenantId, { ...base, fecha, ...(notas.trim() ? { notas: notas.trim() } : {}), estado: 'pendiente' })
        onListo(t('Pedido enviado'))
      }
    } catch (e) { window.alert(t('No se pudo crear el pedido: ') + (e?.message || '')); setOcupado(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50" onClick={ocupado ? undefined : onClose}>
      <div className="mp-app flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-card bg-mp-cream p-4 pb-[max(env(safe-area-inset-bottom),16px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-pill bg-white text-mp-navy shadow-card">
            {regla ? <Repeat size={18} strokeWidth={1.75} /> : <Plus size={18} strokeWidth={1.75} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-mp-ink">{regla ? t('Editar recurrente') : t('Nuevo pedido')}</div>
            <div className="truncate text-[12px] text-mp-ink-2">{regla ? t('Los cambios aplican desde el próximo día.') : t('La oficina lo recibe al instante.')}</div>
          </div>
          <IconButton icon={X} label={t('Cerrar')} onClick={onClose} />
        </div>

        {sinCatalogo ? (
          <div className="py-8 text-center text-[13px] text-mp-ink-2">{t('Aún no puedes pedir aquí: tus materiales y destinos salen de tus órdenes anteriores.')}</div>
        ) : (
          <>
            <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
              {/* 1) Material: los últimos 6 usados. */}
              <div>
                <div className="mb-1.5 text-[12px] text-mp-ink-2">{t('Material')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {materiales.map((m) => <Chip key={m} on={material === m} onClick={() => setMaterial(m)}>{t(m)}</Chip>)}
                </div>
              </div>

              {/* 2) Cantidad: número grande con sufijo ton + estimado si hay precio. */}
              <div>
                <div className="mb-1.5 text-[12px] text-mp-ink-2">{t('Cantidad')}</div>
                <div className="flex items-baseline justify-center gap-2 rounded-card bg-white p-3 shadow-card">
                  <input value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder="0" autoFocus={!regla}
                    className="w-32 bg-transparent text-center text-[28px] font-medium text-mp-ink outline-none placeholder:text-mp-ink-2/40" />
                  <span className="text-[15px] text-mp-ink-2">{t('ton')}</span>
                </div>
                {estimado != null && (
                  <div className="mt-1 text-center text-[12px] text-mp-ink-2">{t('Precio estimado')}: <span className="font-medium text-mp-ink">{money(estimado)}</span></div>
                )}
              </div>

              {/* 3) Destino: últimas 4 direcciones + "Otra" (texto libre). */}
              <div>
                <div className="mb-1.5 text-[12px] text-mp-ink-2">{t('Destino')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {destinos.map((d) => <Chip key={d.dir} on={destinoSel === d.dir} onClick={() => setDestinoSel(d.dir)} className="max-w-[260px]">{d.dir}</Chip>)}
                  <Chip on={destinoSel === 'otra'} onClick={() => setDestinoSel('otra')}>{t('Otra')}</Chip>
                </div>
                {destinoSel === 'otra' && (
                  <input value={destinoOtra} onChange={(e) => setDestinoOtra(e.target.value)} placeholder={t('Dirección de entrega…')}
                    className="mt-1.5 h-11 w-full rounded-pill bg-white px-4 text-[14px] text-mp-ink shadow-card outline-none placeholder:text-mp-ink-2" />
                )}
              </div>

              {/* 4) Fecha: Hoy / Mañana / Elegir (una regla recurrente no lleva fecha). */}
              {!regla && (
                <div>
                  <div className="mb-1.5 text-[12px] text-mp-ink-2">{t('Fecha')}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip on={fechaSel === 'hoy'} onClick={() => setFechaSel('hoy')}>{t('Hoy')}</Chip>
                    <Chip on={fechaSel === 'manana'} onClick={() => setFechaSel('manana')}>{t('Mañana')}</Chip>
                    <Chip on={fechaSel === 'elegir'} onClick={() => setFechaSel('elegir')}>{t('Elegir')}</Chip>
                    {fechaSel === 'elegir' && (
                      <input type="date" value={fechaOtra} min={ymdLocal(0)} onChange={(e) => setFechaOtra(e.target.value)}
                        className="h-10 rounded-pill bg-white px-3 text-[13px] text-mp-ink shadow-card outline-none" />
                    )}
                  </div>
                </div>
              )}

              {/* Repetir cada…: días L–V / S / D + hora y fecha fin opcionales. */}
              <div className="rounded-card bg-white p-3 shadow-card">
                <button type="button" onClick={() => setRec(!rec)} className="flex w-full items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[14px] font-medium text-mp-ink"><Repeat size={16} strokeWidth={1.75} className="text-mp-ink-2" /> {t('Repetir cada…')}</span>
                  <span className={`relative h-6 w-11 flex-shrink-0 rounded-pill transition ${rec ? 'bg-mp-navy' : 'bg-mp-line'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-pill bg-white shadow-card transition-all ${rec ? 'left-[22px]' : 'left-0.5'}`} />
                  </span>
                </button>
                {rec && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Chip on={dLV} onClick={() => setDLV(!dLV)} className={dLV ? '' : '!bg-mp-cream'}>L–V</Chip>
                      <Chip on={dS} onClick={() => setDS(!dS)} className={dS ? '' : '!bg-mp-cream'}>S</Chip>
                      <Chip on={dD} onClick={() => setDD(!dD)} className={dD ? '' : '!bg-mp-cream'}>D</Chip>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[12px] text-mp-ink-2">{t('Hora (opcional)')}</span>
                        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-10 w-full rounded-pill bg-mp-cream px-3 text-[13px] text-mp-ink outline-none" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[12px] text-mp-ink-2">{t('Hasta (opcional)')}</span>
                        <input type="date" value={fin || ''} min={ymdLocal(0)} onChange={(e) => setFin(e.target.value)} className="h-10 w-full rounded-pill bg-mp-cream px-3 text-[13px] text-mp-ink outline-none" />
                      </label>
                    </div>
                    <p className="m-0 text-[11px] text-mp-ink-2">{t('El pedido se crea solo cada día elegido a las 00:05.')}</p>
                  </div>
                )}
              </div>

              {/* Más opciones plegado: notas para la oficina. */}
              {!regla && (
                <div>
                  <button type="button" onClick={() => setMasOpc(!masOpc)} className="text-[13px] font-medium text-mp-ink-2">{masOpc ? '−' : '+'} {t('Más opciones')}</button>
                  {masOpc && (
                    <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder={t('Notas para la oficina…')}
                      className="mt-1.5 w-full rounded-[18px] bg-white p-3 text-[14px] text-mp-ink shadow-card outline-none placeholder:text-mp-ink-2" />
                  )}
                </div>
              )}
            </div>

            {/* ÚNICO dorado de la hoja. */}
            <PrimaryButton onClick={pedir} disabled={ocupado} className="mt-2 flex-shrink-0">
              {regla ? t('Guardar cambios') : t('Pedir')}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  )
}
