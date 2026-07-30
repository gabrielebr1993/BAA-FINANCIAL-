import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, User, Truck, Package, Weight, DollarSign, Award, Star, Camera, Briefcase, Phone, IdCard, ThumbsDown, CheckCircle2, Clock } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { leerFotoReducida } from '../components/foto'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { Card, Badge, Cargando, EstadoVacio, Spinner } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const FIN = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const n = (v) => Number(v) || 0
const clave = (s) => (s || '').trim().toLowerCase()
const fecha = (o) => o.hitos?.entrega || o.hitos?.tomada || o.creadoEn || ''

export default function ChoferPerfil() {
  const { t } = useLang()
  const { nombre: nombreRaw } = useParams()
  const nombre = decodeURIComponent(nombreRaw || '')
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: jobs } = useColeccion('jobs')
  const [subiendo, setSubiendo] = useState(false)

  const misOrdenes = useMemo(
    () => ordenes.filter((o) => clave(o.choferNombre) === clave(nombre)).slice().sort((a, b) => (fecha(b) || '').localeCompare(fecha(a) || '')),
    [ordenes, nombre],
  )
  // Rechazos hechos por este chofer (la orden guarda rechazo.por con su nombre).
  const rechazos = useMemo(() => ordenes.filter((o) => clave(o.rechazo?.por) === clave(nombre)).length, [ordenes, nombre])
  // Transporte/plantilla al que pertenece (carrier.choferes por nombre) + su ficha.
  const rosterCarrier = useMemo(() => carriers.find((c) => (c.choferes || []).some((d) => clave(d.nombre) === clave(nombre))), [carriers, nombre])
  const rosterChofer = rosterCarrier?.choferes?.find((d) => clave(d.nombre) === clave(nombre))
  const nombreCarrier = (id) => carriers.find((c) => c.id === id)?.nombre || '—'
  const transportes = useMemo(() => {
    const ids = new Set(misOrdenes.map((o) => o.transportistaId).filter(Boolean))
    if (rosterCarrier) ids.add(rosterCarrier.id)
    return [...ids]
  }, [misOrdenes, rosterCarrier])
  const trabajos = useMemo(() => {
    const ids = [...new Set(misOrdenes.map((o) => o.jobId).filter(Boolean))]
    return ids.map((id) => jobs.find((j) => j.id === id)).filter(Boolean)
  }, [misOrdenes, jobs])

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
  if (!nombre || (misOrdenes.length === 0 && !rosterCarrier)) return (
    <div><Link to="/bulk/transportistas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver')}</Link><EstadoVacio titulo={t('Chofer sin actividad')} texto={`${t('No hay órdenes registradas para')} ${nombre || t('este chofer')}.`} mostrarBoton={false} /></div>
  )

  const entregadas = misOrdenes.filter((o) => FIN.includes(o.estado))
  const stats = {
    total: misOrdenes.length,
    entregadas: entregadas.length,
    ton: Math.round(entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)),
    pago: entregadas.reduce((a, o) => a + n(o.pagoChofer), 0),
  }
  // Calificación derivada del desempeño: entregas vs rechazos (5 estrellas).
  const baseCalif = stats.entregadas + rechazos
  const rating = baseCalif > 0 ? Math.round((stats.entregadas / baseCalif) * 5 * 10) / 10 : null
  const rechazoRate = baseCalif > 0 ? rechazos / baseCalif : 0
  const rechazaMucho = rechazos >= 3 && rechazoRate > 0.3
  const confiable = rechazos === 0 && stats.entregadas > 0

  return (
    <div className="mx-auto max-w-4xl">
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
              <h1 className="m-0 text-xl font-black text-brand-navy dark:text-slate-100">{nombre}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1"><User size={12} /> {t('Chofer')}</span>
                {rosterChofer?.telefono && <span className="inline-flex items-center gap-1"><Phone size={11} /> {rosterChofer.telefono}</span>}
                {rosterChofer?.licencia && <span className="inline-flex items-center gap-1"><IdCard size={11} /> {rosterChofer.licencia}</span>}
              </div>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1.5 pb-1">
              {/* Calificación */}
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
              {/* Bandera de rechazos */}
              {rechazaMucho
                ? <Badge color="red"><ThumbsDown size={11} className="mr-0.5 inline" />{t('Rechaza muchas órdenes')} · {rechazos}</Badge>
                : confiable
                  ? <Badge color="green"><CheckCircle2 size={11} className="mr-0.5 inline" />{t('No rechaza órdenes')}</Badge>
                  : <Badge color="slate">{rechazos} {t('rechazo(s)')}</Badge>}
            </div>
          </div>

          {/* Pertenece a: transporte(s) y trabajo(s) */}
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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini icon={Package} label={t('Órdenes')} val={stats.total} />
        <Mini icon={Award} label={t('Entregadas')} val={stats.entregadas} />
        <Mini icon={Weight} label={t('Toneladas')} val={stats.ton} />
        <Mini icon={DollarSign} label={t('Pago acumulado')} val={money(stats.pago)} />
      </div>

      {/* Actividad (línea de tiempo) */}
      <Card className="p-4">
        <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Clock size={15} className="text-amber-500" /> {t('Actividad')}</h3>
        {misOrdenes.length === 0 ? (
          <p className="text-sm text-slate-400">{t('Sin actividad todavía.')}</p>
        ) : (
          <div className="relative space-y-3 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
            {misOrdenes.slice(0, 30).map((o) => {
              const fin = FIN.includes(o.estado)
              const f = fecha(o)
              return (
                <div key={o.id} className="relative flex gap-3">
                  <div className={`z-10 mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border-2 border-white dark:border-slate-900 ${fin ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-slate-900'}`}>
                    {fin ? <CheckCircle2 size={15} /> : <Truck size={15} />}
                  </div>
                  <Link to={`/bulk/ordenes/${o.id}`} className="min-w-0 flex-1 rounded-xl border border-slate-100 p-2.5 transition hover:border-amber-300 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                      <Badge color={fin ? 'green' : 'navy'}>{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                      {o.pagoChofer != null && <span className="ml-auto text-sm font-semibold text-emerald-600 dark:text-emerald-400">{money(o.pagoChofer)}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                      <span>{t(o.material || 'material s/e')} · {o.pesoReal ?? o.pesoEstimado} ton</span>
                      {o.transportistaId && <span>· {nombreCarrier(o.transportistaId)}</span>}
                      {f && <span className="ml-auto">{new Date(f).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>
        )}
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
