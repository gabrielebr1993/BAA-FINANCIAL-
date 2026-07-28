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
import { useLang } from '../../i18n'

const COLOR_EST = { aceptada: 'navy', en_planta: 'navy', cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green' }
const colorPunto = (estado) => (estado === E.EN_RUTA ? '#10b981' : estado === E.EN_DESTINO ? '#2563eb' : '#f59e0b')

export default function MapaVivo() {
  const { t } = useLang()
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
          {verTodos ? <Users size={15} /> : <Layers size={15} />} {verTodos ? t('Viendo todos') : t('Ver todos')}
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
      </div>

      {activas.length === 0 ? (
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
              {verTodos ? (
                <>
                  <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Todos los choferes')} ({marcadores.length})</span>
                  <span className="ml-2 flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {t('En ruta')}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> {t('En destino')}</span>
                  <span className="flex items-center gap-1 text-xs text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {t('En planta')}</span>
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
            {!verTodos && verChat && orden && <div className="mb-2"><ChatOrden orden={orden} alto={260} /></div>}
            <MapaLeaflet marcadores={verTodos ? marcadores : []} puntos={verTodos ? [] : track} geocercas={geocercas} alto="62vh" />
            {!verTodos && orden && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metrica icon={RouteIcon} label={t('Recorrido')} val={`${met.km} km`} />
                <Metrica icon={Gauge} label={t('Vel. máx / prom')} val={`${met.velMaxKmh}/${met.velPromKmh} km/h`} />
                <Metrica icon={Clock} label={t('En movimiento')} val={`${met.minMovimiento} min`} />
                <Metrica icon={Clock} label={t('Detenido')} val={`${met.minDetenido} min`} />
              </div>
            )}
            {verTodos && marcadores.length === 0 && <p className="mt-2 px-1 text-xs text-slate-400">{t('Ningún chofer tiene posición GPS todavía. En cuanto empiecen a moverse, aparecerán aquí.')}</p>}
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
