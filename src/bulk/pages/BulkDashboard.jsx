import { useMemo } from 'react'
import { ClipboardList, Truck, Building2, Weight, DollarSign, Timer, AlertTriangle, FileWarning, Award, FlaskConical, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useColeccion } from '../data/useColeccion'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { tiempoPromedioEntregaMin, estadoDocumento } from '../domain/facturacion'
import { KPI, PageTitle, Card, Cargando, Badge } from '../../components/ui'
import { BarCard, DonutCard } from '../../components/charts'
import { money } from '../../utils/format'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const n = (v) => Number(v) || 0

export default function BulkDashboard() {
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: documentos } = useColeccion('documents')
  const { datos: incidencias } = useColeccion('incidents')

  const s = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const enCola = ordenes.filter((o) => [E.CREADA, E.EN_COLA, E.NOTIFICANDO].includes(o.estado))
    const ton = entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)
    const ingresos = entregadas.reduce((a, o) => a + n(o.precioCliente), 0)
    const porEstado = {}; for (const o of ordenes) porEstado[o.estado] = (porEstado[o.estado] || 0) + 1
    const porMaterial = {}; for (const o of entregadas) { const m = o.material || '—'; porMaterial[m] = (porMaterial[m] || 0) + n(o.pesoReal ?? o.pesoEstimado) }
    const porChofer = {}; for (const o of entregadas) { const c = o.choferNombre || '—'; porChofer[c] = (porChofer[c] || 0) + 1 }
    const desvios = ordenes.reduce((a, o) => a + ((o.geoEventos || []).length ? 0 : 0), 0)
    const docsAlerta = documentos.map((d) => estadoDocumento(d.vence)).filter((x) => x.estado === 'vencido' || x.estado === 'proximo').length
    const incAbiertas = incidencias.filter((i) => i.estado !== 'resuelta').length
    return {
      abiertas: ordenes.filter((o) => ![E.CERRADA, E.CANCELADA].includes(o.estado)).length,
      enCola: enCola.length, entregadas: entregadas.length, ton, ingresos,
      tPromEntrega: tiempoPromedioEntregaMin(entregadas),
      porEstado,
      matData: Object.entries(porMaterial).map(([name, valor]) => ({ name, valor: Math.round(valor) })).sort((a, b) => b.valor - a.valor),
      estadoData: Object.entries(porEstado).map(([k, valor]) => ({ name: ORDEN_ESTADO_LABEL[k] || k, valor })),
      rankingChoferes: Object.entries(porChofer).map(([nombre, viajes]) => ({ nombre, viajes })).sort((a, b) => b.viajes - a.viajes).slice(0, 5),
      docsAlerta, incAbiertas,
    }
  }, [ordenes, documentos, incidencias])

  if (cargando) return <Cargando texto="Cargando panel…" />

  return (
    <div>
      <PageTitle>Dashboard</PageTitle>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KPI label="Órdenes abiertas" value={s.abiertas} icon={ClipboardList} accent="navy" />
        <KPI label="En cola" value={s.enCola} icon={ClipboardList} accent="gold" />
        <KPI label="Toneladas entregadas" value={Math.round(s.ton)} icon={Weight} accent="green" />
        <KPI label="Ingresos" value={money(s.ingresos)} icon={DollarSign} accent="blue" />
        <KPI label="T. prom. entrega" value={`${s.tPromEntrega} min`} icon={Timer} accent="navy" />
        <KPI label="Clientes" value={clientes.length} icon={Building2} accent="gold" />
        <KPI label="Transportistas" value={carriers.length} icon={Truck} accent="navy" />
      </div>

      {(s.docsAlerta > 0 || s.incAbiertas > 0) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {s.docsAlerta > 0 && <Card className="flex items-center gap-3 border-l-4 border-l-amber-500 p-4"><FileWarning className="text-amber-500" /><div><div className="font-bold text-brand-navy dark:text-slate-100">{s.docsAlerta} documento(s) por vencer</div><div className="text-xs text-slate-400">Revisa Documentos y vencimientos.</div></div></Card>}
          {s.incAbiertas > 0 && <Card className="flex items-center gap-3 border-l-4 border-l-rose-500 p-4"><AlertTriangle className="text-rose-500" /><div><div className="font-bold text-brand-navy dark:text-slate-100">{s.incAbiertas} incidencia(s) sin resolver</div><div className="text-xs text-slate-400">Revisa el Centro de incidencias.</div></div></Card>}
        </div>
      )}

      {s.entregadas === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500"><FlaskConical size={26} /></div>
          <div>
            <div className="text-base font-bold text-brand-navy dark:text-slate-100">Aún no hay datos que mostrar</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">Activa el Modo test para llenarlo con un negocio de ejemplo, o crea tu primer Trabajo y genera órdenes.</p>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Link to="/bulk/demo" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-105"><FlaskConical size={15} /> Activar modo test</Link>
            <Link to="/bulk/jobs" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"><Layers size={15} /> Crear trabajo</Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <BarCard title="Toneladas por material" data={s.matData} color="#c9a24b" fmt={(v) => `${v} t`} />
            <DonutCard title="Órdenes por estado" data={s.estadoData} fmt={(v) => v} />
          </div>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2"><Award size={17} className="text-brand-gold" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Choferes más eficientes (por viajes)</h3></div>
            {s.rankingChoferes.length === 0 ? <p className="text-sm text-slate-400">Sin datos.</p> : (
              <div className="space-y-1.5">
                {s.rankingChoferes.map((c, i) => (
                  <div key={c.nombre} className="flex items-center gap-2 text-sm">
                    <Badge color={i === 0 ? 'gold' : 'navy'}>#{i + 1}</Badge>
                    <span className="font-medium text-brand-navy dark:text-slate-100">{c.nombre}</span>
                    <span className="ml-auto text-slate-500">{c.viajes} viaje(s)</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
