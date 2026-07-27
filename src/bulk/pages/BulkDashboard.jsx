import { useMemo } from 'react'
import { ClipboardList, Truck, Building2, Boxes, Layers, Weight } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { ORDEN_ESTADO } from '../domain/constants'
import { KPI, PageTitle, Card, Cargando, Badge } from '../../components/ui'
import { ORDEN_ESTADO_LABEL } from '../domain/constants'

export default function BulkDashboard() {
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: jobs } = useColeccion('jobs')

  const stats = useMemo(() => {
    const abiertas = ordenes.filter((o) => ![ORDEN_ESTADO.CERRADA, ORDEN_ESTADO.CANCELADA].includes(o.estado))
    const enCola = ordenes.filter((o) => [ORDEN_ESTADO.CREADA, ORDEN_ESTADO.EN_COLA, ORDEN_ESTADO.NOTIFICANDO].includes(o.estado))
    const tonEntregadas = ordenes.filter((o) => o.estado === ORDEN_ESTADO.CERRADA || o.estado === ORDEN_ESTADO.LIBERADA || o.estado === ORDEN_ESTADO.ENTREGADA)
      .reduce((a, o) => a + (Number(o.pesoReal ?? o.pesoEstimado) || 0), 0)
    const porEstado = {}
    for (const o of ordenes) porEstado[o.estado] = (porEstado[o.estado] || 0) + 1
    return { abiertas: abiertas.length, enCola: enCola.length, tonEntregadas, porEstado }
  }, [ordenes])

  if (cargando) return <Cargando texto="Cargando panel…" />

  return (
    <div>
      <PageTitle>Dashboard</PageTitle>
      <div className="mb-5 flex flex-wrap gap-3">
        <KPI label="Órdenes abiertas" value={stats.abiertas} icon={ClipboardList} accent="navy" />
        <KPI label="En cola" value={stats.enCola} icon={Layers} accent="gold" />
        <KPI label="Toneladas entregadas" value={Math.round(stats.tonEntregadas)} icon={Weight} accent="green" />
        <KPI label="Clientes" value={clientes.length} icon={Building2} accent="blue" />
        <KPI label="Transportistas" value={carriers.length} icon={Truck} accent="navy" />
        <KPI label="Trabajos" value={jobs.length} icon={Boxes} accent="gold" />
      </div>

      <Card className="p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Órdenes por estado</h3>
        {Object.keys(stats.porEstado).length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay órdenes. Crea un Trabajo (Job) y genera sus órdenes.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.porEstado).sort((a, b) => b[1] - a[1]).map(([e, n]) => (
              <Badge key={e} color="navy">{ORDEN_ESTADO_LABEL[e] || e}: {n}</Badge>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        Módulo Bulk (Fase 1). Próximas fases: GPS/geocercas en vivo, OCR de tickets, POD, chat por orden,
        facturación con firma, asignación con IA y notificaciones push/SMS.
      </p>
    </div>
  )
}
