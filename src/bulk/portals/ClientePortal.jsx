import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, ClipboardList, FileText, PenLine, LayoutDashboard, Layers, MessageSquare, Navigation, Home, Package, Plus, Grid2x2, LogOut, KeyRound } from 'lucide-react'
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
import { where, guardar } from '../data/repo'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR } from '../domain/constants'
import { generarFacturaPDF } from '../data/facturaPDF'
import FirmaPad from '../components/FirmaPad'
import BuscadorFacturas from '../components/BuscadorFacturas'
import { filtrarFacturas, hayFiltroActivo, FILTRO_FACTURAS_VACIO } from '../domain/filtroFacturas'
import { estadoDocumento } from '../domain/facturacion'
import { Card, KPI, Badge, Boton, Cargando, EstadoVacio, Tabla } from '../../components/ui'
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
  const noLeidosMsg = useMemo(() => Object.values(resumenMsg).reduce((a, r) => a + (r.noLeidos || 0), 0), [resumenMsg])
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
      <div className="mp-app h-dvh mx-auto flex max-w-md flex-col overflow-hidden">
        <IndicadorConexion />
        {/* Aviso VISUAL rápido de mensajes nuevos. */}
        <AvisosMensajes />
        <header className="mp-app-safe flex items-center gap-3 px-4 pb-1 pt-2">
          <button type="button" onClick={() => setTab('perfil')} title={t('Mi perfil')} className="transition active:scale-95">
            <Avatar foto={miFotoHome} nombre={usuario?.nombre} size={40} redondo />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium text-mp-ink">{usuario?.nombre}</div>
            <div className="truncate text-[12px] text-mp-ink-2">{empresaCliente ? `${empresaCliente} · ` : ''}{t('Cliente')}</div>
          </div>
          <CampanaNotificaciones notifs={notifsC} claveLS="bulk_notif_cliente" />
          <IconButton icon={Grid2x2} label={t('Cambiar módulo')} onClick={() => navigate('/elegir')} />
          <IconButton icon={LogOut} label={t('Salir')} onClick={cerrarSesion} />
        </header>

        {/* En la pestaña Mensajes la página NO desplaza (overflow-hidden): el panel
            de chats mide exacto y desplaza por dentro. */}
        <main className={`relative flex-1 p-3 ${tab === 'mensajes' ? 'overflow-hidden pb-2' : 'overflow-y-auto pb-32'}`}>
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
                return (
                  <div className="space-y-2 px-1">
                    <div className="pb-1 pt-1">
                      <div className="text-[12px] text-mp-ink-2">{t('Hola')}, {String(usuario?.nombre || '').split(' ')[0]} 👋</div>
                      <h1 className="m-0 text-[22px] font-medium text-mp-ink">{t('Tus pedidos')}</h1>
                    </div>

                    {/* Tarjeta protagonista: el pedido en camino con su avance en vivo. */}
                    {destacado ? (
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
                    ) : (
                      <FeatureCard>
                        <StatusPill sobreNavy color="var(--mp-gold)">{t('Sin entregas en camino')}</StatusPill>
                        <div className="mt-2 text-[22px] font-medium leading-tight">{t('Cuando un pedido esté en camino, lo verás aquí en vivo.')}</div>
                      </FeatureCard>
                    )}

                    {/* ÚNICO botón dorado de la pantalla. El cliente no crea pedidos
                        (los emite la oficina), así que lleva a su lista de pedidos. */}
                    <PrimaryButton icon={Plus} onClick={() => setTab('ordenes')}>{t('Nuevo pedido')}</PrimaryButton>

                    {/* Stats del mes */}
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard etiqueta={t('Entregado (mes)')} valor={Math.round(stats.tonMes * 10) / 10} sufijo={t('ton')} />
                      <StatCard etiqueta={t('Facturas abiertas')} valor={facturasAbiertas} />
                    </div>

                    {/* Pedidos programados (futuros / pendientes de salir) */}
                    {programados.length > 0 && (
                      <>
                        <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Programados')}</div>
                        {programados.map((o) => (
                          <ListRow key={o.id} icon={Package}
                            titulo={`${t(o.material || 'Carga')} · ${o.pesoReal ?? o.pesoEstimado} ${t('ton')}`}
                            meta={`${o.numero || ''}${fFec(o.creadoEn) ? ` · ${fFec(o.creadoEn)}` : ''}`}
                            derecha={<StatusPill color="var(--mp-gold)">{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</StatusPill>}
                            onClick={() => setTab('ordenes')} />
                        ))}
                      </>
                    )}

                    {/* Accesos a las pantallas que salieron de la barra. */}
                    <div className="pt-2 text-[15px] font-medium text-mp-ink">{t('Explorar')}</div>
                    <ListRow icon={Navigation} titulo={t('Mapa en vivo')} onClick={() => setTab('mapa')} />
                    <ListRow icon={Layers} titulo={t('Proyectos')} onClick={() => setTab('proyectos')} />
                    <ListRow icon={LayoutDashboard} titulo={t('Resumen')} onClick={() => setTab('resumen')} />
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

              {tab === 'ordenes' && (
                <Card className="p-4">
                  <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mis órdenes')}</h3>
                  {ordenes.length === 0 ? <EstadoVacio titulo={t('Aún no hay órdenes')} texto={t('Aquí verás tus órdenes con su estado en tiempo real.')} mostrarBoton={false} /> : (
                    <Tabla columns={[{ key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') }, { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'precioCliente', label: t('Precio'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'ticket', label: t('Ticket'), align: 'center' }]}
                      rows={ordenes.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).slice(0, 100).map((o) => ({ ...o, _key: o.id }))}
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
              )}

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

      {verClave && <CambiarClave onClose={() => setVerClave(false)} />}

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
