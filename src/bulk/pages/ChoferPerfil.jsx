import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, User, Truck, Package, Weight, DollarSign, Award, Star, Camera, Briefcase, Phone, IdCard, ThumbsDown, CheckCircle2, Clock, Loader, Gauge, Timer, Layers, Building2, MapPin, AlertTriangle, TrendingUp, CalendarDays, Scale, FileText, FileSpreadsheet, Trash2, Download } from 'lucide-react'
import { exportarExcel, exportarPDF } from '../../utils/exportar'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
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
  const { datos: ordenes, cargando } = useOrdenesConPagos()
  const { datos: carriers } = useColeccion('carriers')
  const { datos: jobs } = useColeccion('jobs')
  const { datos: clientes } = useColeccion('clients')
  const { datos: plants } = useColeccion('plants')
  const { datos: incidents } = useColeccion('incidents')
  const { datos: equipment } = useColeccion('equipment')
  const { datos: driverProfiles } = useColeccion('driverProfiles')
  const equiposAct = equipment.filter((e) => e.activo !== false)
  const perfilDriver = driverProfiles.find((p) => clave(p.nombre) === clave(nombre)) || null
  const jobsAct = jobs.filter((j) => j.activo !== false)
  const [subiendo, setSubiendo] = useState(false)
  const [zoomFoto, setZoomFoto] = useState(null) // foto ampliada (lightbox)
  const [menuDescarga, setMenuDescarga] = useState(false) // Excel / PDF

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

  // Edita un campo persistente del chofer en la plantilla (equipo, jobs, …).
  const editarRoster = async (patch) => {
    if (!rosterCarrier) return
    const nuevos = (rosterCarrier.choferes || []).map((d) => (clave(d.nombre) === clave(nombre) ? { ...d, ...patch } : d))
    await guardar('carriers', rosterCarrier.id, { choferes: nuevos })
  }
  const toggleRosterEquipo = (eq) => {
    const actuales = rosterChofer?.equipos || (rosterChofer?.equipo ? [rosterChofer.equipo] : [])
    const nuevos = actuales.includes(eq) ? actuales.filter((x) => x !== eq) : [...actuales, eq]
    editarRoster({ equipos: nuevos, equipo: nuevos[0] || '' })
  }
  const nombreJob = (id) => jobs.find((j) => j.id === id)?.nombre || jobs.find((j) => j.id === id)?.codigo || id
  const toggleRosterJob = (id) => {
    const actuales = rosterChofer?.jobs || []
    const nuevos = actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]
    editarRoster({ jobs: nuevos, jobsNombres: nuevos.map(nombreJob) })
  }

  if (cargando) return <Cargando />
  if (!nombre || !existe) return (
    <div><Link to="/bulk/transportistas" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Volver')}</Link><EstadoVacio titulo={t('Chofer sin actividad')} texto={`${t('No hay órdenes registradas para')} ${nombre || t('este chofer')}.`} mostrarBoton={false} /></div>
  )

  const activo = rosterChofer ? rosterChofer.activo !== false : null

  // Descargas: imagen (documento/foto) y ficha completa en texto.
  const descargarImagen = (dataUrl, base) => {
    try {
      const ext = (String(dataUrl).match(/^data:image\/(\w+)/) || [])[1] || 'jpg'
      const a = document.createElement('a'); a.href = dataUrl; a.download = `${base}.${ext}`; a.click()
    } catch { /* noop */ }
  }
  // Filas de la ficha (mismas para Excel y PDF).
  const fichaFilas = () => {
    const b = perfilDriver?.banco || {}
    return [
      ['Chofer', nombre],
      ['Transporte', rosterCarrier?.nombre || '—'],
      ['Estado', activo ? 'Activo' : activo === false ? 'Inactivo' : '—'],
      ['Teléfono', rosterChofer?.telefono || '—'],
      ['Licencia', rosterChofer?.licencia || '—'],
      ['Equipos', (equipos || []).join(', ') || '—'],
      ['Trabajos afiliado', (rosterChofer?.jobsNombres && rosterChofer.jobsNombres.length ? rosterChofer.jobsNombres : (rosterChofer?.jobs || []).map(nombreJob)).join(', ') || '—'],
      ['Órdenes', String(stats.total)],
      ['Entregadas', String(stats.entregadas)],
      ['Toneladas', String(stats.ton)],
      ['Pago acumulado', money(stats.pago)],
      ['Aceptación', tasaAceptacion != null ? tasaAceptacion + '%' : '—'],
      ['Puntualidad', puntualidad != null ? puntualidad + '%' : '—'],
      ['Rechazos', String(rechazos)],
      ['Calificación', rating != null ? String(rating) : '—'],
      ['Banco · Titular', b.titular || '—'],
      ['Banco', b.banco || '—'],
      ['Cuenta', b.cuenta || '—'],
      ['Routing/CLABE', b.routing || '—'],
    ]
  }
  const baseArchivo = () => `chofer_${(nombre || '').replace(/\s+/g, '_')}`
  const descargarExcel = () => {
    setMenuDescarga(false)
    const rows = fichaFilas().map(([Campo, Valor]) => ({ Campo, Valor }))
    exportarExcel(baseArchivo(), [{ nombre: 'Ficha', rows }])
  }
  const descargarPDF = async () => {
    setMenuDescarga(false)
    await exportarPDF(baseArchivo(), nombre, t('Ficha del chofer'), [{ titulo: null, head: [t('Campo'), t('Valor')], body: fichaFilas() }])
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-3">
        <Link to="/bulk/transportistas" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Transportistas')}</Link>
        <div className="relative ml-auto">
          <button onClick={() => setMenuDescarga((v) => !v)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-navy shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"><Download size={15} /> {t('Descargar ficha')} <span className="text-slate-400">▾</span></button>
          {menuDescarga && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuDescarga(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">{t('Descargar como')}</div>
                <button onClick={descargarExcel} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-brand-navy transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"><FileSpreadsheet size={15} className="text-emerald-600" /> {t('Excel')}</button>
                <button onClick={descargarPDF} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-brand-navy transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"><FileText size={15} className="text-rose-600" /> {t('PDF')}</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cabecera estilo perfil */}
      <Card className="mb-4 overflow-hidden p-0">
        <div className="h-24 bg-gradient-to-r from-amber-500 via-amber-600 to-brand-navy" />
        <div className="px-5 pb-5">
          <div className="-mt-12 flex flex-wrap items-end gap-4">
            <div className="relative">
              {(perfilDriver?.foto || rosterChofer?.foto)
                ? <img src={perfilDriver?.foto || rosterChofer.foto} alt={nombre} onClick={() => setZoomFoto(perfilDriver?.foto || rosterChofer.foto)} title={t('Ver foto en grande')} className="h-24 w-24 flex-shrink-0 cursor-zoom-in rounded-full border-4 border-white object-cover shadow-lg transition hover:brightness-95 dark:border-slate-900" />
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
            {rosterChofer && (() => {
              const eqCh = rosterChofer.equipos || (rosterChofer.equipo ? [rosterChofer.equipo] : [])
              return (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Truck size={12} /> {t('Equipos (camiones):')}</span>
                  {equiposAct.map((eq) => {
                    const on = eqCh.includes(eq.nombre)
                    return <button key={eq.id} type="button" onClick={() => toggleRosterEquipo(eq.nombre)} className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${on ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}>{eq.nombre}</button>
                  })}
                  {eqCh.length === 0 && <span className="text-[11px] text-amber-600 dark:text-amber-400">{t('sin equipo, no recibirá órdenes')}</span>}
                </div>
              )
            })()}
            {rosterChofer && jobsAct.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Briefcase size={12} /> {t('Afiliado a:')}</span>
                {jobsAct.map((j) => {
                  const on = (rosterChofer.jobs || []).includes(j.id)
                  return <button key={j.id} type="button" onClick={() => toggleRosterJob(j.id)} className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${on ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}>{j.nombre || j.codigo}</button>
                })}
                {(rosterChofer.jobs || []).length === 0 && <span className="text-[11px] text-slate-400">{t('todos los trabajos')}</span>}
              </div>
            )}
            {transportes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">{t('Transporte:')}</span>
                {transportes.map((id) => <Link key={id} to={`/bulk/transportistas/${id}`}><Badge color="navy"><Truck size={10} className="mr-0.5 inline" />{nombreCarrier(id)}</Badge></Link>)}
              </div>
            )}
            {trabajos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400">{t('Ha trabajado en')}:</span>
                {trabajos.map((j) => <Badge key={j.id} color="gold"><Briefcase size={10} className="mr-0.5 inline" />{j.nombre}</Badge>)}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Documentos del chofer (licencia y social) — el chofer los sube; el admin los ve/borra */}
      {perfilDriver && (perfilDriver.licenciaFoto || perfilDriver.socialFoto) && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><FileText size={16} className="text-amber-500" /> {t('Documentos del chofer')}</div>
          <div className="flex flex-wrap gap-4">
            {[{ campo: 'licenciaFoto', l: t('Licencia') }, { campo: 'socialFoto', l: t('Seguro social') }].map((d) => perfilDriver[d.campo] && (
              <div key={d.campo} className="relative">
                <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">{d.l}</div>
                <img src={perfilDriver[d.campo]} alt={d.l} onClick={() => setZoomFoto(perfilDriver[d.campo])} title={t('Ver en grande')} className="h-32 cursor-zoom-in rounded-lg border border-slate-200 object-cover transition hover:brightness-95 dark:border-slate-700" />
                <div className="absolute right-1 top-6 flex flex-col gap-1">
                  <button onClick={() => descargarImagen(perfilDriver[d.campo], `${nombre}_${d.campo}`)} title={t('Descargar')} className="grid h-6 w-6 place-items-center rounded-full bg-brand-navy text-white shadow dark:bg-slate-700"><Download size={13} /></button>
                  <button onClick={() => { if (window.confirm(`${t('¿Borrar')} ${d.l}? ${t('El chofer podrá subirla de nuevo.')}`)) guardar('driverProfiles', perfilDriver.id, { [d.campo]: null }) }} title={t('Borrar')} className="grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white shadow"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Datos bancarios del chofer (MilePay) — capturados por él en su app */}
      {perfilDriver?.banco && (perfilDriver.banco.titular || perfilDriver.banco.cuenta || perfilDriver.banco.banco) && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><DollarSign size={16} className="text-emerald-500" /> {t('Datos bancarios (MilePay)')}</div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-[11px] uppercase text-slate-400">{t('Titular')}</div><div className="font-medium text-brand-navy dark:text-slate-100">{perfilDriver.banco.titular || '—'}</div></div>
            <div><div className="text-[11px] uppercase text-slate-400">{t('Banco')}</div><div className="font-medium text-brand-navy dark:text-slate-100">{perfilDriver.banco.banco || '—'}</div></div>
            <div><div className="text-[11px] uppercase text-slate-400">{t('N.º de cuenta')}</div><div className="font-mono font-medium text-brand-navy dark:text-slate-100">{perfilDriver.banco.cuenta || '—'}</div></div>
            <div><div className="text-[11px] uppercase text-slate-400">Routing / CLABE</div><div className="font-mono font-medium text-brand-navy dark:text-slate-100">{perfilDriver.banco.routing || '—'}</div></div>
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-12">
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

      {/* Visor de foto a pantalla completa: se cierra al tocar en cualquier lado. */}
      {zoomFoto && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" onClick={() => setZoomFoto(null)}>
          <img src={zoomFoto} alt={nombre} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setZoomFoto(null)} className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white hover:bg-white/25">{t('Cerrar')}</button>
        </div>
      )}
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
