import { useEffect, useMemo, useState } from 'react'
import { MapPin, Navigation, Gauge, Route as RouteIcon, Clock, MessageSquare, FlaskConical, Search, Users, Layers, X, Truck } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import ChatOrden from '../components/ChatOrden'
import { useColeccion } from '../data/useColeccion'
import { suscribirTrack } from '../data/tracking'
import { useBulkAuth } from '../BulkAuthContext'
import { metricasRecorrido } from '../domain/geo'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import { ESTADOS_ACTIVOS_CHOFER } from '../domain/flujo'
import { tsMillis } from '../data/chatKeys'

// Un chofer se considera "en línea ahora" si latió en los últimos 90 s.
const PRESENCIA_TTL_MS = 90 * 1000
import MapaLeaflet from '../components/MapaLeaflet'
import { PageTitle, Card, Badge, Cargando, Select, Input } from '../../components/ui'
import { useLang } from '../../i18n'

const COLOR_EST = { aceptada: 'navy', en_planta: 'navy', cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green' }
const colorPunto = (estado) => (estado === E.EN_RUTA ? '#10b981' : estado === E.EN_DESTINO ? '#2563eb' : '#f59e0b')

export default function MapaVivo() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: geocercas } = useColeccion('geofences')
  const { datos: presencias } = useColeccion('presence')
  // Entradas/salidas de geocerca en vivo (solo staff/transportista las leen por reglas).
  const { datos: geoeventos } = useColeccion('geoeventos', [], { orden: 'ts', dir: 'desc', limite: 25 })
  // Salto directo desde un aviso: ?geo=<id>&lat=&lng= → centra el mapa en esa geocerca.
  const [params] = useSearchParams()
  const centroFoco = useMemo(() => {
    const gid = params.get('geo')
    if (gid) { const g = (geocercas || []).find((x) => x.id === gid); if (g && g.lat != null) return { lat: Number(g.lat), lng: Number(g.lng), zoom: 15 } }
    const la = Number(params.get('lat')), ln = Number(params.get('lng'))
    if (Number.isFinite(la) && Number.isFinite(ln) && params.get('lat') && params.get('lng')) return { lat: la, lng: ln, zoom: 15 }
    return null
  }, [params, geocercas])
  const [sel, setSel] = useState('')
  const [track, setTrack] = useState([])
  const [verChat, setVerChat] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  // En el mapa EN VIVO una orden ya entregada desaparece (su historial queda en
  // Órdenes); así con muchos choferes solo se ven los camiones trabajando.
  const activas = useMemo(() => ordenes.filter((o) => ESTADOS_ACTIVOS_CHOFER.includes(o.estado) && o.estado !== E.ENTREGADA), [ordenes])
  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return activas.filter((o) =>
      (!filtroEstado || o.estado === filtroEstado) &&
      (!q || (o.numero || '').toLowerCase().includes(q) || (o.choferNombre || '').toLowerCase().includes(q)))
  }, [activas, buscar, filtroEstado])

  const orden = filtradas.find((o) => o.id === sel) || filtradas[0] || null

  useEffect(() => {
    if (verTodos || !orden?.id) { setTrack([]); return }
    const off = suscribirTrack(tenantId, orden.id, setTrack)
    return off
  }, [tenantId, orden?.id, verTodos])

  const met = useMemo(() => metricasRecorrido(track), [track])
  const [selMarca, setSelMarca] = useState(null) // id del camión seleccionado (panel)

  const marcadores = useMemo(() => filtradas
    .filter((o) => o.ultimaPos && o.ultimaPos.lat != null)
    .map((o) => ({ id: `o_${o.id}`, lat: o.ultimaPos.lat, lng: o.ultimaPos.lng, icon: 'truck', color: colorPunto(o.estado), label: `${o.numero} · ${o.choferNombre || t('sin chofer')}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtradas])

  // Reloj para recalcular la frescura de las presencias (que un chofer se caiga del
  // mapa a los 90 s sin latido, aunque no llegue un cambio nuevo).
  const [ahoraMs, setAhoraMs] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setAhoraMs(Date.now()), 15000); return () => clearInterval(id) }, [])

  // Choferes EN LÍNEA con posición GPS que NO tienen una orden activa (esos ya salen
  // por su recorrido). Así el dispatcher ve a TODOS los choferes disponibles en vivo.
  const conOrden = useMemo(() => new Set(activas.map((o) => o.choferId).filter(Boolean)), [activas])
  const choferesVivos = useMemo(() => (presencias || []).filter((p) =>
    p.enLinea === true && p.lat != null &&
    (ahoraMs - tsMillis(p.heartbeat || p.posTs || p.desde)) <= PRESENCIA_TTL_MS &&
    !conOrden.has(p.uid) && !p.demo), [presencias, conOrden, ahoraMs])
  const qMatch = (p) => { const q = buscar.trim().toLowerCase(); return !q || (p.nombre || '').toLowerCase().includes(q) }
  const marcadoresChoferes = useMemo(() => choferesVivos.filter(qMatch)
    .map((p) => ({ id: `p_${p.uid || p.id}`, lat: p.lat, lng: p.lng, icon: 'truck', color: '#64748b', label: `${p.nombre || t('chofer')} · ${t('libre')}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choferesVivos, buscar])

  // Datos para el panel al hacer clic en un camión (orden o chofer libre).
  const infoMarca = useMemo(() => {
    const m = {}
    filtradas.forEach((o) => { if (o.ultimaPos?.lat != null) m[`o_${o.id}`] = { tipo: 'orden', o } })
    choferesVivos.forEach((p) => { m[`p_${p.uid || p.id}`] = { tipo: 'chofer', p } })
    return m
  }, [filtradas, choferesVivos])
  const marcaSel = selMarca ? infoMarca[selMarca] : null

  const estados = [...new Set(activas.map((o) => o.estado))]
  const hayAlgo = activas.length > 0 || choferesVivos.length > 0
  // Sin órdenes activas pero con choferes en línea: forzamos la vista "todos" para
  // que el mapa aparezca con los choferes disponibles.
  const soloChoferes = activas.length === 0 && choferesVivos.length > 0
  const verTodosEf = verTodos || soloChoferes || !!centroFoco

  if (cargando) return <Cargando />

  return (
    <div>
      <PageTitle right={
        <button onClick={() => setVerTodos((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${verTodosEf ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
          {verTodosEf ? <Users size={15} /> : <Layers size={15} />} {verTodosEf ? t('Viendo todos') : t('Ver todos')}
        </button>
      }>{t('Mapa en vivo')}</PageTitle>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar orden o chofer…')} className="w-56 pl-8" />
        </div>
        <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-44">
          <option value="">{t('Todos los estados')}</option>
          {estados.map((s) => <option key={s} value={s}>{t(ORDEN_ESTADO_LABEL[s])}</option>)}
        </Select>
        <span className="text-xs text-slate-400">{filtradas.length} {t('en movimiento')}</span>
        {choferesVivos.length > 0 && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><span className="h-2 w-2 rounded-full bg-slate-500" /> {choferesVivos.length} {t('en línea (sin orden)')}</span>}
      </div>

      {/* Entradas / salidas de geocerca EN VIVO (admin, transportista, staff). */}
      {geoeventos.length > 0 && (
        <Card className="mb-4 p-3">
          <div className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-brand-navy dark:text-slate-100">
            <MapPin size={15} className="text-amber-500" /> {t('Entradas y salidas de geocercas')}
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t('En vivo')}</span>
          </div>
          <div className="scroll-thin max-h-60 space-y-1 overflow-y-auto">
            {geoeventos.map((e) => {
              const entrada = e.evento === 'entrada'
              const cuando = tsMillis(e.ts) ? new Date(tsMillis(e.ts)).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
              return (
                <div key={e.id} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
                  <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full ${entrada ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}`}>{entrada ? '🚨' : '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-brand-navy dark:text-slate-100">
                      <b>{e.choferNombre || t('Chofer')}</b>{e.choferCodigo ? <span className="text-slate-400"> (ID: {e.choferCodigo})</span> : ''} — {entrada ? t('entró a') : t('salió de')} <b>{e.geocerca || t('geocerca')}</b>
                    </div>
                    <div className="truncate text-[11px] text-slate-400">{e.unidad ? `${t('Unidad')} ${e.unidad} · ` : ''}{cuando}</div>
                  </div>
                  <Badge color={entrada ? 'green' : 'gold'}>{entrada ? t('Entrada') : t('Salida')}</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {!hayAlgo && !centroFoco ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500"><Navigation size={24} /></div>
          <div>
            <div className="text-base font-bold text-brand-navy dark:text-slate-100">{t('Nada en movimiento')}</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">{t('Cuando un chofer tenga una orden activa, su recorrido aparecerá aquí en tiempo real.')}</p>
          </div>
          <Link to="/bulk/demo" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-105"><FlaskConical size={15} /> {t('Activar modo test')}</Link>
        </Card>
      ) : (
        <>
          {/* ===== MAPA A PANTALLA ===== */}
          <Card className="mb-4 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
              {verTodosEf ? (
                <>
                  <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Todos los choferes')} ({marcadores.length + marcadoresChoferes.length})</span>
                  <span className="ml-2 flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {t('En ruta')}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> {t('En destino')}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {t('En planta')}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> {t('En línea (libre)')}</span>
                </>
              ) : orden ? (
                <>
                  <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span>
                  <Badge color={COLOR_EST[orden.estado] || 'gold'}>{t(ORDEN_ESTADO_LABEL[orden.estado])}</Badge>
                  {orden.estado === E.EN_RUTA && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> {t('En vivo')}</span>}
                  <span className="text-xs text-slate-400">{orden.choferNombre}</span>
                  <Link to={`/bulk/ordenes/${orden.id}`} className="text-xs font-semibold text-amber-600 hover:underline">{t('Ver ficha →')}</Link>
                  <button onClick={() => setVerChat((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"><MessageSquare size={14} /> {verChat ? t('Ocultar chat') : t('Chat')}</button>
                </>
              ) : null}
            </div>
            {!verTodosEf && verChat && orden && <div className="mb-2"><ChatOrden orden={orden} alto={260} /></div>}
            <div className="relative">
              <MapaLeaflet marcadores={verTodosEf ? [...marcadores, ...marcadoresChoferes] : []} puntos={verTodosEf ? [] : track} geocercas={geocercas} centro={centroFoco} alto="62vh" onMarcador={setSelMarca} />
              {marcaSel && <PanelMarca sel={marcaSel} onClose={() => setSelMarca(null)} t={t} />}
            </div>
            {!verTodosEf && orden && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metrica icon={RouteIcon} label={t('Recorrido')} val={`${met.km} km`} />
                <Metrica icon={Gauge} label={t('Vel. máx / prom')} val={`${met.velMaxKmh}/${met.velPromKmh} km/h`} />
                <Metrica icon={Clock} label={t('En movimiento')} val={`${met.minMovimiento} min`} />
                <Metrica icon={Clock} label={t('Detenido')} val={`${met.minDetenido} min`} />
              </div>
            )}
            {verTodosEf && (marcadores.length + marcadoresChoferes.length) === 0 && <p className="mt-2 px-1 text-xs text-slate-400">{t('Ningún chofer tiene posición GPS todavía. En cuanto se conecten o empiecen a moverse, aparecerán aquí.')}</p>}
          </Card>

          {/* ===== LISTA DE ÓRDENES DEBAJO ===== */}
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">{t('Órdenes activas')} ({filtradas.length}) — {t('toca una para verla en el mapa')}</div>
          {filtradas.length === 0 ? <p className="text-sm text-slate-400">{t('Ninguna orden coincide con el filtro.')}</p> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtradas.map((o) => {
                const activa = !verTodos && orden?.id === o.id
                return (
                  <div key={o.id} className={`rounded-xl border p-3 transition ${activa ? 'border-amber-500 bg-amber-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                    <button onClick={() => { setVerTodos(false); setSel(o.id) }} className="block w-full text-left">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${o.estado === E.EN_RUTA ? 'animate-pulse bg-emerald-500' : 'bg-amber-500'}`} />
                        <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                        <Badge color={COLOR_EST[o.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-400">{o.choferNombre || t('sin chofer')} · {o.material}</div>
                    </button>
                    <Link to={`/bulk/ordenes/${o.id}`} className="mt-1.5 inline-block text-[11px] font-semibold text-amber-600 hover:underline">{t('Ver ficha →')}</Link>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Metrica({ icon: Icon, label, val }) {
  return (
    <div className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700/60">
      <div className="flex items-center gap-1 text-[11px] text-slate-400"><Icon size={12} /> {label}</div>
      <div className="text-sm font-bold text-brand-navy dark:text-slate-100">{val}</div>
    </div>
  )
}

// Panel (mini pestaña) al hacer clic en un camión. El NOMBRE del chofer abre su perfil.
function PanelMarca({ sel, onClose, t }) {
  const cerrar = (
    <button onClick={onClose} className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"><X size={14} /></button>
  )
  if (sel.tipo === 'orden') {
    const o = sel.o
    const total = ORDEN_HITOS.length
    const hechos = ORDEN_HITOS.filter((h) => o.hitos?.[h.key]).length
    const pct = Math.round((hechos / Math.max(1, total)) * 100)
    return (
      <div className="absolute bottom-3 left-3 z-[1000] w-64 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {cerrar}
        <Link to={`/bulk/chofer/${encodeURIComponent(o.choferNombre || '')}`} className="pr-6 text-sm font-black text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{o.choferNombre || t('Chofer')}</Link>
        <div className="mt-0.5 text-xs text-slate-400"><Link to={`/bulk/ordenes/${o.id}`} className="font-mono font-bold text-slate-500 hover:text-amber-600 hover:underline dark:text-slate-300">{o.numero}</Link> · {t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</div>
        <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-300">{t(o.material || 'material s/e')} · {o.pesoReal ?? o.pesoEstimado} ton</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"><div className="h-full rounded-full bg-[#15b66b]" style={{ width: `${pct}%` }} /></div>
        <div className="mt-1 text-[11px] text-slate-400">{pct}% {t('completado')}</div>
        <Link to={`/bulk/ordenes/${o.id}`} className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-brand-navy px-2 py-1.5 text-xs font-bold text-white hover:brightness-110 dark:bg-amber-500 dark:text-slate-900">{t('Ver historial de la orden')} →</Link>
      </div>
    )
  }
  const p = sel.p
  const eqs = (p.equipos && p.equipos.length ? p.equipos.join(', ') : p.equipo) || t('sin equipo')
  return (
    <div className="absolute bottom-3 left-3 z-[1000] w-60 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      {cerrar}
      <Link to={`/bulk/chofer/${encodeURIComponent(p.nombre || '')}`} className="pr-6 text-sm font-black text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{p.nombre || t('Chofer')}</Link>
      <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('En línea')} · {t('libre')}</div>
      <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-300"><Truck size={12} className="text-amber-500" /> {eqs}</div>
      {p.carrierNombre && <div className="text-xs text-slate-400">{p.carrierNombre}</div>}
    </div>
  )
}
