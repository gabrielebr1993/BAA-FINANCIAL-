import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Truck, Phone, Star, User, FileWarning, Package, Weight, DollarSign, Award } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { estadoDocumento } from '../domain/facturacion'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { Card, Badge, Cargando, EstadoVacio } from '../../components/ui'
import { money } from '../../utils/format'

const FIN = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const ACTIVAS = [E.NOTIFICANDO, E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const n = (v) => Number(v) || 0
const DOC_COLOR = { vencido: 'red', proximo: 'gold', ok: 'green', sin_fecha: 'slate' }
const DOC_LABEL = { vencido: 'Vencido', proximo: 'Por vencer', ok: 'Vigente', sin_fecha: 'Sin fecha' }

export default function TransportistaPerfil() {
  const { id } = useParams()
  const { datos: carriers, cargando } = useColeccion('carriers')
  const { datos: ordenes } = useColeccion('orders')
  const { datos: documentos } = useColeccion('documents')

  const carrier = useMemo(() => carriers.find((c) => c.id === id) || null, [carriers, id])
  const misOrdenes = useMemo(() => ordenes.filter((o) => o.transportistaId === id), [ordenes, id])
  const choferes = useMemo(() => [...new Set(misOrdenes.map((o) => o.choferNombre).filter(Boolean))], [misOrdenes])
  const docs = useMemo(() => documentos.filter((d) => d.carrierId === id).map((d) => ({ ...d, ...estadoDocumento(d.vence) })), [documentos, id])

  if (cargando) return <Cargando />
  if (!carrier) return (
    <div><Link to="/bulk/transportistas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> Volver</Link><EstadoVacio titulo="Transporte no encontrado" texto="" mostrarBoton={false} /></div>
  )

  const entregadas = misOrdenes.filter((o) => FIN.includes(o.estado))
  const stats = {
    total: misOrdenes.length,
    activas: misOrdenes.filter((o) => ACTIVAS.includes(o.estado)).length,
    entregadas: entregadas.length,
    ton: Math.round(entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)),
    ingreso: entregadas.reduce((a, o) => a + n(o.precioCliente), 0),
  }
  const inicial = (carrier.nombre || '?').charAt(0).toUpperCase()

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/bulk/transportistas" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> Transportistas</Link>

      {/* Portada tipo perfil */}
      <Card className="mb-4 overflow-hidden p-0">
        <div className="h-28 bg-gradient-to-r from-brand-navy via-slate-800 to-amber-600" />
        <div className="px-5 pb-5">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <div className="grid h-20 w-20 flex-shrink-0 place-items-center rounded-2xl border-4 border-white bg-amber-500 text-3xl font-black text-slate-900 shadow-lg dark:border-slate-900">{inicial}</div>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="m-0 text-xl font-black text-brand-navy dark:text-slate-100">{carrier.nombre}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                {carrier.contacto && <span className="inline-flex items-center gap-1"><Phone size={12} /> {carrier.contacto}</span>}
                {carrier.calificacion != null && <span className="inline-flex items-center gap-1 text-amber-500"><Star size={12} className="fill-amber-500" /> {carrier.calificacion}</span>}
                <span className="inline-flex items-center gap-1"><User size={12} /> {choferes.length} chofer(es)</span>
              </div>
            </div>
          </div>
          {(carrier.equipos || []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">{carrier.equipos.map((e) => <Badge key={e} color="navy">{e}</Badge>)}</div>
          )}
        </div>
      </Card>

      {/* Métricas */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini icon={Package} label="Órdenes" val={stats.total} sub={`${stats.activas} activas`} />
        <Mini icon={Award} label="Entregadas" val={stats.entregadas} />
        <Mini icon={Weight} label="Toneladas" val={stats.ton} />
        <Mini icon={DollarSign} label="Facturado" val={money(stats.ingreso)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Choferes */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><User size={15} className="text-amber-500" /> Choferes ({choferes.length})</h3>
          {choferes.length === 0 ? <p className="text-sm text-slate-400">Sin choferes registrados en órdenes.</p> : (
            <div className="space-y-1.5">
              {choferes.map((c) => (
                <Link key={c} to={`/bulk/chofer/${encodeURIComponent(c)}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800">{(c || '?').charAt(0)}</div>
                  <span className="text-sm font-medium text-brand-navy dark:text-slate-100">{c}</span>
                  <span className="ml-auto text-xs text-amber-600">ver perfil →</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Documentos */}
        <Card className="p-4">
          <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><FileWarning size={15} className="text-amber-500" /> Documentos ({docs.length})</h3>
          {docs.length === 0 ? <p className="text-sm text-slate-400">Sin documentos registrados.</p> : (
            <div className="space-y-1.5">
              {docs.sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9)).map((d) => (
                <div key={d.id} className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-brand-navy dark:text-slate-100">{d.tipo}</span>
                  {d.numero && <span className="text-xs text-slate-400">#{d.numero}</span>}
                  <span className="ml-auto text-xs text-slate-400">{d.vence}</span>
                  <Badge color={DOC_COLOR[d.estado]}>{DOC_LABEL[d.estado]}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Órdenes recientes */}
      <Card className="mt-4 p-4">
        <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Truck size={15} className="text-amber-500" /> Órdenes</h3>
        {misOrdenes.length === 0 ? <p className="text-sm text-slate-400">Aún sin órdenes.</p> : (
          <div className="space-y-1.5">
            {misOrdenes.slice(0, 12).map((o) => (
              <Link key={o.id} to={`/bulk/ordenes/${o.id}`} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                <Badge color="slate">{ORDEN_ESTADO_LABEL[o.estado]}</Badge>
                <span className="text-xs text-slate-400">{o.material} · {o.pesoReal ?? o.pesoEstimado} t</span>
                <span className="ml-auto text-xs text-amber-600">ficha →</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function Mini({ icon: Icon, label, val, sub }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400"><Icon size={12} /> {label}</div>
      <div className="mt-0.5 text-xl font-black text-brand-navy dark:text-slate-100">{val}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </Card>
  )
}
