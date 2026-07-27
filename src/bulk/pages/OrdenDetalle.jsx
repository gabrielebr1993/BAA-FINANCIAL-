import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Truck, User, Building2, Package, DollarSign, FileText, AlertTriangle, MessageSquare, CheckCircle2, Circle } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { suscribirTrack } from '../data/tracking'
import { useBulkAuth } from '../BulkAuthContext'
import { desgloseVisible } from '../domain/pagos'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_HITOS } from '../domain/constants'
import MapaLeaflet from '../components/MapaLeaflet'
import ChatOrden from '../components/ChatOrden'
import { Card, Badge, Cargando, EstadoVacio } from '../../components/ui'
import { money } from '../../utils/format'

const COLOR_ESTADO = {
  creada: 'slate', en_cola: 'slate', notificando: 'gold', aceptada: 'navy', en_planta: 'navy',
  cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green', liberada: 'green',
  cerrada: 'green', cancelada: 'red', rechazada: 'red',
}
const hora = (ts) => (ts ? new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null)

export default function OrdenDetalle() {
  const { id } = useParams()
  const { tenantId, rol } = useBulkAuth()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: plantas } = useColeccion('plants')
  const { datos: incidencias } = useColeccion('incidents')
  const [track, setTrack] = useState([])

  const orden = useMemo(() => ordenes.find((o) => o.id === id) || null, [ordenes, id])

  useEffect(() => {
    if (!orden?.id) { setTrack([]); return }
    const off = suscribirTrack(tenantId, orden.id, setTrack)
    return off
  }, [tenantId, orden?.id])

  if (cargando) return <Cargando />
  if (!orden) return (
    <div>
      <Link to="/bulk/ordenes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> Volver a Órdenes</Link>
      <EstadoVacio titulo="Orden no encontrada" texto="Puede que se haya borrado o el enlace sea incorrecto." mostrarBoton={false} />
    </div>
  )

  const cliente = clientes.find((c) => c.id === orden.clienteId)
  const carrier = carriers.find((c) => c.id === orden.transportistaId)
  const planta = plantas.find((p) => p.id === orden.plantaId)
  const fin = desgloseVisible(orden, rol)
  const incs = incidencias.filter((i) => i.orden && i.orden === orden.numero)
  const hitosHechos = ORDEN_HITOS.filter((h) => orden.hitos?.[h.key]).length

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/bulk/ordenes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> Volver a Órdenes</Link>

      {/* Encabezado */}
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Package size={24} /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 font-mono text-2xl font-black text-brand-navy dark:text-slate-100">{orden.numero}</h1>
              <Badge color={COLOR_ESTADO[orden.estado] || 'slate'}>{ORDEN_ESTADO_LABEL[orden.estado]}</Badge>
              {orden.urgente && <Badge color="red">Urgente</Badge>}
            </div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{orden.material || 'material s/e'} · {orden.pesoReal ?? orden.pesoEstimado} ton · {orden.tipoEquipo || 'equipo s/e'}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[11px] uppercase text-slate-400">Avance</div>
            <div className="text-xl font-black text-brand-navy dark:text-slate-100">{Math.round((hitosHechos / ORDEN_HITOS.length) * 100)}%</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Datos */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Información</h3>
          <div className="space-y-2.5 text-sm">
            <Dato icon={Building2} label="Cliente" val={cliente?.nombre || '—'} />
            <Dato icon={MapPin} label="Planta / origen" val={planta ? `${planta.nombre}${planta.direccion ? ` · ${planta.direccion}` : ''}` : '—'} />
            <Dato icon={MapPin} label="Entrega (lo que ve el driver)" val={orden.direccionEntrega || '—'} />
            {orden.po && <Dato icon={FileText} label="PO" val={orden.po} />}
            <Dato icon={Truck} label="Transporte" val={carrier?.nombre || 'sin asignar'} />
            <Dato icon={User} label="Chofer" val={orden.choferNombre || 'sin asignar'} />
            {'precioCliente' in fin && fin.precioCliente != null && <Dato icon={DollarSign} label="Precio cliente" val={money(fin.precioCliente)} />}
            {'pagoChofer' in fin && fin.pagoChofer != null && <Dato icon={DollarSign} label="Pago chofer" val={money(fin.pagoChofer)} />}
            {orden.ticket?.numero && <Dato icon={FileText} label="Ticket de carga" val={`#${orden.ticket.numero}${orden.ticket.peso ? ` · ${orden.ticket.peso} ton` : ''}`} />}
          </div>
          {orden.ticket?.foto && <img src={orden.ticket.foto} alt="ticket" className="mt-3 max-h-44 rounded-lg border border-slate-200 dark:border-slate-700" />}
        </Card>

        {/* Trayectoria (hitos) */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Trayectoria</h3>
          <ol className="relative ml-1 space-y-3 border-l border-slate-200 pl-5 dark:border-slate-700">
            {ORDEN_HITOS.map((h) => {
              const ts = orden.hitos?.[h.key]
              return (
                <li key={h.key} className="relative">
                  <span className="absolute -left-[27px] top-0.5 grid place-items-center">
                    {ts ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} className="text-slate-300 dark:text-slate-600" />}
                  </span>
                  <div className={`text-sm font-medium ${ts ? 'text-brand-navy dark:text-slate-100' : 'text-slate-400'}`}>{h.label}</div>
                  <div className="text-xs text-slate-400">{hora(ts) || 'pendiente'}</div>
                </li>
              )
            })}
          </ol>
        </Card>
      </div>

      {/* Recorrido */}
      <Card className="mt-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Recorrido y geocercas</h3>
        <MapaLeaflet puntos={track} alto={360} />
        {(orden.geoEventos || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {orden.geoEventos.map((ev, i) => (
              <Badge key={i} color={ev.evento === 'entrada' ? 'green' : 'slate'}><MapPin size={11} className="mr-0.5 inline" />{ev.evento} · {ev.geocerca} · {hora(ev.ts)}</Badge>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Incidencias */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><AlertTriangle size={15} className="text-amber-500" /> Incidencias ({incs.length})</h3>
          {incs.length === 0 ? <p className="text-sm text-slate-400">Sin incidencias registradas para esta orden.</p> : (
            <div className="space-y-2">
              {incs.map((inc) => (
                <div key={inc.id} className="rounded-lg border border-slate-100 p-2.5 dark:border-slate-700/50">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold capitalize text-brand-navy dark:text-slate-100">{inc.tipo}</span><Badge color={inc.estado === 'resuelta' ? 'green' : inc.estado === 'en_proceso' ? 'gold' : 'red'}>{inc.estado}</Badge></div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">{inc.descripcion}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Chat */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><MessageSquare size={15} className="text-amber-500" /> Chat de la orden</h3>
          <ChatOrden orden={orden} alto={300} />
        </Card>
      </div>
    </div>
  )
}

function Dato({ icon: Icon, label, val }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 flex-shrink-0 text-slate-400" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="font-medium text-brand-navy dark:text-slate-100">{val}</div>
      </div>
    </div>
  )
}
