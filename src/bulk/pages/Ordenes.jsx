import { useMemo, useState, useEffect, useRef } from 'react'
import { Radio, Truck, CheckCircle2, XCircle, MessageSquare, User, Search, Clock, Package, Wifi, RefreshCw, Ban, AlertTriangle } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Input } from '../../components/ui'
import ChatOrden from '../components/ChatOrden'
import ImprimirTicket from '../components/ImprimirTicket'
import ModalCancelarOrden from '../components/ModalCancelarOrden'
import { puedeCancelar } from '../data/ordenAcciones'
import { noLeidosPorConv } from '../data/chat'
import { tsMillis } from '../data/chatKeys'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { guardar } from '../data/repo'
import { liberar } from '../data/presencia'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { choferesLibres, PRESENCIA_TTL_MS, equipoCompatible, enriquecerConRoster } from '../domain/asignacionAuto'
import { diagnosticarCola, choferesReales, diagnosticarChofer } from '../domain/diagnosticoAsignacion'
import { alertaOrden } from '../domain/alertas'
import { beep, notificar, pedirPermisoNotif } from '../integraciones/alertasLocales'
import { desgloseVisible } from '../domain/pagos'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { PageTitle, Card, Badge, Cargando, Boton } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const EN_PROCESO_EST = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const FINALES = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const STAFF = ['super_admin', 'admin', 'dispatcher']
const iso = () => new Date().toISOString()
const inicial = (s) => (s || '?').trim().charAt(0).toUpperCase()
const horaCorta = (v) => { const ms = tsMillis(v); return ms ? new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '' }
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

// Tarjeta-pill con número grande y etiqueta (indicadores de la parte superior).
// Tarjeta indicador: número grande + etiqueta, CLICABLE (lleva a su sección/página).
// `activo` la resalta (p. ej. el filtro de canceladas encendido).
const STAT_THEME = {
  amber: { txt: 'text-amber-600 dark:text-amber-400', ring: 'hover:border-amber-400 dark:hover:border-amber-500/60', bar: 'bg-amber-500', soft: 'bg-amber-500/10' },
  emerald: { txt: 'text-emerald-600 dark:text-emerald-400', ring: 'hover:border-emerald-400 dark:hover:border-emerald-500/60', bar: 'bg-emerald-500', soft: 'bg-emerald-500/10' },
  gold: { txt: 'text-brand-gold', ring: 'hover:border-amber-400 dark:hover:border-amber-500/60', bar: 'bg-brand-gold', soft: 'bg-amber-400/10' },
  blue: { txt: 'text-sky-600 dark:text-sky-400', ring: 'hover:border-sky-400 dark:hover:border-sky-500/60', bar: 'bg-sky-500', soft: 'bg-sky-500/10' },
  navy: { txt: 'text-brand-navy dark:text-slate-100', ring: 'hover:border-slate-400 dark:hover:border-slate-500', bar: 'bg-brand-navy dark:bg-slate-300', soft: 'bg-slate-500/10' },
  rose: { txt: 'text-rose-500', ring: 'hover:border-rose-400 dark:hover:border-rose-500/60', bar: 'bg-rose-500', soft: 'bg-rose-500/10' },
}
function StatCard({ label, val, color, icon: Icon, onClick, activo, pulse }) {
  const c = STAT_THEME[color] || STAT_THEME.navy
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex min-w-[7.5rem] flex-1 items-center gap-3 overflow-hidden rounded-2xl border bg-white px-3.5 py-3 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 dark:bg-slate-900 ${activo ? 'border-current ' + c.txt : 'border-slate-200 dark:border-slate-700/60'} ${c.ring}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${c.bar} ${activo ? 'opacity-100' : 'opacity-0 transition-opacity group-hover:opacity-100'}`} />
      <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${c.soft} ${c.txt} ${pulse && val > 0 ? 'animate-pulse' : ''}`}><Icon size={19} strokeWidth={2} /></span>
      <span className="min-w-0">
        <span className={`block text-2xl font-black tabular-nums leading-none ${c.txt}`}>{val}</span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">{label}</span>
      </span>
    </button>
  )
}

