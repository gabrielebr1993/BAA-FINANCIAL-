import { useMemo, useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Truck, Phone, Star, User, FileWarning, Package, Weight, DollarSign, Award, Briefcase, AlertTriangle, Loader, Layers, Clock, Search } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { guardar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { tsMillis } from '../data/chatKeys'
import { fechaOrden, calificacionTransporte } from '../domain/perfilChofer'
import { estadoDocumento } from '../domain/facturacion'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { Card, Badge, Cargando, EstadoVacio, Boton, Spinner, Input } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const FIN = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const ACTIVAS = [E.NOTIFICANDO, E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const EN_PROCESO = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const n = (v) => Number(v) || 0
const tonDe = (o) => n(o.pesoReal ?? o.pesoEstimado)
const DOC_COLOR = { vencido: 'red', proximo: 'gold', ok: 'green', sin_fecha: 'slate' }
const DOC_LABEL = { vencido: 'Vencido', proximo: 'Por vencer', ok: 'Vigente', sin_fecha: 'Sin fecha' }
const COLOR_EST = { creada: 'slate', en_cola: 'slate', notificando: 'gold', aceptada: 'navy', en_planta: 'navy', cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green', liberada: 'green', cerrada: 'green', cancelada: 'red', rechazada: 'red' }
const fechaCorta = (ms) => (ms > 0 ? new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

function agrupar(lista, keyFn) {
  const m = new Map()
  for (const o of lista) {
    const k = keyFn(o); if (k == null || k === '') continue
    const g = m.get(k) || { key: k, viajes: 0, ton: 0, ingreso: 0 }
    g.viajes += 1; g.ton += tonDe(o); g.ingreso += n(o.precioCliente)
    m.set(k, g)
  }
  return [...m.values()].map((g) => ({ ...g, ton: Math.round(g.ton) })).sort((a, b) => b.ton - a.ton || b.viajes - a.viajes)
}

export default function TransportistaPerfil() {
  const { t } = useLang()
  const { id } = useParams()
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos: carriers, cargando } = useColeccion('carriers')
  const { datos: ordenes } = useOrdenesConPagos()
  const { datos: documentos } = useColeccion('documents')
  const { datos: jobs } = useColeccion('jobs')

  const carrier = useMemo(() => carriers.find((c) => c.id === id) || null, [carriers, id])
  const misOrdenes = useMemo(
    () => ordenes.filter((o) => o.transportistaId === id).slice().sort((a, b) => tsMillis(fechaOrden(b)) - tsMillis(fechaOrden(a))),
    [ordenes, id],
  )
  const trabajos = useMemo(() => jobs.filter((j) => (j.transportistasAutorizados || []).includes(id)), [jobs, id])
  const choferes = useMemo(() => {
    const gestion = (carrier?.choferes || []).map((d) => d.nombre)
    const deOrdenes = misOrdenes.map((o) => o.choferNombre).filter(Boolean)
    return [...new Set([...gestion, ...deOrdenes])]
  }, [carrier, misOrdenes])
  const docs = useMemo(() => documentos.filter((d) => d.carrierId === id).map((d) => ({ ...d, ...estadoDocumento(d.vence) })), [documentos, id])
  const nombreJob = (jid) => jobs.find((j) => j.id === jid)?.nombre || jid
  const jobCompat = (job) => !job.tipoEquipo || (carrier?.equipos || []).map((x) => x.toLowerCase()).includes((job.tipoEquipo || '').toLowerCase())

  // Multiselección de trabajos (lista con buscador). Se editan localmente y se
  // PERSISTEN al pulsar Guardar (cada job guarda su transportistasAutorizados).
  const asociadosSet = useMemo(() => new Set(jobs.filter((j) => (j.transportistasAutorizados || []).includes(id)).map((j) => j.id)), [jobs, id])
  const [sel, setSel] = useState(null)
  const [guardandoJobs, setGuardandoJobs] = useState(false)
  const [buscarJob, setBuscarJob] = useState('')
  const [editJobs, setEditJobs] = useState(false)
  // Re-sincroniza con lo persistido cuando cambia de verdad (tras guardar o cambio externo).
  useEffect(() => { setSel(new Set(asociadosSet)) }, [asociadosSet])
  const cur = sel || asociadosSet
  const dirty = sel && (sel.size !== asociadosSet.size || [...sel].some((x) => !asociadosSet.has(x)))
  const toggleSel = (jid) => setSel((s) => { const nn = new Set(s || asociadosSet); nn.has(jid) ? nn.delete(jid) : nn.add(jid); return nn })
  const guardarJobs = async () => {
    if (!sel) return
    setGuardandoJobs(true)
    try {
      for (const j of jobs) {
        const debe = sel.has(j.id); const esta = asociadosSet.has(j.id)
        if (debe === esta) continue
        const aut = j.transportistasAutorizados || []
        await guardar('jobs', j.id, { transportistasAutorizados: debe ? [...aut, id] : aut.filter((x) => x !== id) })
      }
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'autorizar_transporte', entidad: 'carrier', entidadId: id, detalle: `${carrier?.nombre}: trabajos actualizados (${sel.size})` })
    } finally { setGuardandoJobs(false) }
  }

  if (cargando) return <Cargando />
  if (!carrier) return (
    <div><Link to="/bulk/transportistas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver')}</Link><EstadoVacio titulo={t('Transporte no encontrado')} texto="" mostrarBoton={false} /></div>
  )

  const entregadas = misOrdenes.filter((o) => FIN.includes(o.estado))
  const ton = Math.round(entregadas.reduce((a, o) => a + tonDe(o), 0))
  const ingreso = entregadas.reduce((a, o) => a + n(o.precioCliente), 0)
  const utilidad = entregadas.reduce((a, o) => a + (n(o.precioTransportista) - n(o.pagoChofer)), 0)
  const stats = {
    total: misOrdenes.length,
    activas: misOrdenes.filter((o) => ACTIVAS.includes(o.estado)).length,
    proceso: misOrdenes.filter((o) => EN_PROCESO.includes(o.estado)).length,
    entregadas: entregadas.length,
    ton, ingreso, utilidad,
    dolarPorTon: ton ? Math.round((ingreso / ton) * 100) / 100 : 0,
  }
  const porTrabajo = agrupar(misOrdenes, (o) => o.jobId).map((g) => ({ ...g, nombre: nombreJob(g.key) }))
  const porMaterial = agrupar(misOrdenes, (o) => o.material)
  const porEstado = misOrdenes.reduce((m, o) => { m[o.estado] = (m[o.estado] || 0) + 1; return m }, {})
  const maxTonMat = Math.max(1, ...porMaterial.map((m) => m.ton))
  const inicial = (carrier.nombre || '?').charAt(0).toUpperCase()
  // Rendimiento de la compañía = promedio de las calificaciones de sus choferes
  // (mejores choferes → mejor compañía). Solo el admin lo ve, para comparar quién rinde mejor.
  const esAdmin = rol === 'admin' || rol === 'super_admin'
  // Cálculo plano (NO hook) porque va después de los early-returns de arriba.
  const calif = calificacionTransporte({ ordenes: misOrdenes, choferesRoster: carrier?.choferes || [] })

  return (
    <div className="w-full">
      <Link to="/bulk/transportistas" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Transportistas')}</Link>

      {/* Portada tipo perfil */}
      <Card className="mb-4 overflow-hidden p-0">
        <div className="h-28 bg-gradient-to-r from-brand-navy via-slate-800 to-amber-600" />
        <div className="px-5 pb-5">
          {/* Avatar SOLO sobre la portada; el nombre va debajo (sin taparse). */}
          <div className="-mt-12 grid h-20 w-20 place-items-center rounded-2xl border-4 border-white bg-amber-500 text-3xl font-black text-slate-900 shadow-lg dark:border-slate-900">{inicial}</div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="m-0 truncate text-xl font-black text-brand-navy dark:text-slate-100">{carrier.nombre}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                {carrier.contacto && <span className="inline-flex items-center gap-1"><Phone size={12} /> {carrier.contacto}</span>}
                <span className="inline-flex items-center gap-1"><User size={12} /> {choferes.length} {t('chofer(es)')}</span>
              </div>
            </div>
            {/* Rendimiento de la compañía (promedio de sus choferes) — solo admin. */}
            {esAdmin && (
              <div className="flex flex-col items-end gap-1">
                {calif.rating != null ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <div className="flex">
                        {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={16} className={i <= Math.round(calif.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'} />)}
                      </div>
                      <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{calif.rating.toFixed(1)}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">{t('Rendimiento (promedio de')} {calif.calificados} {t('chofer(es))')}</span>
                  </>
                ) : <span className="text-xs text-slate-400">{t('Sin calificación de choferes')}</span>}
              </div>
            )}
          </div>
          {(carrier.equipos || []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">{carrier.equipos.map((e) => <Badge key={e} color="navy">{e}</Badge>)}</div>
          )}

          {/* Trabajos asociados (colapsado; se expande para editar) */}
          <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
            <div className="flex items-center gap-1.5">
              <Briefcase size={13} className="text-amber-500" />
              <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">{t('Trabajos asociados')} ({editJobs ? cur.size : trabajos.length})</span>
              <button type="button" onClick={() => setEditJobs((v) => !v)} className="ml-auto text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400">{editJobs ? t('Cerrar') : t('Editar')}</button>
            </div>
            {!editJobs ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {trabajos.length ? trabajos.map((j) => <Badge key={j.id} color="gold">{j.nombre}</Badge>) : <span className="text-xs text-slate-400">{t('Sin trabajos asociados. Toca Editar para agregar.')}</span>}
              </div>
            ) : jobs.length === 0 ? <span className="mt-2 block text-xs text-slate-400">{t('Sin trabajos. Créalos en Trabajos.')}</span> : (
              <div className="mt-2">
                {jobs.length > 4 && (
                  <div className="relative mb-2">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input value={buscarJob} onChange={(e) => setBuscarJob(e.target.value)} placeholder={t('Buscar trabajo…')} className="w-full py-1.5 pl-8 text-sm" />
                  </div>
                )}
                <div className="scroll-thin max-h-64 space-y-1 overflow-y-auto pr-1">
                  {jobs
                    .filter((j) => !buscarJob.trim() || (j.nombre || '').toLowerCase().includes(buscarJob.trim().toLowerCase()) || (j.codigo || '').toLowerCase().includes(buscarJob.trim().toLowerCase()))
                    .map((j) => {
                      const on = cur.has(j.id)
                      const compat = jobCompat(j)
                      return (
                        <label key={j.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 ${on ? 'border-amber-300 bg-amber-500/5 dark:border-amber-500/30' : 'border-slate-100 dark:border-slate-700/50'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleSel(j.id)} className="h-4 w-4 flex-shrink-0 accent-amber-500" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-brand-navy dark:text-slate-100">{j.nombre}</span>
                              {j.codigo && <span className="flex-shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{j.codigo}</span>}
                              {!compat && <span className="inline-flex flex-shrink-0 items-center gap-0.5 text-[10px] font-semibold text-rose-500"><AlertTriangle size={10} /> {t('sin equipo')}</span>}
                            </div>
                            {j.tipoEquipo && <div className="text-[10px] text-slate-400">{j.tipoEquipo}</div>}
                          </div>
                        </label>
                      )
                    })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Boton variant="gold" disabled={!dirty || guardandoJobs} onClick={guardarJobs} className="px-3 py-1.5 text-sm">
                    {guardandoJobs ? <><Spinner /> {t('Guardando…')}</> : t('Guardar')}
                  </Boton>
                  {dirty && <button type="button" onClick={() => setSel(new Set(asociadosSet))} className="text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200">{t('Descartar')}</button>}
                  {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">{t('cambios sin guardar')}</span>}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">{t('Marca los trabajos de los que este transporte (y sus choferes) recibe órdenes, y guarda. Los marcados “sin equipo” no reciben órdenes hasta darles ese equipo.')}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Métricas */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Mini icon={Package} label={t('Órdenes')} val={stats.total} sub={`${stats.activas} ${t('activas')}`} />
        <Mini icon={Loader} label={t('En proceso')} val={stats.proceso} />
        <Mini icon={Award} label={t('Entregadas')} val={stats.entregadas} />
        <Mini icon={Weight} label={t('Toneladas')} val={stats.ton} />
        <Mini icon={DollarSign} label={t('Facturado')} val={money(stats.ingreso)} />
        <Mini icon={DollarSign} label={t('Utilidad')} val={money(stats.utilidad)} />
        <Mini icon={DollarSign} label="$/ton" val={stats.dolarPorTon ? money(stats.dolarPorTon) : '—'} />
        <Mini icon={User} label={t('Choferes')} val={choferes.length} />
        <Mini icon={Briefcase} label={t('Trabajos')} val={trabajos.length} />
        <Mini icon={Layers} label={t('Materiales')} val={porMaterial.length} />
        <Mini icon={FileWarning} label={t('Documentos')} val={docs.length} />
        <Mini icon={Truck} label={t('Equipos')} val={(carrier.equipos || []).length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Columna izquierda: trabajo */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Briefcase size={15} className="text-amber-500" /> {t('Rendimiento por trabajo')}</h3>
            {porTrabajo.length === 0 ? <p className="text-sm text-slate-400">{t('Aún sin órdenes.')}</p> : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="pb-1 pr-2 font-semibold">{t('Trabajo')}</th>
                      <th className="pb-1 px-2 text-right font-semibold">{t('Viajes')}</th>
                      <th className="pb-1 px-2 text-right font-semibold">{t('Toneladas')}</th>
                      <th className="pb-1 pl-2 text-right font-semibold">{t('Facturado')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porTrabajo.map((g) => (
                      <tr key={g.key} className="border-t border-slate-100 dark:border-slate-700/50">
                        <td className="py-1.5 pr-2 font-medium text-brand-navy dark:text-slate-100">{g.nombre}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{g.viajes}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{g.ton}</td>
                        <td className="py-1.5 pl-2 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(g.ingreso)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Layers size={15} className="text-amber-500" /> {t('Materiales movidos')}</h3>
            {porMaterial.length === 0 ? <p className="text-sm text-slate-400">{t('Aún sin órdenes.')}</p> : (
              <div className="space-y-2">
                {porMaterial.map((m) => (
                  <div key={m.key}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-brand-navy dark:text-slate-100">{t(m.key)}</span>
                      <span className="tabular-nums text-slate-400">{m.ton} ton · {m.viajes} {t('viajes')} · {money(m.ingreso)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(4, (m.ton / maxTonMat) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Clock size={15} className="text-amber-500" /> {t('Actividad')} <span className="text-xs font-normal text-slate-400">({misOrdenes.length})</span></h3>
            {misOrdenes.length === 0 ? <p className="text-sm text-slate-400">{t('Aún sin órdenes.')}</p> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {misOrdenes.slice(0, 24).map((o) => {
                  const fin = FIN.includes(o.estado)
                  const ms = tsMillis(fechaOrden(o))
                  return (
                    <Link key={o.id} to={`/bulk/ordenes/${o.id}`} className="rounded-xl border border-slate-100 p-2.5 transition hover:border-amber-300 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                        <Badge color={COLOR_EST[o.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                        {o.choferNombre && <span className="ml-auto inline-flex items-center gap-0.5 text-xs text-slate-400"><User size={11} /> {o.choferNombre}</span>}
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

        {/* Columna derecha: plantilla y documentos */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><User size={15} className="text-amber-500" /> {t('Choferes')} ({choferes.length})</h3>
            {choferes.length === 0 ? <p className="text-sm text-slate-400">{t('Sin choferes registrados en órdenes.')}</p> : (
              <div className="scroll-thin max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {choferes.map((c) => (
                  <Link key={c} to={`/bulk/chofer/${encodeURIComponent(c)}`} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800">{(c || '?').charAt(0)}</div>
                    <span className="text-sm font-medium text-brand-navy dark:text-slate-100">{c}</span>
                    <span className="ml-auto text-xs text-amber-600">{t('ver perfil →')}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><FileWarning size={15} className="text-amber-500" /> {t('Documentos')} ({docs.length})</h3>
            {docs.length === 0 ? <p className="text-sm text-slate-400">{t('Sin documentos registrados.')}</p> : (
              <div className="space-y-1.5">
                {docs.sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9)).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-brand-navy dark:text-slate-100">{t(d.tipo)}</span>
                    {d.numero && <span className="text-xs text-slate-400">#{d.numero}</span>}
                    <span className="ml-auto text-xs text-slate-400">{d.vence}</span>
                    <Badge color={DOC_COLOR[d.estado]}>{t(DOC_LABEL[d.estado])}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Distribución por estado */}
          {misOrdenes.length > 0 && (
            <Card className="p-4">
              <h3 className="m-0 mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Órdenes por estado')}</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(porEstado).sort((a, b) => b[1] - a[1]).map(([est, cnt]) => (
                  <Badge key={est} color={COLOR_EST[est] || 'slate'}>{t(ORDEN_ESTADO_LABEL[est] || est)} · {cnt}</Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Mini({ icon: Icon, label, val, sub }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400"><Icon size={12} /> {label}</div>
      <div className="mt-0.5 text-lg font-black text-brand-navy dark:text-slate-100">{val}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </Card>
  )
}
