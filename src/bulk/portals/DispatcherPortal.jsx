// ============================================================================
// BULK · Portal del DISPATCHER — REDISEÑO MÓVIL 2026 (Bloque 2.3).
// Carcasa app (crema, header sin barra, FloatingTabBar) para el despacho desde
// el teléfono: cola por asignar, asignación manual (mismo flujo que OrdenDetalle),
// mapa en vivo, chats del staff y todas las órdenes del tenant (el dispatcher es
// STAFF: lee todo, igual que la pantalla Órdenes de escritorio).
// El escritorio completo sigue existiendo: el botón "Escritorio" (prop opcional
// `irEscritorio`) regresa a esa vista; si la prop no llega, el botón se oculta.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Navigation, MessageSquare, ClipboardList, Monitor, Grid2x2, LogOut,
  Search, ArrowLeft, UserPlus, Wifi, User, Truck, Package, MapPin, AlertTriangle,
  Languages, KeyRound, Camera, X, Zap, Building2,
} from 'lucide-react'
import Avatar from '../components/Avatar'
import AvisosMensajes from '../components/AvisosMensajes'
import CambiarClave from '../components/CambiarClave'
import ChatOrden from '../components/ChatOrden'
import PanelConversaciones from '../components/PanelConversaciones'
import GruposModal from '../components/GruposModal'
import BotonReunion from '../components/BotonReunion'
import MapaVivo from '../pages/MapaVivo'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { useAvatares } from '../data/useCodigoUsuario'
import { useGrupos } from '../data/useGrupos'
import { menuGrupoConv } from '../data/grupos'
import { conversacionesAdmin } from '../domain/conversaciones'
import { onAbrirConversacion } from '../data/notifsMensajes'
import CampanaNotificaciones from '../components/CampanaNotificaciones'
import { construirNotificaciones } from '../domain/notificaciones'
import { asignarOrdenManual } from '../data/asignacionManual'
import { guardarAvatar } from '../data/repo'
import { leerFotoReducida } from '../components/foto'
import { choferDisponible, equipoCompatible, enriquecerConRoster } from '../domain/asignacionAuto'
import { diagnosticarOrden } from '../domain/diagnosticoAsignacion'
import { calcularPagoChofer, configDeChofer } from '../domain/pagoChofer'
import { alertaOrden } from '../domain/alertas'
import { tsMillis } from '../data/chatKeys'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR, ORDEN_HITOS } from '../domain/constants'
import { Cargando, Badge as UiBadge } from '../../components/ui'
// Kit del REDISEÑO 2026 (Bloque 1): carcasa, tarjetas, filas y barra flotante.
import { IconButton, PrimaryButton, SecondaryButton, FeatureCard, StatCard, Card as MpCard, ListRow, StatusPill, FloatingTabBar } from '../ui'
import { useLang, LangToggle } from '../../i18n'

// ── Grupos de estado (mismo criterio que la pantalla Órdenes del staff) ──────
const POR_ASIGNAR_EST = [E.CREADA, E.EN_COLA]           // sin chofer ofrecido
const EN_PROCESO_EST = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const COMPLETADAS_EST = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
// Color del punto de los StatusPill 2026 según el color de badge del estado.
const PILL_COLOR = { green: 'var(--mp-green)', blue: 'var(--mp-blue)', gold: 'var(--mp-gold)', red: 'var(--mp-red)', navy: 'var(--mp-navy)', slate: 'var(--mp-ink-2)' }
const pillEstado = (estado) => PILL_COLOR[ORDEN_ESTADO_COLOR[estado]] || 'var(--mp-ink-2)'

