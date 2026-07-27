import { useEffect, useMemo, useState } from 'react'
import { MapPin, Navigation, Gauge, Route as RouteIcon, Clock, MessageSquare, FlaskConical, Search, Users, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import ChatOrden from '../components/ChatOrden'
import { useColeccion } from '../data/useColeccion'
import { suscribirTrack } from '../data/tracking'
import { useBulkAuth } from '../BulkAuthContext'
import { metricasRecorrido } from '../domain/geo'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { ESTADOS_ACTIVOS_CHOFER } from '../domain/flujo'
import MapaLeaflet from '../components/MapaLeaflet'
import { PageTitle, Card, Badge, Cargando, Select, Input } from '../../components/ui'

const COLOR_EST = { aceptada: 'navy', en_planta: 'navy', cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green' }
const colorPunto = (estado) => (estado === E.EN_RUTA ? '#10b981' : estado === E.EN_DESTINO ? '#2563eb' : '#f59e0b')

export default function MapaVivo() {
  const { tenantId } = useBulkAuth()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: geocercas } = useColeccion('geofences')
  const [sel, setSel] = useState('')
  const [track, setTrack] = useState([])
  const [verChat, setVerChat] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  const activas = useMemo(() => ordenes.filter((o) => ESTADOS_ACTIVOS_CHOFER.includes(o.estado)), [ordenes])
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
  const marcadores = useMemo(() => filtradas
    .filter((o) => o.ultimaPos && o.ultimaPos.lat != null)
    .map((o) => ({ lat: o.ultimaPos.lat, lng: o.ultimaPos.lng, label: `${o.numero} · ${o.choferNombre || 'sin chofer'}`, color: colorPunto(o.estado) })), [filtradas])

  const estados = [...new Set(activas.map((o) => o.estado))]

  if (cargando) return <Cargando />

  return (
    <div>
      <PageTitle right={
        <button onClick={() => setVerTodos((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${verTodos ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
          {verTodos ? <Users size={15} /> : <Layers size={15} />} {verTodos ? 'Viendo todos' : 'Ver todos'}
        </button>
      }>Mapa en vivo</PageTitle>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar orden o chofer…" className="w-56 pl-8" />
        </div>
        <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-44">
          <option value="">Todos los estados</option>
          {estados.map((s) => <option key={s} value={s}>{ORDEN_ESTADO_LABEL[s]}</option>)}
        </Select>
        <span className="text-xs text-slate-400">{filtradas.length} en movimiento</span>
      </div>

      {activas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500"><Navigation size={24} /></div>
          <div>
            <div className="text-base font-bold text-brand-navy dark:text-slate-100">Nada en movimiento</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">Cuando un chofer tenga una orden activa, su recorrido aparecerá aquí en tiempo real.</p>
          </div>
          <Link to="/bulk/demo" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-105"><FlaskConical size={15} /> Activar modo test</Link>
        </Card>
      ) : verTodos ? (
        /* ---- VER TODOS: un mapa grande con cada chofer ---- */
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-brand-navy dark:text-slate-100">Todos los choferes y rutas</span>
            <span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> En ruta</span>
            <span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> En destino</span>
            <span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> En planta / cargando</span>
          </div>
          <MapaLeaflet marcadores={marcadores} geocercas={geocercas} alto={560} />
          {marcadores.length === 0 && <p className="mt-2 text-xs text-slate-400">Ningún chofer tiene posición GPS todavía. En cuanto empiecen a moverse, aparecerán aquí.</p>}
        </Card>
      ) : (
        /* ---- DETALLE: lista + una orden ---- */
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Órdenes activas ({filtradas.length})</div>
            <div className="space-y-2">
              {filtradas.map((o) => (
                <button key={o.id} onClick={() => setSel(o.id)} className={`block w-full rounded-xl border p-3 text-left transition ${orden?.id === o.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${o.estado === E.EN_RUTA ? 'animate-pulse bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                    <Badge color={COLOR_EST[o.estado] || 'navy'}>{ORDEN_ESTADO_LABEL[o.estado]}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">{o.choferNombre || 'sin chofer'} · {o.material}</div>
                </button>
              ))}
              {filtradas.length === 0 && <p className="text-sm text-slate-400">Ninguna orden coincide con el filtro.</p>}
            </div>
          </div>

          <div className="lg:col-span-2">
            {orden && (
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span>
                  <Badge color={COLOR_EST[orden.estado] || 'gold'}>{ORDEN_ESTADO_LABEL[orden.estado]}</Badge>
                  {orden.estado === E.EN_RUTA && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> En vivo</span>}
                  <span className="text-xs text-slate-400">{orden.choferNombre}</span>
                  <Link to={`/bulk/ordenes/${orden.id}`} className="text-xs font-semibold text-amber-600 hover:underline">Ver ficha →</Link>
                  <button onClick={() => setVerChat((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"><MessageSquare size={14} /> {verChat ? 'Ocultar chat' : 'Chat'}</button>
                </div>
                {verChat && <div className="mb-3"><ChatOrden orden={orden} alto={280} /></div>}
                <MapaLeaflet puntos={track} geocercas={geocercas} alto={460} />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metrica icon={RouteIcon} label="Recorrido" val={`${met.km} km`} />
                  <Metrica icon={Gauge} label="Vel. máx / prom" val={`${met.velMaxKmh}/${met.velPromKmh} km/h`} />
                  <Metrica icon={Clock} label="En movimiento" val={`${met.minMovimiento} min`} />
                  <Metrica icon={Clock} label="Detenido" val={`${met.minDetenido} min`} />
                </div>
                {(orden.geoEventos || []).length > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Eventos de geocerca</div>
                    <div className="flex flex-wrap gap-1.5">
                      {orden.geoEventos.map((ev, i) => (
                        <Badge key={i} color={ev.evento === 'entrada' ? 'green' : 'slate'}><MapPin size={11} className="mr-0.5 inline" />{ev.evento} · {ev.geocerca} · {new Date(ev.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-slate-400">Mapa real (OpenStreetMap). Para Google/Apple Maps se cambia la capa de tiles + su key.</p>
              </Card>
            )}
          </div>
        </div>
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