export default function Ordenes() {
  const { t } = useLang()
  const { tenantId, usuario, rol, permisos } = useBulkAuth()
  const esStaff = STAFF.includes(rol)
  const { datos: ordenes, cargando } = useOrdenesConPagos()
  const { datos: carriers } = useColeccion('carriers')
  const { datos: presencias } = useColeccion('presence')
  const { datos: mensajes } = useColeccion('messages')
  const { datos: signals } = useColeccion('signals')
  const { datos: jobsTk } = useColeccion('jobs')
  const { datos: plantasTk } = useColeccion('plants')
  const { datos: materialesTk } = useColeccion('materials')
  const { datos: clientes } = useColeccion('clients')
  const jobsMap = useMemo(() => { const m = {}; for (const j of jobsTk || []) m[j.id] = j; return m }, [jobsTk])
  const plantasMap = useMemo(() => { const m = {}; for (const p of plantasTk || []) m[p.id] = p; return m }, [plantasTk])
  const carriersMap = useMemo(() => { const m = {}; for (const c of carriers || []) m[c.id] = c; return m }, [carriers])
  const materialesMap = useMemo(() => { const m = {}; for (const x of materialesTk || []) m[(x.nombre || '').trim().toLowerCase()] = x; return m }, [materialesTk])
  const clientesMapTk = useMemo(() => { const m = {}; for (const c of clientes || []) m[c.id] = c; return m }, [clientes])
  const ticketProps = (o) => ({ orden: o, empresa: usuario?.empresa || 'Freight', jobsMap, plantasMap, carriersMap, materialesMap, clientesMap: clientesMapTk, ordenesJob: ordenes, canGenerar: esStaff, tenantId, usuario, rol })
  // Si el matching corre en el SERVIDOR (Cloud Function), el motor del navegador se
  // apaga. Si esa función NO está desplegada, nada asigna → es la causa #1 de "en
  // línea pero no llega ninguna orden". Lo advertimos en el diagnóstico.
  const matchingServer = (signals || []).some((s) => s.id === 'matching' && s.serverSide === true)
  const [verDiag, setVerDiag] = useState(false)
  const noLeidos = useMemo(() => noLeidosPorConv(mensajes, usuario?.id), [mensajes, usuario])
  const nombreCarrier = (id) => carriers.find((c) => c.id === id)?.nombre || '—'
  const [chatOrden, setChatOrden] = useState(null)
  const [cancelar, setCancelar] = useState(null) // orden a cancelar (modal)
  const [verCanceladas, setVerCanceladas] = useState(false)
  const [verEntregadas, setVerEntregadas] = useState(false)
  const [buscar, setBuscar] = useState('')
  const navigate = useNavigate()
  // Refs para que las tarjetas indicador lleven a su sección (scroll + destello).
  const colaRef = useRef(null)
  const procesoRef = useRef(null)
  const entregadasRef = useRef(null)
  const [destello, setDestello] = useState(null) // 'cola' | 'proceso' | 'entregadas'
  const irA = (ref, clave) => {
    if (ref?.current) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setDestello(clave); setTimeout(() => setDestello((d) => (d === clave ? null : d)), 1600)
  }
  const [toasts, setToasts] = useState([]) // notificaciones estilo sistema (abajo-derecha)

  // Reloj de 1s: refresca frescura de presencia, contadores 2:00 y dispara timeouts.
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])

  // ── Colas derivadas ──────────────────────────────────────────────────────
  const porAsignar = useMemo(() => ordenes.filter((o) => [E.CREADA, E.EN_COLA].includes(o.estado)), [ordenes])
  const emparejando = useMemo(() => ordenes.filter((o) => o.estado === E.NOTIFICANDO), [ordenes])
  const enProceso = useMemo(() => ordenes.filter((o) => EN_PROCESO_EST.includes(o.estado)), [ordenes])
  const entregadas = useMemo(() => ordenes.filter((o) => FINALES.includes(o.estado)), [ordenes])
  const canceladas = useMemo(() => ordenes.filter((o) => o.estado === E.CANCELADA), [ordenes])
  // Órdenes atrasadas (>3h sin recoger o sin entregar) → alerta en rojo.
  const atrasadasN = useMemo(() => ordenes.filter((o) => alertaOrden(o, now)).length, [ordenes, now])
  // Presencia enriquecida con los Trabajos/equipos ACTUALES del roster (UNIÓN con lo
  // que el chofer tenía al conectarse), mismo criterio que el motor: así el conteo, la
  // lista y el diagnóstico reflejan EXACTAMENTE lo que ve el emparejador.
  const presenciasReales = useMemo(() => enriquecerConRoster(presencias, carriers), [presencias, carriers])
  // Choferes en línea (vivos) que se muestran: libres + reservados (los ocupados salen).
  // Se usa la presencia ENRIQUECIDA para mostrar el mismo equipo que usa el motor.
  const enLinea = useMemo(() => (presenciasReales || [])
    .filter((p) => p.enLinea === true && p.estado !== 'ocupado' && p.estado !== 'offline')
    .filter((p) => (now - tsMillis(p.heartbeat || p.desde)) <= PRESENCIA_TTL_MS)
    .sort((a, b) => tsMillis(a.desde) - tsMillis(b.desde)), [presenciasReales, now])
  const libresN = choferesLibres(presenciasReales, now).length
  const realesN = useMemo(() => choferesReales(presenciasReales, now).length, [presenciasReales, now])
  // Diagnóstico: por qué cada orden en cola no se está emparejando (solo lectura).
  const diag = useMemo(() => diagnosticarCola(porAsignar, presenciasReales, now), [porAsignar, presenciasReales, now])
  const bloqueadas = diag.filter((d) => d.razon.tipo !== 'ok').length

  // El MOTOR de asignación (ofrecer + timeout) vive en useAutoAsignacion (montado
  // en BulkLayout), para que corra en cualquier pantalla del staff. Aquí solo se
  // observa y se ofrece la acción manual de "Reasignar".

  // Reasignación MANUAL: devuelve la orden a la cola. El chofer actual NO queda
  // excluido: suma un rechazo (va al final del ciclo de esa orden) y el motor
  // se la puede volver a ofrecer cuando le toque de nuevo.
  const reofertar = async (orden, motivo) => {
    const uid = orden.choferId
    const rechazadoPor = [...new Set([...(orden.rechazadoPor || []), uid].filter(Boolean))]
    const rechazosNum = { ...(orden.rechazosNum || {}) }
    if (uid) rechazosNum[uid] = (Number(rechazosNum[uid]) || 0) + 1
    await guardar('orders', orden.id, {
      estado: E.CREADA, transportistaId: null, choferId: null, asignacionExpira: null,
      rechazadoPor, rechazosNum, ultimoRechazo: { por: orden.choferNombre || '', porUid: uid || '', motivo, ts: iso() },
    })
    if (uid) await liberar(uid)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'reofertar_orden', entidad: 'orden', entidadId: orden.id, detalle: motivo })
  }

  // ── Avisos al dispatcher (sonido + toast estilo sistema) ──────────────────
  const prevRef = useRef(null)
  useEffect(() => { pedirPermisoNotif() }, [])
  const pushToast = (tipo, titulo, texto) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setToasts((s) => [...s, { id, tipo, titulo, texto }])
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 3000)
  }
  useEffect(() => {
    const prev = prevRef.current
    const cur = {}
    for (const o of ordenes) cur[o.id] = { estado: o.estado, rechTs: o.ultimoRechazo?.ts || '', chofer: o.choferNombre || '' }
    if (prev) {
      for (const o of ordenes) {
        const p = prev[o.id]; if (!p) continue
        const c = cur[o.id]
        if (c.estado === E.ACEPTADA && p.estado !== E.ACEPTADA) {
          beep(2); pushToast('ok', 'MilePay · Freight', `${t('Orden')} ${o.numero} ${t('aceptada por')} ${o.choferNombre || '—'}`)
        } else if (c.rechTs && c.rechTs !== p.rechTs && o.ultimoRechazo?.motivo !== 'reencolar') {
          beep(3); pushToast('no', 'MilePay · Freight', `${t('Orden')} ${o.numero} ${t('rechazada por')} ${o.ultimoRechazo?.por || p.chofer || '—'}`)
        }
      }
    }
    prevRef.current = cur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenes])

  if (cargando) return <Cargando />

  const q = buscar.trim().toLowerCase()
  const coincideO = (o) => !q || (o.numero || '').toLowerCase().includes(q) || (o.choferNombre || '').toLowerCase().includes(q) || (nombreCarrier(o.transportistaId) || '').toLowerCase().includes(q)
  const coincideD = (p) => !q || (p.nombre || '').toLowerCase().includes(q) || (p.carrierNombre || '').toLowerCase().includes(q)
  // Columna izquierda: por asignar + emparejando (ofrecidas, con contador 2:00).
  const izquierda = [...porAsignar, ...emparejando].filter(coincideO)
  const derecha = enLinea.filter(coincideD)
  const numOrdenPorChofer = {}
  emparejando.forEach((o) => { if (o.choferId) numOrdenPorChofer[o.choferId] = { numero: o.numero, expira: o.asignacionExpira } })

  return (
    <div>
      <PageTitle>{t('Órdenes / Cola')}</PageTitle>
      <p className="-mt-3 mb-4 text-sm text-slate-400">{t('Asignación automática por disponibilidad. El sistema empareja cada orden con un chofer en línea; tú solo observas.')}</p>

      {atrasadasN > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle size={18} /> <b>{atrasadasN}</b> {t('orden(es) llevan más de 3 h sin recogerse o entregarse.')}
        </div>
      )}

      {/* Indicadores — cada tarjeta lleva a su sección o página */}
      <div className="mb-4 flex flex-wrap gap-2">
        <StatCard label={t('Órdenes en cola')} val={porAsignar.length} color="amber" icon={Radio} pulse onClick={() => irA(colaRef, 'cola')} />
        <StatCard label={t('Choferes en línea')} val={libresN} color="emerald" icon={Wifi} onClick={() => navigate('/bulk/mapa')} />
        <StatCard label={t('Emparejando')} val={emparejando.length} color="gold" icon={RefreshCw} pulse onClick={() => irA(colaRef, 'cola')} />
        <StatCard label={t('En proceso')} val={enProceso.length} color="blue" icon={Truck} onClick={() => (enProceso.length ? irA(procesoRef, 'proceso') : navigate('/bulk/mapa'))} />
        <StatCard label={t('Entregadas')} val={entregadas.length} color="navy" icon={CheckCircle2} activo={verEntregadas} onClick={() => { setVerEntregadas((v) => { const nv = !v; if (nv) setTimeout(() => irA(entregadasRef, 'entregadas'), 60); return nv }) }} />
        <StatCard label={t('Canceladas')} val={canceladas.length} color="rose" icon={Ban} activo={verCanceladas} onClick={() => setVerCanceladas((v) => !v)} />
        <div className="relative ml-auto self-center">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar orden o chofer…')} className="w-56 pl-8" />
        </div>
      </div>

      {/* Diagnóstico de asignación: por qué las órdenes en cola no llegan a un chofer */}
      {esStaff && (porAsignar.length > 0 || matchingServer) && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setVerDiag((v) => !v)}
            className={`flex w-full items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-sm font-semibold transition ${
              (bloqueadas > 0 || matchingServer)
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300'
                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700/60 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <AlertTriangle size={16} />
            {bloqueadas > 0 ? `${bloqueadas} ${t('orden(es) en cola no encuentran chofer')}` : t('Diagnóstico de asignación')}
            <span className="ml-auto text-xs font-normal">{verDiag ? '▾' : '▸'}</span>
          </button>
          {verDiag && (
            <Card className="mt-2 space-y-3 p-4 text-sm">
              {matchingServer && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
                  <b>{t('Asignación en servidor ACTIVA.')}</b> {t('Requiere las Cloud Functions desplegadas. Si aún no las desplegaste, NADA asigna: ve a Modo test y apaga "Asignación en servidor" para usar el motor del navegador.')}
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600 dark:text-slate-300">
                <span>{t('Motor:')} <b>{matchingServer ? t('servidor') : t('navegador (mantén esta pestaña abierta)')}</b></span>
                <span>{t('Choferes reales en línea y libres:')} <b className={realesN > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{realesN}</b></span>
              </div>
              {porAsignar.length === 0 ? (
                <p className="text-slate-400">{t('No hay órdenes en cola ahora mismo.')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {diag.map((d) => (
                    <li key={d.orden.id} className="flex items-start gap-2">
                      {d.razon.tipo === 'ok'
                        ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                        : <XCircle size={15} className="mt-0.5 shrink-0 text-rose-500" />}
                      <span className="text-slate-600 dark:text-slate-300"><b className="text-brand-navy dark:text-slate-100">{d.orden.numero}</b> — {d.razon.texto}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-400">{t('Un chofer recibe la orden solo si: está en línea y libre (app activa), su equipo coincide con el que pide la orden y está afiliado al trabajo de la orden. Rechazar no lo excluye: pasa al final del ciclo de esa orden y se le vuelve a ofrecer cuando le toque.')}</p>
            </Card>
          )}
        </div>
      )}

      <div ref={colaRef} className={`grid gap-4 rounded-3xl lg:grid-cols-2 ${destello === 'cola' ? 'ring-2 ring-amber-400 ring-offset-4 ring-offset-[#f2f3f7] transition dark:ring-offset-slate-950' : ''}`}>
        {/* IZQUIERDA · Órdenes por asignar */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2"><Radio size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Órdenes por asignar')} ({izquierda.length})</h3></div>
          {izquierda.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{q ? t('Ninguna orden coincide.') : t('No hay órdenes por asignar. Genera órdenes desde un Trabajo (Job).')}</p>
          ) : (
            <div className="scroll-thin grid max-h-[calc(100vh-15rem)] grid-cols-1 gap-2 overflow-y-auto pr-1">
              {izquierda.map((o) => {
                const fin = desgloseVisible(o, rol, permisos)
                const ofrecida = o.estado === E.NOTIFICANDO
                const rest = ofrecida && o.asignacionExpira ? tsMillis(o.asignacionExpira) - now : 0
                const compat = choferesLibres(presenciasReales, now).some((p) => equipoCompatible(p.equipos || p.equipo, o.tipoEquipo))
                const atr = alertaOrden(o, now)
                return (
                  <Link key={o.id} to={`/bulk/ordenes/${o.id}`} className={`block cursor-pointer rounded-xl border p-3 transition hover:shadow-sm ${atr ? 'border-rose-400 bg-rose-50 hover:border-rose-500 dark:border-rose-500/50 dark:bg-rose-500/10' : ofrecida ? 'animate-pulse border-amber-400 bg-amber-50 hover:border-amber-400 dark:border-amber-400 dark:bg-amber-500/10' : 'border-slate-200 hover:border-amber-400 dark:border-slate-700/60'}`}>
                    {atr && <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400"><AlertTriangle size={11} /> {atr.tipo === 'recogida' ? t('sin recoger') : t('sin entregar')} · {atr.horas} h</div>}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                      <Badge color="navy">{o.pesoEstimado} ton</Badge>
                      {o.tipoEquipo && <Badge color="slate">{o.tipoEquipo}</Badge>}
                      <div className="ml-auto flex items-center gap-0.5">
                        {esStaff && puedeCancelar(o) && <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCancelar(o) }} title={t('Cancelar orden')} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"><Ban size={15} /></button>}
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setChatOrden(o) }} title={t('Chat de la orden')} className="relative rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800">
                          <MessageSquare size={15} />
                          {(noLeidos[o.id] || 0) > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{noLeidos[o.id]}</span>}
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                      <Package size={12} /> {t(o.material || 'material s/e')}
                      {'precioCliente' in fin && fin.precioCliente != null && <span>· {t('Cliente')}: {money(fin.precioCliente)}</span>}
                    </div>
                    {ofrecida ? (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 font-bold text-amber-700 dark:text-amber-300"><Clock size={12} /> {t('esperando respuesta')} {mmss(rest)}</span>
                        <span className="truncate font-semibold text-brand-navy dark:text-slate-100">→ {o.choferNombre}</span>
                        {esStaff && <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); reofertar(o, 'manual') }} title={t('Reasignar a otro')} className="ml-auto rounded-lg p-1 text-slate-400 hover:text-amber-500"><RefreshCw size={13} /></button>}
                      </div>
                    ) : (
                      <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${compat ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {compat ? <><Wifi size={11} /> {t('buscando chofer disponible…')}</> : <><Clock size={11} /> {t('esperando chofer en línea compatible')}</>}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </Card>

        {/* DERECHA · Choferes en línea */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2"><Wifi size={17} className="text-emerald-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Choferes en línea')} ({derecha.length})</h3></div>
          {derecha.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{q ? t('Ningún chofer coincide.') : t('Ningún chofer en línea. Los choferes se conectan desde su app para recibir órdenes.')}</p>
          ) : (
            <div className="scroll-thin grid max-h-[calc(100vh-15rem)] grid-cols-1 gap-2 overflow-y-auto pr-1">
              {derecha.map((p) => {
                const entrando = numOrdenPorChofer[p.uid]
                const rest = entrando?.expira ? tsMillis(entrando.expira) - now : 0
                // Por qué (o no) recibe orden — solo si NO tiene una entrando ahora.
                const dr = entrando ? null : diagnosticarChofer(p, porAsignar, now)
                return (
                  <Link key={p.id} to={`/bulk/chofer/${encodeURIComponent(p.nombre || '')}`} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition hover:shadow-sm ${entrando ? 'animate-pulse border-amber-400 bg-amber-50 dark:border-amber-400 dark:bg-amber-500/10' : 'border-slate-200 hover:border-amber-400 dark:border-slate-700/60'}`}>
                    <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-sm font-black ${entrando ? 'bg-amber-400 text-slate-900' : 'bg-brand-navy text-white dark:bg-slate-700'}`}>{inicial(p.nombre)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-brand-navy dark:text-slate-100">{p.nombre}</span>
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        {(p.equipos && p.equipos.length ? p.equipos.join(', ') : p.equipo) && <span className="inline-flex items-center gap-0.5"><Truck size={11} /> {p.equipos && p.equipos.length ? p.equipos.join(', ') : p.equipo}</span>}
                        <span>· {p.carrierNombre || '—'}</span>
                        <span>· {t('desde')} {horaCorta(p.desde)}</span>
                      </div>
                      {dr && dr.tipo !== 'na' && (
                        <div className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${dr.tipo === 'ok' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : dr.tipo === 'sin_cola' ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
                          {dr.tipo === 'ok' ? <CheckCircle2 size={11} /> : dr.tipo === 'sin_cola' ? null : <AlertTriangle size={11} />} {t(dr.texto)}
                        </div>
                      )}
                    </div>
                    {entrando && <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300"><Clock size={11} /> {entrando.numero} · {mmss(rest)}</span>}
                  </Link>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* En proceso (observación) */}
      {enProceso.length > 0 && (
        <div ref={procesoRef} className={`mt-4 rounded-2xl ${destello === 'proceso' ? 'ring-2 ring-sky-400 ring-offset-4 ring-offset-[#f2f3f7] dark:ring-offset-slate-950' : ''}`}>
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2"><Truck size={17} className="text-sky-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('En proceso')} ({enProceso.length})</h3></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {enProceso.filter(coincideO).map((o) => (
              <Link key={o.id} to={`/bulk/ordenes/${o.id}`} className={`block cursor-pointer rounded-xl border p-3 transition hover:shadow-sm ${alertaOrden(o, now) ? 'border-rose-400 bg-rose-50 hover:border-rose-500 dark:border-rose-500/50 dark:bg-rose-500/10' : 'border-slate-200 hover:border-amber-400 dark:border-slate-700/60'}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${o.estado === E.EN_RUTA ? 'animate-pulse bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                  <Badge color="navy">{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                  <div className="ml-auto flex items-center gap-0.5" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
                    <ImprimirTicket {...ticketProps(o)} compacto />
                    {esStaff && puedeCancelar(o) && <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCancelar(o) }} title={t('Cancelar orden')} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"><Ban size={15} /></button>}
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setChatOrden(o) }} className="relative rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 dark:hover:bg-slate-800">
                      <MessageSquare size={15} />
                      {(noLeidos[o.id] || 0) > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{noLeidos[o.id]}</span>}
                    </button>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs"><User size={13} className="text-amber-500" /><span className="font-semibold text-brand-navy dark:text-slate-100">{o.choferNombre || nombreCarrier(o.transportistaId)}</span><span className="text-slate-400">· {t(o.material)} · {o.pesoReal ?? o.pesoEstimado} ton</span></div>
              </Link>
            ))}
          </div>
        </Card>
        </div>
      )}

      {/* Entregadas (toggle desde el indicador) */}
      {verEntregadas && (
        <div ref={entregadasRef} className={`mt-4 rounded-2xl ${destello === 'entregadas' ? 'ring-2 ring-slate-400 ring-offset-4 ring-offset-[#f2f3f7] dark:ring-offset-slate-950' : ''}`}>
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2"><CheckCircle2 size={17} className="text-emerald-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Entregadas')} ({entregadas.length})</h3></div>
          {entregadas.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">{t('Aún no hay órdenes entregadas.')}</p> : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {entregadas.filter(coincideO).map((o) => (
                <Link key={o.id} to={`/bulk/ordenes/${o.id}`} className="block rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 transition hover:shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                    <Badge color="green">{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                    <span className="ml-auto" onClick={(e) => { e.preventDefault(); e.stopPropagation() }}><ImprimirTicket {...ticketProps(o)} compacto /></span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><User size={12} className="text-emerald-500" /> {o.choferNombre || nombreCarrier(o.transportistaId)} · {t(o.material || 'material s/e')} · {o.pesoReal ?? o.pesoEstimado} ton</div>
                </Link>
              ))}
            </div>
          )}
        </Card>
        </div>
      )}

      {/* Historial de canceladas (toggle desde el indicador) */}
      {verCanceladas && (
        <Card className="mt-4 p-4">
          <div className="mb-3 flex items-center gap-2"><Ban size={17} className="text-rose-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Canceladas')} ({canceladas.length})</h3></div>
          {canceladas.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">{t('No hay órdenes canceladas.')}</p> : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {canceladas.filter(coincideO).map((o) => (
                <div key={o.id} className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-500/20 dark:bg-rose-500/5">
                  <div className="flex items-center gap-2">
                    <Link to={`/bulk/ordenes/${o.id}`} className="font-mono text-sm font-bold text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{o.numero}</Link>
                    <Badge color="red">{t('Cancelada')}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t(o.material || 'material s/e')} · {o.pesoEstimado} ton</div>
                  {o.cancelacion && <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{t('Motivo')}: {o.cancelacion.motivo} · {o.cancelacion.por}{o.cancelacion.ts ? ` · ${new Date(o.cancelacion.ts).toLocaleDateString('es', { day: '2-digit', month: 'short' })}` : ''}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {chatOrden && (
        <ModalChat titulo={`${t('Chat')} · ${chatOrden.numero}`} onClose={() => setChatOrden(null)}>
          <ChatOrden orden={chatOrden} alto={380} />
        </ModalChat>
      )}
      {cancelar && <ModalCancelarOrden orden={cancelar} ctx={{ tenantId, usuario, rol }} onClose={() => setCancelar(null)} onDone={() => setCancelar(null)} />}

      {/* Notificaciones estilo sistema (abajo-derecha) */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((n) => (
          <div key={n.id} className="animate-slide-up pointer-events-auto flex w-72 items-start gap-2.5 rounded-2xl border border-white/40 bg-white/85 p-3 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-900/85">
            <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full ${n.tipo === 'ok' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'}`}>
              {n.tipo === 'ok' ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{n.titulo}</div>
              <div className="text-sm font-semibold text-brand-navy dark:text-slate-100">{n.texto}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModalChat({ titulo, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}