// "hace X" corto para tiempos de espera (cola/atrasos).
const haceTxt = (v, t) => {
  const ms = tsMillis(v) || Date.parse(v || '')
  if (!Number.isFinite(ms) || !ms) return ''
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000))
  if (min < 1) return t('ahora')
  if (min < 60) return `${min} ${t('min')}`
  if (min < 1440) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} d`
}

export default function DispatcherPortal({ irEscritorio }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const { usuario, tenantId, rol, cerrarSesion } = useBulkAuth()
  const avatares = useAvatares()

  // ── Datos (el dispatcher es STAFF: lee todas las órdenes del tenant) ───────
  const { datos: ordenes, cargando } = useOrdenesConPagos()
  const { datos: carriers } = useColeccion('carriers')
  const { datos: carrierConfigs } = useColeccion('carrierConfig')
  const { datos: presencias } = useColeccion('presence')
  const { datos: clientes } = useColeccion('clients')
  const { datos: plantas } = useColeccion('plants')
  const { datos: incidencias } = useColeccion('incidents')
  const { datos: mensajes } = useColeccion('messages')
  const { datos: usuarios } = useColeccion('users')
  const { datos: jobs } = useColeccion('jobs')

  const [tab, setTab] = useState('tablero')
  const [ordenSel, setOrdenSel] = useState(null)   // orden abierta en detalle (vista apilada)
  const [asignar, setAsignar] = useState(null)     // orden en el sheet de asignación manual
  const [chatDe, setChatDe] = useState(null)       // orden cuyo chat está abierto (capa completa)
  const [verDiag, setVerDiag] = useState(false)    // diagnóstico de la auto-asignación (botón Auto)
  const [verGrupos, setVerGrupos] = useState(false)

  // Reloj lento (30 s): refresca tiempos de espera, atrasos y frescura de presencia.
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])

  const clientesMap = useMemo(() => { const m = {}; for (const c of clientes || []) m[c.id] = c; return m }, [clientes])
  const plantasMap = useMemo(() => { const m = {}; for (const p of plantas || []) m[p.id] = p; return m }, [plantas])
  const nombreCliente = (o) => o.clienteNombre || clientesMap[o.clienteId]?.nombre || t('Cliente')
  const nombrePlanta = (o) => plantasMap[o.plantaId]?.nombre || t('Planta')

  // ── Colas derivadas (mismo criterio que Ordenes.jsx del staff) ─────────────
  const porAsignar = useMemo(() => (ordenes || [])
    .filter((o) => POR_ASIGNAR_EST.includes(o.estado))
    .sort((a, b) => (tsMillis(a.creadoEn) || 0) - (tsMillis(b.creadoEn) || 0)), [ordenes])
  const emparejando = useMemo(() => ordenes.filter((o) => o.estado === E.NOTIFICANDO), [ordenes])
  const enRuta = useMemo(() => ordenes.filter((o) => EN_PROCESO_EST.includes(o.estado)), [ordenes])
  // "Listas" = completadas HOY (con hito de entrega/liberación del día).
  const hoyStr = new Date(now).toDateString()
  const listasHoy = useMemo(() => ordenes.filter((o) => {
    if (!COMPLETADAS_EST.includes(o.estado)) return false
    const ms = tsMillis(o.hitos?.entrega || o.hitos?.liberacion)
    return ms && new Date(ms).toDateString() === hoyStr
  }), [ordenes, hoyStr])
  // Alertas: órdenes atrasadas (>3 h sin recoger/entregar) + incidencias sin resolver.
  const atrasadas = useMemo(() => ordenes.map((o) => ({ o, a: alertaOrden(o, now) })).filter((x) => x.a), [ordenes, now])
  const incAbiertas = useMemo(() => (incidencias || []).filter((i) => i.estado !== 'resuelta'), [incidencias])

  // Presencia ENRIQUECIDA con el roster (mismo criterio que el motor y su diagnóstico).
  const presenciasReales = useMemo(() => enriquecerConRoster(presencias, carriers), [presencias, carriers])
  // La orden MÁS ANTIGUA sin asignar (protagonista del tablero) y su diagnóstico.
  const siguiente = porAsignar[0] || null
  const diag = useMemo(() => (siguiente ? diagnosticarOrden(siguiente, presenciasReales, now) : null), [siguiente, presenciasReales, now])

  // ── Chats: mismas secciones que la consola de Mensajes del staff ───────────
  const cats = useMemo(
    () => conversacionesAdmin({ mensajes, ordenes, carriers, clientes, jobs, usuarios, avatares, uid: usuario?.id }),
    [mensajes, ordenes, carriers, clientes, jobs, usuarios, avatares, usuario],
  )
  const { items: gruposItems, grupos, invitaciones } = useGrupos()
  const seccionesMsg = useMemo(() => [
    { k: 'clientes', label: t('Clientes'), icon: 'cliente', items: cats.clientes, vacio: t('Sin conversaciones con clientes.') },
    { k: 'transportistas', label: t('Transportistas'), icon: 'transportista', items: cats.transportistas, vacio: t('Sin conversaciones con transportistas.') },
    { k: 'conductores', label: t('Conductores'), icon: 'chofer', items: cats.conductores, vacio: t('Sin conversaciones con conductores (por viaje/carga) aún.') },
    { k: 'operaciones', label: t('Operaciones'), icon: 'operacion', items: cats.operaciones, vacio: t('Sin conversaciones internas con el equipo del staff.') },
    { k: 'grupos', label: t('Grupos'), icon: 'grupo', items: gruposItems, vacio: t('Aún no perteneces a ningún grupo.') },
  ], [cats, gruposItems, t])
  const noLeidosMsg = useMemo(
    () => seccionesMsg.reduce((a, s) => a + (s.items || []).reduce((b, c) => b + (c.noLeidos || 0), 0), 0),
    [seccionesMsg],
  )
  // Campana 2026 (Bloque 6): mismos avisos accionables que el centro del staff
  // (SLA/riesgo + incidencias + mensajes); las facturas/documentos no aplican
  // al dispatcher.
  const notifsDisp = useMemo(
    () => construirNotificaciones({ ordenes, incidencias: incAbiertas, mensajesNuevos: noLeidosMsg, ahoraMs: now }),
    [ordenes, incAbiertas, noLeidosMsg, now],
  )
  // Candidatos a grupos: el staff puede enumerar a todos los usuarios del tenant.
  const candidatosGrupo = useMemo(
    () => (usuarios || []).filter((u) => u.id !== usuario?.id).map((u) => ({ uid: u.id, nombre: u.nombre || u.email || t('Usuario'), rol: u.rol, foto: null })),
    [usuarios, usuario, t],
  )
  // Abrir una conversación al tocar su aviso flotante: salta a la pestaña Chats.
  const [abrirExterno, setAbrirExterno] = useState(null)
  useEffect(() => onAbrirConversacion((k) => { setTab('chats'); if (k && k !== '__mensajes__') { setAbrirExterno(k); setTimeout(() => setAbrirExterno(null), 0) } }), [])

  // Abre el detalle de una orden DENTRO del portal (vista apilada de Órdenes).
  const abrirOrden = (o) => { setOrdenSel(o.id); setTab('ordenes') }
  const ordenAbierta = useMemo(() => ordenes.find((o) => o.id === ordenSel) || null, [ordenes, ordenSel])

  if (cargando) return <div className="mp-app grid min-h-screen place-items-center"><Cargando /></div>

  return (
    // Carcasa móvil 2026: fondo crema, altura fija (h-dvh), el cuerpo desplaza por
    // dentro; en tablet/escritorio se ensancha a 640 y deja sitio a la barra lateral.
    <div className="mp-app h-dvh mx-auto flex max-w-md flex-col overflow-hidden md:max-w-[640px] md:pl-24">
      {/* Aviso VISUAL rápido de mensajes nuevos. */}
      <AvisosMensajes />
      <header className="mp-app-safe flex items-center gap-3 px-4 pb-1 pt-2">
        <button type="button" onClick={() => setTab('perfil')} title={t('Mi perfil')} className="transition active:scale-95">
          <Avatar foto={avatares[usuario?.id]} nombre={usuario?.nombre} size={40} redondo />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-mp-ink">{t('Hola')}, {String(usuario?.nombre || '').split(' ')[0]} 👋</div>
          <div className="truncate text-[12px] text-mp-ink-2">{t('Dispatcher')}</div>
        </div>
        {/* "Escritorio" solo si el contenedor pasó la prop (si no, se oculta). */}
        <CampanaNotificaciones notifs={notifsDisp} claveLS="bulk_notif_dispatcher" />
        {irEscritorio && <IconButton icon={Monitor} label={t('Escritorio')} onClick={() => irEscritorio?.()} />}
        <IconButton icon={Grid2x2} label={t('Cambiar módulo')} onClick={() => navigate('/elegir')} />
        <IconButton icon={LogOut} label={t('Salir')} onClick={cerrarSesion} />
      </header>

      {/* En Chats la página NO desplaza: el panel mide exacto y desplaza por dentro. */}
      <main className={`relative flex-1 p-3 ${tab === 'chats' ? 'overflow-hidden pb-2' : 'overflow-y-auto pb-32'}`}>

        {/* ── TABLERO (Bloque 2.3): el despacho de un vistazo ─────────────── */}
        {tab === 'tablero' && (
          <div className="space-y-2 px-1">
            <div className="pb-1 pt-1">
              <div className="text-[12px] text-mp-ink-2">{emparejando.length > 0 ? `${emparejando.length} ${t('orden(es) ofreciéndose a un chofer ahora')}` : t('Asignación automática activa')}</div>
              <h1 className="m-0 text-[22px] font-medium text-mp-ink">{t('Despacho')}</h1>
            </div>

            {/* Fila de stats: cola · en ruta · listas hoy */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard oscura etiqueta={t('En cola')} valor={porAsignar.length + emparejando.length} />
              <StatCard etiqueta={t('En ruta')} valor={enRuta.length} />
              <StatCard etiqueta={t('Listas')} valor={listasHoy.length} />
            </div>

            {/* Protagonista: la orden MÁS ANTIGUA sin asignar. */}
            <FeatureCard>
              {siguiente ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-mp-cream/70">{t('Por asignar')} · {porAsignar.length}</span>
                    <StatusPill sobreNavy color="var(--mp-gold)">{t('esperando')} {haceTxt(siguiente.creadoEn, t)}</StatusPill>
                  </div>
                  <div className="mt-2 truncate text-[22px] font-medium leading-tight">{nombreCliente(siguiente)}</div>
                  <div className="mt-1 truncate text-[13px] text-mp-cream/80">
                    {siguiente.numero} · {t(siguiente.material || 'material s/e')} · {siguiente.pesoReal ?? siguiente.pesoEstimado} ton{siguiente.tipoEquipo ? ` · ${siguiente.tipoEquipo}` : ''}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-mp-cream/60">{nombrePlanta(siguiente)} → {siguiente.direccionEntrega || '—'}</div>
                  {/* ÚNICO botón dorado de la pantalla: abrir el flujo de asignación manual. */}
                  <PrimaryButton className="mt-4" icon={UserPlus} onClick={() => setAsignar(siguiente)}>{t('Asignar')}</PrimaryButton>
                  {/* La auto-asignación es un motor PASIVO (hook en el panel del staff):
                      el botón "Auto" muestra el diagnóstico de por qué no se asignó. */}
                  <SecondaryButton className="mt-2 !border-mp-cream/40 !text-mp-cream" icon={Zap} onClick={() => setVerDiag((v) => !v)}>{t('Auto')}</SecondaryButton>
                  {verDiag && diag && (
                    <div className="mt-3 rounded-[14px] bg-white/10 p-3 text-[12px] leading-snug text-mp-cream/90">
                      <div className="font-medium">{diag.razon.tipo === 'ok' ? t('El motor la asignará en breve') : t('Por qué no se ha asignado sola')}</div>
                      <div className="mt-1">{t(diag.razon.texto)}</div>
                      <div className="mt-1.5 text-mp-cream/60">{diag.enLinea} {t('chofer(es) en línea')} · {diag.compatibles} {t('con equipo compatible')}</div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <StatusPill sobreNavy color="var(--mp-green)">{t('Todo asignado')}</StatusPill>
                  <div className="mt-2 text-[22px] font-medium leading-tight">{t('No hay órdenes esperando chofer')} 🎉</div>
                  <div className="mt-1 text-[13px] text-mp-cream/80">{enRuta.length} {t('viaje(s) en curso ahora mismo')}</div>
                </>
              )}
            </FeatureCard>

            {/* Alertas: atrasadas + incidencias abiertas (solo si existen). */}
            {(atrasadas.length > 0 || incAbiertas.length > 0) && (
              <>
                <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Alertas')}</div>
                {atrasadas.map(({ o, a }) => (
                  <ListRow key={`atr_${o.id}`} icon={AlertTriangle} iconClass="bg-mp-red/10 text-mp-red"
                    titulo={`${o.numero} · ${nombreCliente(o)}`}
                    meta={`${a.tipo === 'recogida' ? t('sin recoger') : t('sin entregar')} · ${a.horas} h · ${t(o.material || 'material s/e')}`}
                    derecha={<StatusPill color="var(--mp-red)">{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>}
                    onClick={() => abrirOrden(o)} />
                ))}
                {incAbiertas.map((inc) => {
                  const o = inc.orden ? ordenes.find((x) => x.numero === inc.orden) : null
                  const ambar = inc.estado === 'en_proceso'
                  return (
                    <ListRow key={`inc_${inc.id}`} icon={AlertTriangle}
                      iconClass={ambar ? 'bg-mp-gold/15 text-mp-gold' : 'bg-mp-red/10 text-mp-red'}
                      titulo={`${t('Incidencia')}: ${t(inc.tipo || '')}${inc.orden ? ` · ${inc.orden}` : ''}`}
                      meta={inc.descripcion || ''}
                      derecha={<StatusPill color={ambar ? 'var(--mp-gold)' : 'var(--mp-red)'}>{t(inc.estado === 'en_proceso' ? 'En proceso' : 'Abierta')}</StatusPill>}
                      onClick={o ? () => abrirOrden(o) : undefined} />
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* ── MAPA: el mapa en vivo del staff, tal cual, dentro de la carcasa ── */}
        {tab === 'mapa' && (
          <div className="min-h-0 px-1">
            <MapaVivo />
          </div>
        )}

        {/* ── CHATS: mismas secciones que la consola de Mensajes del staff ──── */}
        {tab === 'chats' && (
          <>
            <PanelConversaciones secciones={seccionesMsg} alturaClass="h-mensajes-chofer" abrir={abrirExterno} estiloApp
              menuConversacion={(item) => menuGrupoConv({ item, grupos, uid: usuario?.id, t })}
              accion={<span className="flex items-center gap-1.5">
                <BotonReunion />
                <button type="button" onClick={() => setVerGrupos(true)} className="inline-flex items-center gap-1 rounded-pill bg-white px-3 py-1.5 text-xs font-semibold text-mp-ink shadow-card">
                  <MessageSquare size={13} strokeWidth={1.75} /> {t('Grupos')}
                  {invitaciones.length > 0 && <span className="ml-0.5 grid h-4 min-w-[16px] place-items-center rounded-pill bg-mp-gold px-1 text-[10px] font-bold text-mp-navy">{invitaciones.length}</span>}
                </button>
              </span>} />
            {verGrupos && <GruposModal grupos={grupos} invitaciones={invitaciones} candidatos={candidatosGrupo} puedeCrear uid={usuario?.id} onClose={() => setVerGrupos(false)} />}
          </>
        )}

        {/* ── ÓRDENES: lista con buscador/filtros o detalle apilado ─────────── */}
        {tab === 'ordenes' && (
          ordenAbierta
            ? <DetalleOrden t={t} orden={ordenAbierta} nombreCliente={nombreCliente} nombrePlanta={nombrePlanta}
                carriers={carriers} incidencias={incidencias} now={now}
                onVolver={() => setOrdenSel(null)} onAsignar={() => setAsignar(ordenAbierta)} onChat={() => setChatDe(ordenAbierta)} />
            : <ListaOrdenes t={t} ordenes={ordenes} nombreCliente={nombreCliente} onAbrir={abrirOrden} />
        )}

        {/* ── PERFIL (mismo patrón que TransportistaPortal) ──────────────────── */}
        {tab === 'perfil' && (
          <PerfilDispatcher t={t} usuario={usuario} tenantId={tenantId} avatares={avatares}
            navigate={navigate} cerrarSesion={cerrarSesion} irEscritorio={irEscritorio} />
        )}
      </main>

      {/* Sheet de asignación / transferencia MANUAL (mismo flujo que OrdenDetalle). */}
      {asignar && (
        <SheetAsignar t={t} orden={asignar} carriers={carriers} presencias={presencias} carrierConfigs={carrierConfigs}
          ctx={{ tenantId, usuario, rol }} onClose={() => setAsignar(null)} />
      )}

      {/* Chat de la orden abierta: capa completa con cabecera navy (estándar app). */}
      {chatDe && (
        <div className="fixed inset-0 z-[70] mx-auto flex max-w-md flex-col bg-white dark:bg-slate-900">
          <ChatOrden orden={chatDe} fill estiloApp onVolver={() => setChatDe(null)} />
        </div>
      )}

      {/* Barra FLOTANTE 2026: 4 tabs, Chats SIEMPRE en tercera posición. */}
      <FloatingTabBar
        activo={tab === 'perfil' ? 'tablero' : tab}
        onSelect={(k) => { setTab(k); if (k !== 'ordenes') setOrdenSel(null) }}
        tabs={[
          { k: 'tablero', label: t('Tablero'), icon: LayoutDashboard },
          { k: 'mapa', label: t('Mapa'), icon: Navigation },
          { k: 'chats', label: t('Chats'), icon: MessageSquare, badge: noLeidosMsg },
          { k: 'ordenes', label: t('Órdenes'), icon: ClipboardList },
        ]}
      />
    </div>
  )
}

// ── Pestaña ÓRDENES: buscador pill + filtros pill + lista de filas ───────────
const FILTROS = [
  { k: 'todas', label: 'Todas' },
  { k: 'porasignar', label: 'Por asignar' },
  { k: 'enruta', label: 'En ruta' },
  { k: 'completadas', label: 'Completadas' },
]
function ListaOrdenes({ t, ordenes, nombreCliente, onAbrir }) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const pasaFiltro = (o) => filtro === 'todas'
    || (filtro === 'porasignar' && [...POR_ASIGNAR_EST, E.NOTIFICANDO].includes(o.estado))
    || (filtro === 'enruta' && EN_PROCESO_EST.includes(o.estado))
    || (filtro === 'completadas' && COMPLETADAS_EST.includes(o.estado))
  const s = q.trim().toLowerCase()
  const rows = ordenes
    .filter(pasaFiltro)
    .filter((o) => !s || `${o.numero} ${nombreCliente(o)} ${o.material || ''} ${o.choferNombre || ''}`.toLowerCase().includes(s))
    .sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))

  return (
    <div className="space-y-2 px-1">
      {/* Buscador pill */}
      <div className="relative">
        <Search size={15} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mp-ink-2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar orden, cliente, material o chofer…')}
          className="h-11 w-full rounded-pill bg-white pl-9 pr-4 text-[14px] text-mp-ink shadow-card outline-none placeholder:text-mp-ink-2" />
      </div>
      {/* Filtros pill */}
      <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTROS.map((f) => (
          <button key={f.k} type="button" onClick={() => setFiltro(f.k)}
            className={`flex-shrink-0 rounded-pill px-3.5 py-1.5 text-[12px] font-medium transition ${filtro === f.k ? 'bg-mp-navy text-mp-cream' : 'bg-white text-mp-ink-2 shadow-card'}`}>
            {t(f.label)}
          </button>
        ))}
        <span className="ml-auto flex-shrink-0 self-center text-[12px] text-mp-ink-2">{rows.length} {t('órdenes')}</span>
      </div>

      {rows.length === 0 ? (
        <MpCard className="py-10 text-center text-[13px] text-mp-ink-2">{t('Ninguna orden coincide con el filtro.')}</MpCard>
      ) : rows.map((o) => (
        <ListRow key={o.id} icon={Package}
          titulo={`${o.numero} · ${nombreCliente(o)}`}
          meta={`${t(o.material || 'material s/e')} · ${o.pesoReal ?? o.pesoEstimado} ton${o.choferNombre ? ` · ${o.choferNombre}` : ''}`}
          derecha={<StatusPill color={pillEstado(o.estado)}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>}
          onClick={() => onAbrir(o)} chevron={false} />
      ))}
    </div>
  )
}

// ── Detalle de una orden DENTRO del portal (vista apilada con flecha atrás) ──
const NO_ASIGNABLES = [E.CANCELADA, E.ENTREGADA, E.LIBERADA, E.CERRADA]
function DetalleOrden({ t, orden: o, nombreCliente, nombrePlanta, carriers, incidencias, now, onVolver, onAsignar, onChat }) {
  const carrier = (carriers || []).find((c) => c.id === o.transportistaId)
  const incs = (incidencias || []).filter((i) => i.orden && i.orden === o.numero)
  const atr = alertaOrden(o, now)
  const hora = (ts) => (ts ? new Date(tsMillis(ts) || ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null)
  return (
    <div className="space-y-2 px-1">
      <div className="flex items-center gap-2">
        <IconButton icon={ArrowLeft} label={t('Volver')} onClick={onVolver} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[15px] font-medium text-mp-ink">{o.numero}</div>
          <div className="truncate text-[12px] text-mp-ink-2">{nombreCliente(o)}</div>
        </div>
        <StatusPill color={pillEstado(o.estado)}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>
      </div>

      {atr && (
        <MpCard className="flex items-center gap-2 !p-3 text-[13px] font-medium" >
          <AlertTriangle size={18} strokeWidth={1.75} className="flex-shrink-0 text-mp-red" />
          <span style={{ color: 'var(--mp-red)' }}>{atr.tipo === 'recogida' ? t('Lleva más de 3 h sin recogerse') : t('Lleva más de 3 h sin entregarse')} ({atr.horas} h)</span>
        </MpCard>
      )}

      {/* Lo esencial de la orden (solo datos reales del modelo). */}
      <MpCard className="space-y-2.5">
        <DatoFila icon={Building2} label={t('Cliente')} val={nombreCliente(o)} />
        <DatoFila icon={Package} label={t('Material')} val={`${t(o.material || 'material s/e')} · ${o.pesoReal ?? o.pesoEstimado} ton${o.tipoEquipo ? ` · ${o.tipoEquipo}` : ''}`} />
        <DatoFila icon={MapPin} label={t('Ruta')} val={`${nombrePlanta(o)} → ${o.direccionEntrega || '—'}`} />
        <DatoFila icon={Truck} label={t('Transporte')} val={carrier?.nombre || t('sin asignar')} />
        <DatoFila icon={User} label={t('Chofer')} val={o.choferNombre || t('sin asignar')} />
      </MpCard>

      {/* Trayectoria: solo los hitos ya registrados (los pendientes no se pintan). */}
      {ORDEN_HITOS.some((h) => o.hitos?.[h.key]) && (
        <MpCard>
          <div className="mb-2 text-[12px] text-mp-ink-2">{t('Trayectoria')}</div>
          <div className="space-y-1.5">
            {ORDEN_HITOS.filter((h) => o.hitos?.[h.key]).map((h) => (
              <div key={h.key} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-mp-ink">{t(h.label)}</span>
                <span className="flex-shrink-0 text-[12px] text-mp-ink-2">{hora(o.hitos[h.key])}</span>
              </div>
            ))}
          </div>
        </MpCard>
      )}

      {/* Incidencias de la orden (si las hay). */}
      {incs.length > 0 && incs.map((inc) => (
        <ListRow key={inc.id} icon={AlertTriangle}
          iconClass={inc.estado === 'resuelta' ? 'bg-mp-green/10 text-mp-green' : 'bg-mp-red/10 text-mp-red'}
          titulo={`${t('Incidencia')}: ${t(inc.tipo || '')}`} meta={inc.descripcion || ''}
          derecha={<StatusPill color={inc.estado === 'resuelta' ? 'var(--mp-green)' : inc.estado === 'en_proceso' ? 'var(--mp-gold)' : 'var(--mp-red)'}>{t(inc.estado || '')}</StatusPill>}
          chevron={false} />
      ))}

      {/* ÚNICO botón dorado de esta pantalla: asignar / transferir. */}
      {!NO_ASIGNABLES.includes(o.estado) && (
        <PrimaryButton icon={UserPlus} onClick={onAsignar}>{o.choferId ? t('Transferir orden') : t('Asignar manualmente')}</PrimaryButton>
      )}
      <SecondaryButton icon={MessageSquare} onClick={onChat}>{t('Chat de la orden')}</SecondaryButton>
    </div>
  )
}

function DatoFila({ icon: Icon, label, val }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} strokeWidth={1.75} className="mt-0.5 flex-shrink-0 text-mp-ink-2" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-mp-ink-2">{label}</div>
        <div className="text-[14px] font-medium text-mp-ink">{val}</div>
      </div>
    </div>
  )
}

// ── Sheet de asignación / transferencia MANUAL (Bloque 2.3) ─────────────────
// Mismo flujo que el ModalAsignar de OrdenDetalle: candidatos = choferes del
// roster de cada transportista, marca quién está EN LÍNEA, avisa si el equipo no
// coincide (se puede asignar igual, con confirmación) y fija el pago del chofer
// según la config de su transportista. La escritura es asignarOrdenManual (la
// orden se OFRECE: el chofer recibe push y debe aceptar).
function SheetAsignar({ t, orden, carriers, presencias, carrierConfigs, ctx, onClose }) {
  const [busca, setBusca] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const now = Date.now()
  const claveN = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // uid de choferes en línea y libres (para el badge y el orden de la lista).
  const online = new Map()
  for (const p of (presencias || [])) {
    if (p.uid && choferDisponible(p, now)) online.set(p.uid, p)
  }
  // Candidatos = choferes del roster de cada transportista (con su uid si ya entró).
  const candidatos = []
  for (const c of (carriers || [])) {
    for (const d of (c.choferes || [])) {
      const uid = d.uid || null
      const equipos = (d.equipos && d.equipos.length) ? d.equipos : (d.equipo ? [d.equipo] : [])
      candidatos.push({
        key: `${c.id}:${d.id || d.nombre}`,
        uid, id: d.id || null, nombre: d.nombre || '—',
        carrierId: c.id, carrierNombre: c.nombre || '',
        equipos, enLinea: !!(uid && online.has(uid)),
        compatible: equipoCompatible(equipos, orden.tipoEquipo),
        actual: (uid && uid === orden.choferId) || (d.id && d.id === orden.choferId) || (orden.choferNombre && claveN(orden.choferNombre) === claveN(d.nombre)),
      })
    }
  }
  const q = busca.trim().toLowerCase()
  const lista = candidatos
    .filter((x) => !q || x.nombre.toLowerCase().includes(q) || x.carrierNombre.toLowerCase().includes(q))
    .sort((a, b) => (b.enLinea - a.enLinea) || (b.compatible - a.compatible) || a.nombre.localeCompare(b.nombre))

  const asignar = async (cand) => {
    if (cand.actual) { window.alert(t('Esta orden ya está con ese chofer.')); return }
    if (!cand.compatible && !window.confirm(`${t('Ese chofer no tiene el equipo que pide la orden')} (${orden.tipoEquipo || '—'}). ${t('¿Asignar de todos modos?')}`)) return
    setOcupado(true)
    try {
      // Pago del chofer según la config de su transportista (consistente con las
      // demás vías de asignación). cand.id es el id del roster que usa la config.
      const cfg = (carrierConfigs || []).find((c) => c.id === cand.carrierId)?.pagoChoferes || {}
      const pago = cand.id ? calcularPagoChofer(orden.precioTransportista, configDeChofer(cfg, cand.id)) : null
      await asignarOrdenManual(ctx.tenantId, orden, cand, ctx, { pagoChofer: pago != null ? pago : undefined })
      onClose()
    } catch (e) {
      window.alert(t('No se pudo asignar: ') + (e?.message || ''))
      setOcupado(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={ocupado ? undefined : onClose}>
      <div className="mp-app flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-card bg-mp-cream p-4 pb-[max(env(safe-area-inset-bottom),16px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-pill bg-white text-mp-navy shadow-card"><UserPlus size={18} strokeWidth={1.75} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-mp-ink">{orden.choferId ? t('Transferir orden') : t('Asignar orden')} {orden.numero}</div>
            <div className="truncate text-[12px] text-mp-ink-2">{t('Pide equipo:')} {orden.tipoEquipo || t('cualquiera')} · {t('el chofer recibe la oferta y debe aceptarla')}</div>
          </div>
          <IconButton icon={X} label={t('Cerrar')} onClick={onClose} />
        </div>
        <div className="relative mb-2">
          <Search size={15} strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mp-ink-2" />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('Buscar chofer o transportista…')}
            className="h-11 w-full rounded-pill bg-white pl-9 pr-4 text-[14px] text-mp-ink shadow-card outline-none placeholder:text-mp-ink-2" />
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {lista.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-mp-ink-2">{t('No hay choferes en el roster. Agrégalos en Transportistas.')}</div>
          ) : lista.map((cand) => (
            <button key={cand.key} type="button" onClick={() => asignar(cand)} disabled={ocupado || cand.actual}
              className={`flex w-full items-center gap-2.5 rounded-row bg-white p-3 text-left shadow-card transition active:scale-[0.99] disabled:opacity-60 ${cand.actual ? 'ring-1 ring-mp-green' : ''}`}>
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-pill bg-mp-cream text-mp-navy"><User size={16} strokeWidth={1.75} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-medium text-mp-ink">{cand.nombre}</span>
                  {cand.enLinea && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-pill" style={{ background: 'var(--mp-green)' }} title={t('en línea')} />}
                  {cand.actual && <UiBadge color="green">{t('actual')}</UiBadge>}
                </span>
                <span className="block truncate text-[12px] text-mp-ink-2">{cand.carrierNombre} · {cand.equipos.length ? cand.equipos.join(', ') : t('sin equipo')}</span>
              </span>
              {cand.enLinea && <Wifi size={14} strokeWidth={1.75} className="flex-shrink-0" style={{ color: 'var(--mp-green)' }} />}
              {!cand.compatible && <StatusPill color="var(--mp-gold)">≠ {t('equipo')}</StatusPill>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Pestaña PERFIL (mismo patrón que TransportistaPortal): avatar editable,
// idioma, contraseña, modo escritorio, módulo y salir. Sin datos inventados.
function PerfilDispatcher({ t, usuario, tenantId, avatares, navigate, cerrarSesion, irEscritorio }) {
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
      <MpCard>
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
            <div className="mt-1.5"><StatusPill color="var(--mp-gold)">{t('Dispatcher')}</StatusPill></div>
          </div>
        </div>
      </MpCard>

      <MpCard className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[14px] font-medium text-mp-ink"><Languages size={18} strokeWidth={1.75} className="text-mp-ink-2" /> {t('Idioma')}</span>
        <LangToggle />
      </MpCard>

      {/* Volver al panel COMPLETO de escritorio (si el contenedor pasó la prop). */}
      {irEscritorio && <ListRow icon={Monitor} titulo={t('Modo escritorio')} meta={t('Abrir el panel completo del dispatcher')} onClick={() => irEscritorio?.()} />}
      <ListRow icon={KeyRound} titulo={t('Cambiar contraseña')} onClick={() => setVerClave(true)} />
      <ListRow icon={Grid2x2} titulo={t('Cambiar módulo')} onClick={() => navigate('/elegir')} />
      <ListRow icon={LogOut} iconClass="bg-mp-red/10 text-mp-red" titulo={t('Cerrar sesión')} onClick={cerrarSesion} />

      {verClave && <CambiarClave onClose={() => setVerClave(false)} />}
    </div>
  )
}
