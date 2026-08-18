import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Building2, Package, Weight, DollarSign, Award, Loader, Layers, Clock, FileText, MapPin, Hash } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { tsMillis } from '../data/chatKeys'
import { fechaOrden } from '../domain/perfilChofer'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { Card, Badge, Cargando, EstadoVacio } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'
import TarifasCliente from '../components/TarifasCliente'

const FIN = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const EN_PROCESO_EST = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const n = (v) => Number(v) || 0
const tonDe = (o) => n(o.pesoReal ?? o.pesoEstimado)
const COLOR_EST = { creada: 'slate', en_cola: 'slate', notificando: 'gold', aceptada: 'navy', en_planta: 'navy', cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green', liberada: 'green', cerrada: 'green', cancelada: 'red', rechazada: 'red' }
const fechaCorta = (ms) => (ms > 0 ? new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

function agrupar(lista, keyFn) {
  const m = new Map()
  for (const o of lista) {
    const k = keyFn(o); if (k == null || k === '') continue
    const g = m.get(k) || { key: k, viajes: 0, ton: 0, gasto: 0 }
    g.viajes += 1; g.ton += tonDe(o); g.gasto += n(o.precioCliente)
    m.set(k, g)
  }
  return [...m.values()].map((g) => ({ ...g, ton: Math.round(g.ton) })).sort((a, b) => b.gasto - a.gasto || b.viajes - a.viajes)
}

export default function ClientePerfil() {
  const { t } = useLang()
  const { id } = useParams()
  const { datos: clientes, cargando } = useColeccion('clients')
  const { datos: ordenes } = useOrdenesConPagos()
  const { datos: plants } = useColeccion('plants')
  const { datos: invoices } = useColeccion('invoices')
  const { datos: jobs } = useColeccion('jobs')
  const { datos: materiales } = useColeccion('materials')
  const { datos: equipos } = useColeccion('equipment')

  const cliente = useMemo(() => clientes.find((c) => c.id === id) || null, [clientes, id])
  const misOrdenes = useMemo(
    () => ordenes.filter((o) => o.clienteId === id).slice().sort((a, b) => tsMillis(fechaOrden(b)) - tsMillis(fechaOrden(a))),
    [ordenes, id],
  )
  const misPlantas = useMemo(() => plants.filter((p) => p.clienteId === id), [plants, id])
  const misFacturas = useMemo(() => invoices.filter((f) => f.clienteId === id), [invoices, id])
  const nombreJob = (jid) => jobs.find((j) => j.id === jid)?.nombre || jid

  if (cargando) return <Cargando />
  if (!cliente) return (
    <div><Link to="/bulk/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver')}</Link><EstadoVacio titulo={t('Cliente no encontrado')} texto="" mostrarBoton={false} /></div>
  )

  const entregadas = misOrdenes.filter((o) => FIN.includes(o.estado))
  const stats = {
    total: misOrdenes.length,
    proceso: misOrdenes.filter((o) => EN_PROCESO_EST.includes(o.estado)).length,
    entregadas: entregadas.length,
    ton: Math.round(entregadas.reduce((a, o) => a + tonDe(o), 0)),
    gasto: entregadas.reduce((a, o) => a + n(o.precioCliente), 0),
    facturado: misFacturas.reduce((a, f) => a + n(f.total), 0),
  }
  const porMaterial = agrupar(misOrdenes, (o) => o.material)
  const porTrabajo = agrupar(misOrdenes, (o) => o.jobId).map((g) => ({ ...g, nombre: nombreJob(g.key) }))
  const maxGastoMat = Math.max(1, ...porMaterial.map((m) => m.gasto))
  const inicial = (cliente.nombre || '?').charAt(0).toUpperCase()

  return (
    <div className="w-full">
      <Link to="/bulk/clientes" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Clientes y Plantas')}</Link>

      <Card className="mb-4 overflow-hidden p-0">
        <div className="h-20 bg-gradient-to-r from-brand-navy via-slate-800 to-emerald-600" />
        {/* Solo el avatar sube sobre el degradado; el nombre queda SIEMPRE debajo, en
            zona blanca (antes se encimaba con los colores al reajustarse). */}
        <div className="flex flex-col gap-3 px-5 pb-5 sm:flex-row sm:items-end">
          <div className="-mt-12 grid h-20 w-20 flex-shrink-0 place-items-center rounded-2xl border-4 border-white bg-emerald-500 text-3xl font-black text-white shadow-lg dark:border-slate-900">{inicial}</div>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-xl font-black text-brand-navy dark:text-slate-100">{cliente.nombre}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1"><Building2 size={12} /> {t('Cliente')}</span>
              {cliente.rfc && <span className="inline-flex items-center gap-1"><Hash size={11} /> {cliente.rfc}</span>}
              {cliente.contacto && <span>{cliente.contacto}</span>}
              {cliente.facturacion && <Badge color="slate">{cliente.facturacion}</Badge>}
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Mini icon={Package} label={t('Órdenes')} val={stats.total} />
        <Mini icon={Loader} label={t('En proceso')} val={stats.proceso} />
        <Mini icon={Award} label={t('Entregadas')} val={stats.entregadas} />
        <Mini icon={Weight} label={t('Toneladas')} val={stats.ton} />
        <Mini icon={DollarSign} label={t('Gasto')} val={money(stats.gasto)} />
        <Mini icon={FileText} label={t('Facturado')} val={money(stats.facturado)} />
      </div>

      {/* Motor de tarifas PROPIO de este cliente */}
      <div className="mb-4"><TarifasCliente cliente={cliente} materiales={materiales} equipos={equipos} /></div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Layers size={15} className="text-amber-500" /> {t('Gasto por material')}</h3>
            {porMaterial.length === 0 ? <p className="text-sm text-slate-400">{t('Aún sin órdenes.')}</p> : (
              <div className="space-y-2">
                {porMaterial.map((m) => (
                  <div key={m.key}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-brand-navy dark:text-slate-100">{t(m.key)}</span>
                      <span className="tabular-nums text-slate-400">{m.ton} ton · {m.viajes} {t('viajes')} · {money(m.gasto)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, (m.gasto / maxGastoMat) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {porTrabajo.length > 0 && (
            <Card className="p-4">
              <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Rendimiento por trabajo')}</h3>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="pb-1 pr-2 font-semibold">{t('Trabajo')}</th><th className="pb-1 px-2 text-right font-semibold">{t('Viajes')}</th><th className="pb-1 px-2 text-right font-semibold">{t('Toneladas')}</th><th className="pb-1 pl-2 text-right font-semibold">{t('Gasto')}</th>
                  </tr></thead>
                  <tbody>
                    {porTrabajo.map((g) => (
                      <tr key={g.key} className="border-t border-slate-100 dark:border-slate-700/50">
                        <td className="py-1.5 pr-2 font-medium text-brand-navy dark:text-slate-100">{g.nombre}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{g.viajes}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{g.ton}</td>
                        <td className="py-1.5 pl-2 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(g.gasto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Clock size={15} className="text-amber-500" /> {t('Actividad')} <span className="text-xs font-normal text-slate-400">({misOrdenes.length})</span></h3>
            {misOrdenes.length === 0 ? <p className="text-sm text-slate-400">{t('Aún sin órdenes.')}</p> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {misOrdenes.slice(0, 24).map((o) => {
                  const ms = tsMillis(fechaOrden(o))
                  return (
                    <Link key={o.id} to={`/bulk/ordenes/${o.id}`} className="rounded-xl border border-slate-100 p-2.5 transition hover:border-amber-300 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                        <Badge color={COLOR_EST[o.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                        {o.precioCliente != null && <span className="ml-auto text-sm font-semibold text-emerald-600 dark:text-emerald-400">{money(o.precioCliente)}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                        <span>{t(o.material || 'material s/e')} · {o.pesoReal ?? o.pesoEstimado} ton</span>
                        {ms > 0 && <span className="ml-auto">{fechaCorta(ms)}</span>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><MapPin size={15} className="text-amber-500" /> {t('Plantas')} ({misPlantas.length})</h3>
            {misPlantas.length === 0 ? <p className="text-sm text-slate-400">{t('Sin plantas registradas.')}</p> : (
              <div className="space-y-1.5">
                {misPlantas.map((p) => (
                  <div key={p.id} className="rounded-lg border border-slate-100 p-2 text-sm dark:border-slate-700/50">
                    <div className="font-medium text-brand-navy dark:text-slate-100">{p.nombre}</div>
                    {p.direccion && <div className="text-xs text-slate-400">{p.direccion}</div>}
                    {(p.materiales || []).length > 0 && <div className="mt-1 flex flex-wrap gap-1">{p.materiales.map((m) => <Badge key={m} color="green">{t(m)}</Badge>)}</div>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><FileText size={15} className="text-amber-500" /> {t('Facturas')} ({misFacturas.length})</h3>
            {misFacturas.length === 0 ? <p className="text-sm text-slate-400">{t('Aún no tienes facturas.')}</p> : (
              <div className="space-y-1.5">
                {misFacturas.slice().sort((a, b) => tsMillis(b.ts) - tsMillis(a.ts)).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{f.numero}</span>
                    <span className="text-xs text-slate-400">{f.desde} → {f.hasta}</span>
                    <span className="ml-auto font-semibold">{money(f.total)}</span>
                    <Badge color={f.estado === 'pagada' ? 'green' : f.estado === 'firmada' ? 'navy' : 'gold'}>{f.estado}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Mini({ icon: Icon, label, val }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400"><Icon size={12} /> {label}</div>
      <div className="mt-0.5 text-lg font-black text-brand-navy dark:text-slate-100">{val}</div>
    </Card>
  )
}
