import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, User, Truck, Package, Weight, DollarSign, Award } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { Card, Badge, Cargando, EstadoVacio } from '../../components/ui'
import { money } from '../../utils/format'

const FIN = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const n = (v) => Number(v) || 0

export default function ChoferPerfil() {
  const { nombre: nombreRaw } = useParams()
  const nombre = decodeURIComponent(nombreRaw || '')
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: carriers } = useColeccion('carriers')

  const misOrdenes = useMemo(() => ordenes.filter((o) => o.choferNombre === nombre), [ordenes, nombre])
  const nombreCarrier = (id) => carriers.find((c) => c.id === id)?.nombre || '—'
  const transportes = useMemo(() => [...new Set(misOrdenes.map((o) => o.transportistaId).filter(Boolean))], [misOrdenes])

  if (cargando) return <Cargando />
  if (!nombre || misOrdenes.length === 0) return (
    <div><Link to="/bulk/transportistas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> Volver</Link><EstadoVacio titulo="Chofer sin actividad" texto={`No hay órdenes registradas para ${nombre || 'este chofer'}.`} mostrarBoton={false} /></div>
  )

  const entregadas = misOrdenes.filter((o) => FIN.includes(o.estado))
  const stats = {
    total: misOrdenes.length,
    entregadas: entregadas.length,
    ton: Math.round(entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)),
    pago: entregadas.reduce((a, o) => a + n(o.pagoChofer), 0),
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/bulk/transportistas" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> Transportistas</Link>

      <Card className="mb-4 overflow-hidden p-0">
        <div className="h-24 bg-gradient-to-r from-amber-500 via-amber-600 to-brand-navy" />
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <div className="grid h-20 w-20 flex-shrink-0 place-items-center rounded-full border-4 border-white bg-brand-navy text-3xl font-black text-white shadow-lg dark:border-slate-900">{(nombre || '?').charAt(0)}</div>
            <div className="pb-1">
              <h1 className="m-0 text-xl font-black text-brand-navy dark:text-slate-100">{nombre}</h1>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><User size={12} /> Chofer</div>
            </div>
          </div>
          {transportes.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400">Transporte:</span>
              {transportes.map((t) => <Link key={t} to={`/bulk/transportistas/${t}`}><Badge color="navy"><Truck size={10} className="mr-0.5 inline" />{nombreCarrier(t)}</Badge></Link>)}
            </div>
          )}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini icon={Package} label="Órdenes" val={stats.total} />
        <Mini icon={Award} label="Entregadas" val={stats.entregadas} />
        <Mini icon={Weight} label="Toneladas" val={stats.ton} />
        <Mini icon={DollarSign} label="Pago acumulado" val={money(stats.pago)} />
      </div>

      <Card className="p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Órdenes</h3>
        <div className="space-y-1.5">
          {misOrdenes.slice(0, 20).map((o) => (
            <Link key={o.id} to={`/bulk/ordenes/${o.id}`} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <span className="font-mono font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
              <Badge color="slate">{ORDEN_ESTADO_LABEL[o.estado]}</Badge>
              <span className="text-xs text-slate-400">{o.material} · {o.pesoReal ?? o.pesoEstimado} t</span>
              <span className="ml-auto text-xs font-semibold text-emerald-600 dark:text-emerald-400">{money(o.pagoChofer)}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Mini({ icon: Icon, label, val }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400"><Icon size={12} /> {label}</div>
      <div className="mt-0.5 text-xl font-black text-brand-navy dark:text-slate-100">{val}</div>
    </Card>
  )
}
