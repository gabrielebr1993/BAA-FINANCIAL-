import { useEffect, useMemo, useState } from 'react'
import { MapPin, Navigation, Gauge, Route as RouteIcon, Clock, MessageSquare } from 'lucide-react'
import ChatOrden from '../components/ChatOrden'
import { useColeccion } from '../data/useColeccion'
import { suscribirTrack } from '../data/tracking'
import { useBulkAuth } from '../BulkAuthContext'
import { metricasRecorrido } from '../domain/geo'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { ESTADOS_ACTIVOS_CHOFER } from '../domain/flujo'
import { PageTitle, Card, Badge, Cargando, EstadoVacio } from '../../components/ui'

// Mapa esquemático (proyección local). La integración con mapas reales (Google/Apple)
// llega en la fase de APIs; aquí se grafican ruta y geocercas a escala.
function RutaSVG({ puntos, geocercas }) {
  const W = 560, H = 320, P = 24
  const coords = [...puntos, ...geocercas.map((g) => ({ lat: g.lat, lng: g.lng }))].filter((c) => c && c.lat != null)
  if (coords.length === 0) return <div className="grid h-64 place-items-center text-sm text-slate-400">Sin posiciones todavía.</div>
  let minLat = Math.min(...coords.map((c) => c.lat)), maxLat = Math.max(...coords.map((c) => c.lat))
  let minLng = Math.min(...coords.map((c) => c.lng)), maxLng = Math.max(...coords.map((c) => c.lng))
  if (maxLat - minLat < 0.002) { minLat -= 0.001; maxLat += 0.001 }
  if (maxLng - minLng < 0.002) { minLng -= 0.001; maxLng += 0.001 }
  const sx = (W - 2 * P) / (maxLng - minLng), sy = (H - 2 * P) / (maxLat - minLat)
  const X = (lng) => P + (lng - minLng) * sx
  const Y = (lat) => H - P - (lat - minLat) * sy
  const rPx = (m) => Math.max(3, (m / 111320) * sy)
  const linea = puntos.map((p) => `${X(p.lng).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(' ')
  const ultimo = puntos[puntos.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40">
      {geocercas.map((g) => (
        <g key={g.id}>
          <circle cx={X(g.lng)} cy={Y(g.lat)} r={rPx(g.radio)} fill="rgba(201,162,75,0.12)" stroke="#c9a24b" strokeDasharray="4 3" />
          <text x={X(g.lng)} y={Y(g.lat) - rPx(g.radio) - 3} textAnchor="middle" className="fill-slate-400" fontSize="10">{g.nombre}</text>
        </g>
      ))}
      {puntos.length > 1 && <polyline points={linea} fill="none" stroke="#13233f" strokeWidth="2.5" strokeLinejoin="round" />}
      {puntos.map((p, i) => <circle key={i} cx={X(p.lng)} cy={Y(p.lat)} r="2.5" fill="#94a3b8" />)}
      {ultimo && <circle cx={X(ultimo.lng)} cy={Y(ultimo.lat)} r="7" fill="#f59e0b" stroke="#fff" strokeWidth="2" />}
    </svg>
  )
}

export default function MapaVivo() {
  const { tenantId } = useBulkAuth()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: geocercas } = useColeccion('geofences')
  const [sel, setSel] = useState('')
  const [track, setTrack] = useState([])
  const [verChat, setVerChat] = useState(false)

  const activas = useMemo(() => ordenes.filter((o) => ESTADOS_ACTIVOS_CHOFER.includes(o.estado)), [ordenes])
  const orden = activas.find((o) => o.id === sel) || activas[0] || null

  useEffect(() => {
    if (!orden?.id) { setTrack([]); return }
    const off = suscribirTrack(tenantId, orden.id, setTrack)
    return off
  }, [tenantId, orden?.id])

  const met = useMemo(() => metricasRecorrido(track), [track])

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>Mapa en vivo</PageTitle>
      {activas.length === 0 ? <EstadoVacio titulo="Nada en movimiento" texto="Cuando un chofer tenga una orden activa, su recorrido se verá aquí en tiempo real." mostrarBoton={false} /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Órdenes activas ({activas.length})</div>
            <div className="space-y-2">
              {activas.map((o) => (
                <button key={o.id} onClick={() => setSel(o.id)} className={`block w-full rounded-xl border p-3 text-left ${orden?.id === o.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                  <div className="flex items-center gap-2"><Navigation size={14} className="text-amber-500" /><span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span><Badge color="navy">{ORDEN_ESTADO_LABEL[o.estado]}</Badge></div>
                  <div className="mt-0.5 text-xs text-slate-400">{o.choferNombre || 'sin chofer'} · {o.material}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            {orden && (
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{orden.numero}</span>
                  <Badge color="gold">{ORDEN_ESTADO_LABEL[orden.estado]}</Badge>
                  <span className="text-xs text-slate-400">{orden.choferNombre}</span>
                  <button onClick={() => setVerChat((v) => !v)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"><MessageSquare size={14} /> {verChat ? 'Ocultar chat' : 'Chat'}</button>
                </div>
                {verChat && <div className="mb-3"><ChatOrden orden={orden} alto={280} /></div>}
                <RutaSVG puntos={track} geocercas={geocercas} />
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
                <p className="mt-3 text-[11px] text-slate-400">Mapa esquemático a escala. La capa de mapas reales (Google/Apple) se conecta en la fase de APIs; los datos de recorrido ya son reales.</p>
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
