import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, User, Truck, Package, Weight, DollarSign, Award, Star, Camera, Briefcase, Phone, IdCard, ThumbsDown, CheckCircle2, Clock, Loader, Gauge, Timer, Layers, Building2, MapPin, AlertTriangle, TrendingUp, CalendarDays, Scale } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { tsMillis } from '../data/chatKeys'
import { perfilDeChofer, fechaOrden } from '../domain/perfilChofer'
import { leerFotoReducida } from '../components/foto'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { Card, Badge, Cargando, EstadoVacio, Spinner } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const FIN = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const clave = (s) => (s || '').trim().toLowerCase()
const COLOR_EST = { creada: 'slate', en_cola: 'slate', notificando: 'gold', aceptada: 'navy', en_planta: 'navy', cargando: 'navy', en_ruta: 'blue', en_destino: 'blue', entregada: 'green', liberada: 'green', cerrada: 'green', cancelada: 'red', rechazada: 'red' }
const fechaCorta = (ms) => (ms > 0 ? new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export default function ChoferPerfil() {
  const { t } = useLang()
  const { nombre: nombreRaw } = useParams()
  const nombre = decodeURIComponent(nombreRaw || '')
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: jobs } = useColeccion('jobs')
  const { datos: clientes } = useColeccion('clients')
  const { datos: plants } = useColeccion('plants')
  const { datos: incidents } = useColeccion('incidents')
  const [subiendo, setSubiendo] = useState(false)

  const perfil = useMemo(
    () => perfilDeChofer({ ordenes, carriers, jobs, clientes, plants, incidents, nombre }),
    [ordenes, carriers, jobs, clientes, plants, incidents, nombre],
  )
  const {
    misOrdenes, rechazos, rosterCarrier, rosterChofer, transportes, trabajos, stats, existe,
    enProcesoN, pagoPromedio, tonPromedio, dolarPorTon, tiempoPromMin, puntualidad,
    primeraOrden, ultimaOrden, porMaterial, porEstado, equipos, porTrabajo, clientesTrab, plantasTrab,
    misIncidencias, rating, rechazaMucho, confiable, tasaAceptacion,
  } = perfil
  const nombreCarrier = (id) => carriers.find((c) => c.id === id)?.nombre || '—'
  const maxTonMat = Math.max(1, ...porMaterial.map((m) => m.ton))

  const subirFoto = async (e) => {
    const f = await leerFotoReducida(e.target.files?.[0]); if (!f) return
    if (!rosterCarrier) { window.alert(t('Este chofer no está en la plantilla de ningún transporte. Agrégalo en “Choferes” para guardar su foto.')); return }
    setSubiendo(true)
    try {
      const nuevos = (rosterCarrier.choferes || []).map((d) => (clave(d.nombre) === clave(nombre) ? { ...d, foto: f } : d))
      await guardar('carriers', rosterCarrier.id, { choferes: nuevos })
    } finally { setSubiendo(false) }
  }

  if (cargando) return <Cargando />
  if (!nombre || !existe) return (
    <div><Link to="/bulk/transportistas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver')}</Link><EstadoVacio titulo={t('Chofer sin actividad')} texto={`${t('No hay órdenes registradas para')} ${nombre || t('este chofer')}.`} mostrarBoton={false} /></div>
  )

  const activo = rosterChofer ? rosterChofer.activo !== false : null

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/bulk/transportistas" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Transportistas')}</Link>

      {/* Cabecera estilo perfil */}
      <Card className="mb-4 overflow-hidden p-0">
        <div className="h-24 bg-gradient-to-r from-amber-500 via-amber-600 to-brand-navy" />
        <div className="px-5 pb-5">
          <div className="-mt-12 flex flex-wrap items-end gap-4">
            <div className="relative">
              {rosterChofer?.foto
                ? <img src={rosterChofer.foto} alt={nombre} className="h-24 w-24 flex-shrink-0 rounded-full border-4 border-white object-cover shadow-lg dark:border-slate-900" />
                : <div className="grid h-24 w-24 flex-shrink-0 place-items-center rounded-full border-4 border-white bg-brand-navy text-4xl font-black text-white shadow-lg dark:border-slate-900">{(nombre || '?').charAt(0).toUpperCase()}</div>}
              <label className="absolute bottom-0 right-0 grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-white bg-amber-500 text-slate-900 shadow dark:border-slate-900" title={t('Cambiar foto')}>
                {subiendo ? <Spinner /> : <Camera size={15} />}
                <input type="file" accept="image/*" onChange={subirFoto} className="hidden" disabled={subiendo} />
              </label>
            </div>
            <div className="pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-xl font-black text-brand-navy dark:text-slate-100">{nombre}</h1>
                {activo != null && <Badge color={activo ? 'green' : 'slate'}>{activo ? t('Activo') : t('Inactivo')}</Badge>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1"><User size={12} /> {t('Chofer')}</span>
                {rosterChofer?.telefono && <span className="inline-flex items-center gap-1"><Phone size={11} /> {rosterChofer.telefono}</span>}
                {rosterChofer?.licencia && <span className="inline-flex items-center gap-1"><IdCard size={11} /> {rosterChofer.licencia}</span>}
                {primeraOrden && <span className="inline-flex items-center gap-1"><CalendarDays size={11} /> {t('Desde')} {fechaCorta(primeraOrden)}</span>}
              </div>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1.5 pb-1">
              <div className="flex items-center gap-1.5">
                {rating != null ? (
                  <>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={16} className={i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'} />)}
                    </div>
                    <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{rating.toFixed(1)}</span>
                  </>
                ) : <span className="text-xs text-slate-400">{t('Sin calificación')}</span>}
              </div>
              {rechazaMucho
                ? <Badge color="red"><ThumbsDown size={11} className="mr-0.5 inline" />{t('Rechaza muchas órdenes')} · {rechazos}</Badge>
                : confiable
                  ? <Badge color="green"><CheckCircle2 size={11} className="mr-0.5 inline" />{t('No rechaza órdenes')}</Badge>
                  : <Badge color="slate">{rechazos} {t('rechazo(s)')}</Badge>}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {transportes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">{t('Transporte:')}</span>
                {transportes.map((id) => <Link key={id} to={`/bulk/transportistas/${id}`}><Badge color="navy"><Truck size={10} className="mr-0.5 inline" />{nombreCarrier(id)}</Badge></Link>)}
              </div>
            )}
            {trabajos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">{t('Trabajos')}:</span>
                {trabajos.map((j) => <Badge key={j.id} color="gold"><Briefcase size={10} className="mr-0.5 inline" />{j.nombre}</Badge>)}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Mini icon={Package} label={t('Órdenes')} val={stats.total} />
        <Mini icon={Award} label={t('Entregadas')} val={stats.entregadas} />
        <Mini icon={Loader} label={t('En proceso')} val={enProcesoN} />
        <Mini icon={ThumbsDown} label={t('Rechazos')} val={rechazos} />
        <Mini icon={Weight} label={t('Toneladas')} val={stats.ton} />
        <Mini icon={DollarSign} label={t('Pago acumulado')} val={money(stats.pago)} />
        <Mini icon={Gauge} label={t('Aceptación')} val={tasaAceptacion != null ? `${tasaAceptacion}%` : '—'} />
        <Mini icon={Timer} label={t('Prom. entrega')} val={tiempoPromMin != null ? `${tiempoPromMin} min` : '—'} />
        <Mini icon={TrendingUp} label={t('Puntualidad')} val={puntualidad != null ? `${puntualidad}%` : '—'} />
        <Mini icon={Scale} label={t('Ton promedio')} val={tonPromedio || '—'} />
        <Mini icon={DollarSign} label={t('Pago promedio')} val={pagoPromedio ? money(pagoPromedio) : '—'} />
        <Mini icon={DollarSign} label="$/ton" val={dolarPorTon ? money(dolarPorTon) : '—'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Columna izquierda: trabajo */}
        <div className="space-y-4 lg:col-span-2">
          {/* Rendimiento por trabajo */}
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Briefcase size={15} className="text-amber-500" /> {t('Rendimiento por trabajo')}</h3>
            {porTrabajo.length === 0 ? <p className="text-sm text-slate-400">{t('Sin actividad todavía.')}</p> : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="pb-1 pr-2 font-semibold">{t('Trabajo')}</th>
                      <th className="pb-1 px-2 text-right font-semibold">{t('Viajes')}</th>
                      <th className="pb-1 px-2 text-right font-semibold">{t('Toneladas')}</th>
                      <th className="pb-1 pl-2 text-right font-semibold">{t('Pago')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porTrabajo.map((g) => (
                      <tr key={g.key} className="border-t border-slate-100 dark:border-slate-700/50">
                        <td className="py-1.5 pr-2 font-medium text-brand-navy dark:text-slate-100">{g.nombre}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{g.viajes}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{g.ton}</td>
                        <td className="py-1.5 pl-2 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(g.pago)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Materiales movidos */}
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Layers size={15} className="text-amber-500" /> {t('Materiales movidos')}</h3>
            {porMaterial.length === 0 ? <p className="text-sm text-slate-400">{t('Sin actividad todavía.')}</p> : (
              <div className="space-y-2">
                {porMaterial.map((m) => (
                  <div key={m.key}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-brand-navy dark:text-slate-100">{t(m.key)}</span>
                      <span className="tabular-nums text-slate-400">{m.ton} ton · {m.viajes} {t('viajes')} · {money(m.pago)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(4, (m.ton / maxTonMat) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Actividad reciente */}
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Clock size={15} className="text-amber-500" /> {t('Actividad')} <span className="text-xs font-normal text-slate-400">({misOrdenes.length})</span></h3>
            {misOrdenes.length === 0 ? (
              <p className="text-sm text-slate-400">{t('Sin actividad todavía.')}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {misOrdenes.slice(0, 24).map((o) => {
                  const fin = FIN.includes(o.estado)
                  const ms = tsMillis(fechaOrden(o))
                  return (
                    <Link key={o.id} to={`/bulk/ordenes/${o.id}`} className="rounded-xl border border-slate-100 p-2.5 transition hover:border-amber-300 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-800">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                        <Badge color={COLOR_EST[o.estado] || 'navy'}>{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                        {o.pagoChofer != null && <span className="ml-auto text-sm font-semibold text-emerald-600 dark:text-emerald-400">{money(o.pagoChofer)}</span>}
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

        {/* Columna derecha: ficha y detalle */}
        <div className="space-y-4">
          {/* Ficha / resumen */}
          <Card className="p-4">
            <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Ficha')}</h3>
            <div className="space-y-1.5 text-sm">
              <Row label={t('Estado')}>{activo == null ? '—' : <Badge color={activo ? 'green' : 'slate'}>{activo ? t('Activo') : t('Inactivo')}</Badge>}</Row>
              <Row label={t('Transporte:')}>{transportes.length ? transportes.map((id) => nombreCarrier(id)).join(', ') : '—'}</Row>
              <Row label={t('Aceptación')}>{tasaAceptacion != null ? `${tasaAceptacion}%` : '—'}</Row>
              <Row label={t('Puntualidad')}>{puntualidad != null ? `${puntualidad}%` : '—'}</Row>
              <Row label={t('Prom. entrega')}>{tiempoPromMin != null ? `${tiempoPromMin} min` : '—'}</Row>
              <Row label={t('Primera orden')}>{fechaCorta(primeraOrden)}</Row>
              <Row label={t('Última orden')}>{fechaCorta(ultimaOrden)}</Row>
            </div>
            {/* Por estado */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(porEstado).sort((a, b) => b[1] - a[1]).map(([est, n]) => (
                <Badge key={est} color={COLOR_EST[est] || 'slate'}>{t(ORDEN_ESTADO_LABEL[est] || est)} · {n}</Badge>
              ))}
            </div>
          </Card>

          {/* Equipos */}
          {equipos.length > 0 && (
            <Card className="p-4">
              <h3 className="m-0 mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Truck size={15} className="text-amber-500" /> {t('Equipos usados')}</h3>
              <div className="flex flex-wrap gap-1.5">{equipos.map((e) => <Badge key={e} color="navy">{e}</Badge>)}</div>
            </Card>
          )}

          {/* Clientes y plantas */}
          {(clientesTrab.length > 0 || plantasTrab.length > 0) && (
            <Card className="p-4">
              <h3 className="m-0 mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Building2 size={15} className="text-amber-500" /> {t('Clientes y plantas')}</h3>
              {clientesTrab.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{clientesTrab.map((c) => <Badge key={c.id} color="slate">{c.nombre}</Badge>)}</div>}
              {plantasTrab.length > 0 && <div className="flex flex-wrap gap-1.5">{plantasTrab.map((p) => <Badge key={p.id} color="gold"><MapPin size={10} className="mr-0.5 inline" />{p.nombre}</Badge>)}</div>}
            </Card>
          )}

          {/* Incidencias */}
          <Card className="p-4">
            <h3 className="m-0 mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><AlertTriangle size={15} className="text-amber-500" /> {t('Incidencias')} <span className="text-xs font-normal text-slate-400">({misIncidencias.length})</span></h3>
            {misIncidencias.length === 0 ? <p className="text-sm text-slate-400">{t('Sin incidencias')}</p> : (
              <div className="space-y-2">
                {misIncidencias.slice(0, 6).map((it, i) => (
                  <div key={it.id || i} className="rounded-lg border border-slate-100 p-2 text-xs dark:border-slate-700/50">
                    <div className="flex items-center gap-1.5">
                      <Badge color={it.estado === 'resuelta' ? 'green' : it.estado === 'en_proceso' ? 'gold' : 'red'}>{t(it.tipo)}</Badge>
                      {it.orden && <span className="font-mono text-slate-400">{it.orden}</span>}
                    </div>
                    {it.descripcion && <div className="mt-1 text-slate-500 dark:text-slate-400">{it.descripcion}</div>}
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

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-right font-medium text-brand-navy dark:text-slate-100">{children}</span>
    </div>
  )
}
