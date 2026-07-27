import { useMemo } from 'react'
import { Radio, CheckCircle2, XCircle, Truck } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { transportistasCompatibles, transportistaCompatible } from '../domain/ordenes'
import { desgloseVisible } from '../domain/pagos'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { PageTitle, Card, Badge, Cargando, EstadoVacio, Select } from '../../components/ui'
import { money } from '../../utils/format'

const EN_COLA = [E.CREADA, E.EN_COLA, E.NOTIFICANDO]

export default function Ordenes() {
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: carriers } = useColeccion('carriers')

  const { cola, activas } = useMemo(() => {
    const cola = ordenes.filter((o) => EN_COLA.includes(o.estado))
    const activas = ordenes.filter((o) => !EN_COLA.includes(o.estado) && o.estado !== E.CANCELADA)
    return { cola, activas }
  }, [ordenes])

  const asignar = async (orden, carrierId) => {
    const carrier = carriers.find((c) => c.id === carrierId)
    // Regla dura: jamás asignar un equipo incompatible.
    if (carrier && !transportistaCompatible(carrier.equipos, orden.tipoEquipo)) {
      window.alert(`${carrier.nombre} no tiene el equipo requerido (${orden.tipoEquipo}).`); return
    }
    await guardar('orders', orden.id, { transportistaId: carrierId, estado: E.NOTIFICANDO })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'asignar_orden', entidad: 'orden', entidadId: orden.id, detalle: `Asignada a ${carrier?.nombre} · notificando` })
  }
  const aceptar = async (orden) => {
    await guardar('orders', orden.id, { estado: E.ACEPTADA, hitos: { ...(orden.hitos || {}), tomada: new Date().toISOString() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'aceptar_orden', entidad: 'orden', entidadId: orden.id })
  }
  const rechazar = async (orden) => {
    const motivo = window.prompt('Motivo del rechazo:') || 'Sin motivo'
    await guardar('orders', orden.id, { estado: E.CREADA, transportistaId: null, rechazo: { motivo, ts: new Date().toISOString() } })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'rechazar_orden', entidad: 'orden', entidadId: orden.id, detalle: motivo })
  }

  if (cargando) return <Cargando />
  const nombreCarrier = (id) => carriers.find((c) => c.id === id)?.nombre || '—'

  return (
    <div>
      <PageTitle>Órdenes / Cola</PageTitle>

      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2"><Radio size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Cola en tiempo real ({cola.length})</h3></div>
        {cola.length === 0 ? <p className="text-sm text-slate-400">No hay órdenes en cola. Genera órdenes desde un Trabajo (Job).</p> : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cola.map((o) => {
              const compat = transportistasCompatibles(carriers, o.tipoEquipo)
              const fin = desgloseVisible(o, rol)
              const notificando = o.estado === E.NOTIFICANDO
              return (
                <div key={o.id} className={`rounded-xl border p-3 ${notificando ? 'animate-pulse border-amber-400 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700/60'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                    <Badge color="navy">{o.pesoEstimado} ton</Badge>
                    {o.tipoEquipo && <Badge color="slate">{o.tipoEquipo}</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{o.material || 'material s/e'} · {ORDEN_ESTADO_LABEL[o.estado]}</div>
                  {'precioCliente' in fin && fin.precioCliente != null && <div className="mt-1 text-xs">Cliente: {money(fin.precioCliente)}</div>}
                  <div className="mt-2">
                    <Select className="w-full py-1 text-xs" value={o.transportistaId || ''} onChange={(e) => asignar(o, e.target.value)}>
                      <option value="">{compat.length ? 'Asignar transportista…' : 'Sin transportistas compatibles'}</option>
                      {compat.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </Select>
                  </div>
                  {notificando && (
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => aceptar(o)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white"><CheckCircle2 size={13} /> Aceptar</button>
                      <button onClick={() => rechazar(o)} className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white"><XCircle size={13} /> Rechazar</button>
                      <span className="ml-auto self-center text-[10px] text-slate-400">→ {nombreCarrier(o.transportistaId)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2"><Truck size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">En proceso / finalizadas ({activas.length})</h3></div>
        {activas.length === 0 ? <EstadoVacio texto="Cuando un chofer acepte una orden, saldrá de la cola y aparecerá aquí." mostrarBoton={false} /> : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-400"><th className="py-2">Orden</th><th>Ton</th><th>Equipo</th><th>Transportista</th><th>Estado</th></tr></thead>
              <tbody>
                {activas.map((o) => (
                  <tr key={o.id} className="border-t border-slate-100 dark:border-slate-700/50">
                    <td className="py-2 font-mono font-medium text-brand-navy dark:text-slate-100">{o.numero}</td>
                    <td>{o.pesoReal ?? o.pesoEstimado}</td>
                    <td>{o.tipoEquipo || '—'}</td>
                    <td>{nombreCarrier(o.transportistaId)}</td>
                    <td><Badge color={o.estado === E.CERRADA ? 'green' : 'gold'}>{ORDEN_ESTADO_LABEL[o.estado]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
