// ============================================================================
// BULK · Portal del SUPERVISOR — mismo lenguaje visual del admin (KPIs, tabla,
// badges), enfocado en SUS TRABAJOS (jobs). AISLAMIENTO: solo ve las órdenes
// cuyo jobId está en sus trabajos asignados (bulk_users.jobIds, reforzado por
// las reglas con bMyJobs). COMPAT: un supervisor aún no migrado (solo con
// plantaId del modelo viejo) sigue viendo su planta hasta que le asignen jobs.
// Acción principal: confirmar/LIBERAR cargas entregadas (por código o lista).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { ShieldCheck, CheckCircle2, ClipboardList, Package, Truck, PackageCheck, KeyRound, RefreshCw, History, Copy, Clock, MapPin, Map as MapIcon, ArrowLeft } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useBulkAuth } from '../BulkAuthContext'
import PortalLayout from '../components/PortalLayout'
import MapaLeaflet from '../components/MapaLeaflet'
import { useColeccion, useDoc } from '../data/useColeccion'
import { guardar, suscribir, where } from '../data/repo'
import { liberar as liberarPresencia } from '../data/presencia'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { NIVEL_LABEL } from '../domain/liberacion'
import { beep, notificar } from '../integraciones/alertasLocales'
import { Card, KPI, Badge, Aviso, EstadoVacio, Tabla } from '../../components/ui'
import { useLang } from '../../i18n'

const FINAL = [E.ENTREGADA, E.LIBERADA, E.CERRADA, E.CANCELADA]
// Grupos de estado del panel: cada tarjeta KPI abre la lista de SUS órdenes.
const GRUPOS_ESTADO = {
  cola: { label: 'En cola (por aceptar)', estados: [E.CREADA, E.EN_COLA, E.NOTIFICANDO], icon: ClipboardList },
  hacia: { label: 'Hacia la planta', estados: [E.ACEPTADA], icon: Truck },
  planta: { label: 'En planta / cargando', estados: [E.EN_PLANTA, E.CARGANDO], icon: Package },
  ruta: { label: 'En ruta', estados: [E.EN_RUTA], icon: Truck },
}
const COLOR_NIVEL = { alta: 'green', media: 'gold', baja: 'slate', critico: 'red' }

export default function SupervisorPortal() {
  const { t } = useLang()
  const { usuario, tenantId, rol } = useBulkAuth()
  // Alcance por TRABAJOS, leído EN VIVO de su propio doc de usuario (get por id,
  // permitido por reglas). Así, cuando el admin le asigna trabajos, el portal se
  // actualiza al instante — sin depender de la sesión ni de volver a entrar.
  const { dato: miDoc } = useDoc('users', usuario?.id)
  const jobIds = (miDoc?.jobIds?.length ? miDoc.jobIds : usuario?.jobIds) || []
  const jobsNombres = (miDoc?.jobsNombres?.length ? miDoc.jobsNombres : usuario?.jobsNombres) || []
  const plantaId = (miDoc ? miDoc.plantaId : usuario?.plantaId) || null
  const sinAsignacion = jobIds.length === 0 && !plantaId
  // Órdenes de SUS trabajos: UNA suscripción de IGUALDAD por trabajo, fusionadas.
  // (Con el filtro `jobId in [...]` el motor de reglas no podía probar la consulta
  // y la denegaba completa en silencio: el portal se veía vacío.)
  const [ordenes, setOrdenes] = useState([])
  const jobsClave = jobIds.slice(0, 10).join('|')
  useEffect(() => {
    if (!tenantId) { setOrdenes([]); return }
    const porFuente = {}
    const emitir = () => {
      const m = new Map()
      for (const lista of Object.values(porFuente)) for (const o of lista) m.set(o.id, o)
      setOrdenes([...m.values()])
    }
    const offs = []
    if (jobsClave) {
      for (const j of jobsClave.split('|')) {
        offs.push(suscribir('orders', tenantId, (d) => { porFuente[j] = d; emitir() }, [where('jobId', '==', j)]))
      }
    } else {
      offs.push(suscribir('orders', tenantId, (d) => { porFuente.planta = d; emitir() }, [where('plantaId', '==', plantaId || '__none__')]))
    }
    return () => offs.forEach((f) => f())
  }, [tenantId, jobsClave, plantaId])
  const { datos: geocercas } = useColeccion('geofences')
  const [msg, setMsg] = useState(null)
  const [tab, setTab] = useState('token')

  // Órdenes 'entregada' = SOLO legado (el sistema nuevo entrega y libera en un
  // paso con el token; ninguna orden nueva se queda en este estado).
  const pendientes = useMemo(() => ordenes.filter((o) => o.estado === E.ENTREGADA), [ordenes])
  // ¿La orden ya está DENTRO de la zona de entrega según la GEOCERCA? El GPS del
  // chofer registra entrada/salida en o.geoEventos automáticamente (aunque él no
  // haya tocado «Llegué»): si el último evento de una geocerca de destino/proyecto
  // es 'entrada', el camión está en la zona.
  const enZonaEntrega = (o) => {
    const evs = (o.geoEventos || []).filter((e) => ['destino', 'proyecto'].includes(e.tipo))
    return evs.length > 0 && evs[evs.length - 1].evento === 'entrada'
  }
  // POR AUTORIZAR: el chofer marcó llegada (en_destino) O su camión YA cruzó la
  // geocerca de entrega (en_ruta + dentro de la zona). EN CAMINO: el resto en ruta.
  const porAutorizar = useMemo(() => ordenes.filter((o) => o.estado === E.EN_DESTINO || (o.estado === E.EN_RUTA && enZonaEntrega(o))), [ordenes])
  const enCamino = useMemo(() => ordenes.filter((o) => o.estado === E.EN_RUTA && !enZonaEntrega(o)), [ordenes])

  // Aviso al supervisor cuando ENTRA una carga nueva a la zona (sonido + notificación).
  // Aviso ÚNICO por orden (persistido): recargar la página no vuelve a sonar.
  const avisadasRef = useRef(null)
  if (avisadasRef.current === null) {
    try { avisadasRef.current = new Set(JSON.parse(localStorage.getItem('mp-sup-avisadas') || '[]')) }
    catch { avisadasRef.current = new Set() }
  }
  useEffect(() => {
    // Solo las órdenes que NUNCA se han avisado disparan sonido/notificación.
    const nuevas = porAutorizar.filter((o) => !avisadasRef.current.has(o.id))
    if (nuevas.length > 0) {
      try { beep() } catch { /* sin audio */ }
      const quien = nuevas.map((o) => `${o.numero}${o.choferNombre ? ` (${o.choferNombre})` : ''}`).join(', ')
      notificar(t('Camión en zona de entrega'), `${quien} — ${t('esperando tu código de autorización.')}`)
      for (const o of nuevas) avisadasRef.current.add(o.id)
      try { localStorage.setItem('mp-sup-avisadas', JSON.stringify([...avisadasRef.current].slice(-300))) } catch { /* lleno */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porAutorizar])
  const activas = useMemo(() => ordenes.filter((o) => !FINAL.includes(o.estado) || o.estado === E.ENTREGADA), [ordenes])
  const stats = useMemo(() => {
    const n = {}
    for (const [k, g] of Object.entries(GRUPOS_ESTADO)) n[k] = ordenes.filter((o) => g.estados.includes(o.estado)).length
    return n
  }, [ordenes])

  const nivelDe = (o) => (o.liberacion && o.liberacion.nivel) || null

  const liberarOrden = async (orden) => {
    const nivel = nivelDe(orden)
    const sensible = nivel === 'baja' || nivel === 'critico'
    let motivo = ''
    if (sensible) {
      const m = window.prompt(t('Confianza baja/crítica. Escribe el motivo para liberar de todos modos:'))
      if (m == null) return
      motivo = m.trim()
      if (!window.confirm(t('¿Confirmas liberar esta carga pese a la baja confianza?'))) return
    } else if (!window.confirm(`${t('¿Liberar la orden')} ${orden.numero}?`)) return

    const liberacion = { ...(orden.liberacion || {}), modo: 'supervisor', por: usuario?.nombre || usuario?.email, ts: ahora() }
    if (motivo) liberacion.motivo = motivo
    await guardar('orders', orden.id, {
      estado: E.LIBERADA,
      hitos: { ...(orden.hitos || {}), liberacion: ahora() },
      liberadaPor: usuario?.nombre || usuario?.email,
      liberacion,
    })
    // Libera la presencia del chofer para que vuelva a la cola de disponibles.
    if (orden.choferId) { try { await liberarPresencia(orden.choferId) } catch { /* noop */ } }
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberar_carga', entidad: 'orden', entidadId: orden.id, detalle: sensible ? `confianza ${nivel} · ${motivo}` : `confianza ${nivel || 'n/d'}` })
    setMsg({ tipo: 'ok', txt: `${t('Orden')} ${orden.numero} ${t('liberada. El chofer ya puede tomar otra carga.')}` })
  }

  // Historial de MIS liberaciones (autorizaciones con mi token, escritas por el backend).
  const { datos: misLiberaciones } = useColeccion('liberaciones', [where('supervisorId', '==', usuario?.id || '__none__')])

  // "Cargas antiguas" SOLO aparece si quedan órdenes del sistema anterior: así
  // no conviven dos formas de liberar y el token es el único camino visible.
  const items = [
    { k: 'token', label: t('Mi código'), icon: KeyRound },
    { k: 'espera', label: t('Por autorizar'), icon: Clock, badge: porAutorizar.length },
    { k: 'mapa', label: t('Mapa'), icon: MapIcon },
    ...(pendientes.length > 0 ? [{ k: 'liberar', label: t('Cargas antiguas'), icon: PackageCheck, badge: pendientes.length }] : []),
    { k: 'liberaciones', label: t('Liberaciones'), icon: History },
    { k: 'actividad', label: t('Actividad'), icon: ClipboardList },
  ]
  const activo = (tab.startsWith('g:') || items.some((i) => i.k === tab)) ? tab : 'token'

  return (
    <PortalLayout
      icon={ShieldCheck}
      titulo={usuario?.nombre}
      subtitulo={t('Supervisor de trabajos')}
      items={items}
      activo={activo}
      onSelect={setTab}
      aviso={<>
        {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}
        {sinAsignacion && <Aviso tipo="warn" className="mb-3">{t('Aún no tienes trabajos asignados. Pídele al administrador que te asigne tus trabajos en Usuarios para ver sus cargas.')}</Aviso>}
        {jobsNombres.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('Mis trabajos')}:</span>
            {jobsNombres.map((n, i) => <Badge key={i} color="navy">{n}</Badge>)}
          </div>
        )}
        {jobIds.length === 0 && plantaId && <Aviso tipo="info" className="mb-3">{t('Estás viendo las cargas de tu planta (modelo anterior). El administrador puede asignarte trabajos para el nuevo alcance por trabajo.')}</Aviso>}
      </>}
    >
      {/* KPIs clicables: cada tarjeta abre la LISTA de órdenes en ese estado. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KPI label={t('En cola (por aceptar)')} value={stats.cola} icon={ClipboardList} accent="navy" onClick={() => setTab('g:cola')} />
        <KPI label={t('Hacia la planta')} value={stats.hacia} icon={Truck} accent="gold" onClick={() => setTab('g:hacia')} />
        <KPI label={t('En planta / cargando')} value={stats.planta} icon={Package} accent="gold" onClick={() => setTab('g:planta')} />
        <KPI label={t('En ruta')} value={stats.ruta} icon={Truck} accent="blue" onClick={() => setTab('g:ruta')} />
        <KPI label={t('Por autorizar')} value={porAutorizar.length} icon={KeyRound} accent="green" onClick={() => setTab('espera')} />
      </div>

      {/* Página de un ESTADO: las órdenes de la tarjeta KPI seleccionada. */}
      {activo.startsWith('g:') && (() => {
        const g = GRUPOS_ESTADO[activo.slice(2)]
        if (!g) return null
        const lista = ordenes.filter((o) => g.estados.includes(o.estado)).sort((a, b) => (b.numero || '').localeCompare(a.numero || ''))
        const GIcon = g.icon
        return (
          <>
            <div className="mb-3 flex items-center gap-2">
              <button onClick={() => setTab('token')} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><ArrowLeft size={16} /> {t('Volver')}</button>
              <GIcon size={16} className="text-amber-500" />
              <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t(g.label)}</h3>
              <Badge color="navy">{lista.length}</Badge>
            </div>
            {lista.length === 0 ? (
              <Card className="flex flex-col items-center gap-2 p-8 text-center text-slate-400"><GIcon size={30} strokeWidth={1.4} /><p className="max-w-xs text-sm">{t('No hay órdenes en este estado ahora mismo.')}</p></Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {lista.map((o) => (
                  <Card key={o.id} className="p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                      <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                      <Badge color="gold">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                      {o.urgente && <Badge color="red">{t('Urgente')}</Badge>}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {t('chofer:')} {o.choferNombre || t('sin asignar')}{o.tipoEquipo ? ` · ${o.tipoEquipo}` : ''}</div>
                    {o.direccionEntrega && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} /> {o.direccionEntrega}</div>}
                    <ProgresoViaje o={o} t={t} />
                    {o.ultimaPos?.lat != null && <button onClick={() => setTab('mapa')} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"><MapIcon size={11} /> {t('Ver en el mapa')}</button>}
                  </Card>
                ))}
              </div>
            )}
          </>
        )
      })()}

      {activo === 'token' && <TokenSupervisor t={t} />}

      {activo === 'espera' && (<>
        <Aviso tipo="info" className="mb-3">{t('Estas cargas están EN EL DESTINO: el chofer necesita tu código de 6 dígitos (pestaña «Mi código») para poder entregar. Al validar el código, la orden queda entregada y liberada de una vez.')}</Aviso>
        <div className="mb-2 flex items-center gap-2"><Clock size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('En destino, esperando tu autorización')}</h3><Badge color="gold">{porAutorizar.length}</Badge></div>
        {porAutorizar.length === 0 ? (
          <Card className="mb-4 flex flex-col items-center gap-2 p-8 text-center text-slate-400"><CheckCircle2 size={30} strokeWidth={1.4} className="text-emerald-400" /><p className="max-w-xs text-sm">{t('Nadie está esperando tu código ahora mismo. Cuando un chofer llegue al destino, aparecerá aquí.')}</p></Card>
        ) : (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {porAutorizar.map((o) => (
              <Card key={o.id} className="border-l-4 border-l-amber-500 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                  <Badge color="gold">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                  {o.estado === E.EN_DESTINO
                    ? <Badge color="blue">{t('En destino')}</Badge>
                    : <Badge color="gold"><MapPin size={10} className="mr-0.5 inline" />{t('Cruzó la geocerca de entrega')}</Badge>}
                  <button onClick={() => setTab('token')} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-amber-400"><KeyRound size={13} /> {t('Ver mi código')}</button>
                </div>
                <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {t('chofer:')} {o.choferNombre || '—'}</div>
                {o.direccionEntrega && <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={11} /> {o.direccionEntrega}</div>}
                <ProgresoViaje o={o} t={t} />
                {o.ultimaPos?.lat != null && <button onClick={() => setTab('mapa')} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"><MapIcon size={11} /> {t('Ver en el mapa')}</button>}
              </Card>
            ))}
          </div>
        )}
        {enCamino.length > 0 && (<>
          <div className="mb-2 flex items-center gap-2"><Truck size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('En camino (pronto pedirán tu código)')}</h3><Badge color="blue">{enCamino.length}</Badge></div>
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {enCamino.map((o) => (
              <Card key={o.id} className="p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                  <Badge color="blue">{t('En ruta')}</Badge>
                  <span className="ml-auto text-xs text-slate-400">{o.choferNombre || '—'}</span>
                </div>
                <ProgresoViaje o={o} t={t} />
              </Card>
            ))}
          </div>
        </>)}
      </>)}

      {activo === 'mapa' && (() => {
        // Camiones ACTIVOS de sus trabajos con posición conocida, coloreados por
        // etapa, sobre las geocercas (planta y zona de entrega).
        const colorPunto = { aceptada: '#64748b', en_planta: '#13233f', cargando: '#13233f', en_ruta: '#2563eb', en_destino: '#f59e0b' }
        const activos = ordenes.filter((o) => !FINAL.includes(o.estado) && o.ultimaPos?.lat != null)
        const marcadores = activos.map((o) => ({ id: `o_${o.id}`, lat: o.ultimaPos.lat, lng: o.ultimaPos.lng, icon: 'truck', color: colorPunto[o.estado] || '#64748b', label: `${o.numero} · ${o.choferNombre || t('sin chofer')} · ${t(PASO_LABEL[o.estado] || o.estado)}` }))
        return (
          <Card className="p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
              <MapIcon size={14} className="text-amber-500" />
              <span className="font-bold text-brand-navy dark:text-slate-100">{t('Mis camiones en vivo')}</span>
              <Badge color="navy">{activos.length}</Badge>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2563eb' }} /> {t('En ruta')}</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f59e0b' }} /> {t('En destino')}</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#13233f' }} /> {t('En planta / cargando')}</span>
              </span>
            </div>
            {activos.length === 0
              ? <div className="flex flex-col items-center gap-2 py-10 text-center text-slate-400"><MapIcon size={30} strokeWidth={1.4} /><p className="max-w-xs text-sm">{t('Ningún camión activo con GPS ahora mismo. Cuando un chofer esté en viaje, lo verás aquí con las geocercas.')}</p></div>
              : <MapaLeaflet geocercas={geocercas} marcadores={marcadores} alto="58vh" />}
            <p className="mt-2 px-1 text-[11px] text-slate-400">{t('La posición se actualiza con el GPS del chofer (cada ~20 s en viaje). Los círculos son las geocercas de planta y de entrega.')}</p>
          </Card>
        )
      })()}

      {activo === 'liberaciones' && (<>
        <div className="mb-2 flex items-center gap-2"><History size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Órdenes que he liberado')}</h3><Badge color="navy">{misLiberaciones.length}</Badge></div>
        {misLiberaciones.length === 0 ? (
          <EstadoVacio titulo={t('Aún no has liberado entregas')} texto={t('Cuando un chofer entregue con tu código, cada autorización quedará registrada aquí.')} mostrarBoton={false} />
        ) : (
          <div className="space-y-2">
            {misLiberaciones.slice().sort((a, b) => (b.autorizadaEn || '').localeCompare(a.autorizadaEn || '')).map((l) => (
              <Card key={l.id} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-500"><CheckCircle2 size={16} /></span>
                  <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{l.orderNumero || l.orderId}</span>
                  <Badge color="green">{t('Liberada')}</Badge>
                  <span className="ml-auto text-xs text-slate-400">{String(l.autorizadaEn || '').slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('Entregó')}: <b>{l.empleadoNombre || '—'}</b> ({t(l.empleadoRol || '')})
                  {l.intentosFallidosPrevios > 0 && <span className="ml-2 text-amber-600 dark:text-amber-400">· {l.intentosFallidosPrevios} {t('intento(s) fallido(s) previos')}</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </>)}

      {activo === 'liberar' && (<>
        {/* SOLO órdenes ANTIGUAS: entregadas antes del sistema de token. Las
            entregas nuevas se autorizan con «Mi código» y no pasan por aquí.
            Estas se liberan directo con el botón (sin códigos de 4 dígitos). */}
        <Aviso tipo="info" className="mb-3">{t('Estas cargas quedaron entregadas con el sistema anterior. Libéralas con el botón. Las entregas nuevas se autorizan con tu código de la pestaña «Mi código» y no aparecen aquí.')}</Aviso>
        <div className="mb-2 flex items-center gap-2"><PackageCheck size={16} className="text-emerald-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Cargas antiguas por liberar')}</h3><Badge color="gold">{pendientes.length}</Badge></div>
        {pendientes.length === 0 ? (
          <Card className="mb-4 flex flex-col items-center gap-2 p-8 text-center text-slate-400"><CheckCircle2 size={30} strokeWidth={1.4} className="text-emerald-400" /><p className="max-w-xs text-sm">{t('No queda ninguna carga del sistema anterior. Todo lo nuevo se autoriza con tu código.')}</p></Card>
        ) : (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {pendientes.map((o) => (
              <Card key={o.id} className="p-3.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                  <Badge color="gold">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                  {nivelDe(o) && <Badge color={COLOR_NIVEL[nivelDe(o)] || 'slate'}>{t(NIVEL_LABEL[nivelDe(o)] || nivelDe(o))}</Badge>}
                  <button onClick={() => liberarOrden(o)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600"><CheckCircle2 size={14} /> {t('Liberar')}</button>
                </div>
                <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {t('chofer:')} {o.choferNombre || '—'}</div>
              </Card>
            ))}
          </div>
        )}
      </>)}

      {activo === 'actividad' && (<>
        <div className="mb-2 flex items-center gap-2"><ClipboardList size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Actividad de mis trabajos')}</h3><Badge color="navy">{activas.length} {t('en curso')}</Badge></div>
        {activas.length === 0 ? (
          <Card className="mb-4 flex flex-col items-center gap-2 p-8 text-center text-slate-400"><ClipboardList size={30} strokeWidth={1.4} /><p className="max-w-xs text-sm">{t('Ahora mismo no hay viajes EN CURSO en tus trabajos. Abajo quedan los terminados recientes; cuando arranque un viaje nuevo, aparecerá aquí con su avance.')}</p></Card>
        ) : (
          <Tabla
            columns={[
              { key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') },
              { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'tipoEquipo', label: t('Camión') },
              { key: 'chofer', label: t('Chofer') }, { key: 'estado', label: t('Estado') },
            ]}
            rows={activas.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((o) => ({ ...o, _key: o.id }))}
            renderCell={(o, k) => {
              if (k === 'numero') return <span className="font-mono font-semibold text-brand-navy dark:text-slate-100">{o.numero}</span>
              if (k === 'material') return t(o.material || '—')
              if (k === 'ton') return o.pesoReal ?? o.pesoEstimado ?? '—'
              if (k === 'tipoEquipo') return o.tipoEquipo || '—'
              if (k === 'chofer') return o.choferNombre || <span className="text-slate-400">{t('Sin asignar')}</span>
              if (k === 'estado') return <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
              return null
            }}
            minWidth="min-w-[640px]"
          />
        )}
        {(() => {
          // Terminadas recientes (liberadas/cerradas/canceladas), las últimas 15.
          const term = ordenes
            .filter((o) => [E.LIBERADA, E.CERRADA, E.CANCELADA].includes(o.estado))
            .sort((a, b) => String(b.hitos?.liberacion || b.hitos?.entrega || '').localeCompare(String(a.hitos?.liberacion || a.hitos?.entrega || '')))
            .slice(0, 15)
          if (!term.length) return null
          return (<>
            <div className="mb-2 mt-5 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Terminadas recientes')}</h3><Badge color="green">{term.length}</Badge></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {term.map((o) => (
                <Card key={o.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                    <Badge color={o.estado === E.CANCELADA ? 'red' : 'green'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                    <span className="ml-auto text-xs text-slate-400">{String(o.hitos?.liberacion || o.hitos?.entrega || '').slice(0, 16).replace('T', ' ')}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {o.pesoReal ?? o.pesoEstimado} ton · {o.choferNombre || '—'}</div>
                </Card>
              ))}
            </div>
          </>)
        })()}
      </>)}
    </PortalLayout>
  )
}

// ── "Token bancario" del supervisor ─────────────────────────────────────────
// Muestra el código TOTP vigente (el SECRETO nunca sale del servidor), cuánto
// falta para que cambie, y permite generar uno nuevo a mano (rotar = revoca el
// anterior al instante). El backend lo recalcula al vencer cada periodo.
function TokenSupervisor({ t }) {
  const [info, setInfo] = useState(null) // { codigo, segundos, periodo }
  const [seg, setSeg] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [err, setErr] = useState('')
  const [copiado, setCopiado] = useState(false)
  const pidiendo = useRef(false)

  const pedir = async (op = 'codigo') => {
    if (pidiendo.current) return
    pidiendo.current = true
    setCargando(true); setErr('')
    try {
      const fn = httpsCallable(funcsBulk, 'bulkTotpOp', { timeout: 15000 })
      const r = await fn({ op, ...(op === 'rotar' ? { motivo: 'rotación manual desde el portal' } : {}) })
      setInfo(r?.data || null); setSeg(r?.data?.segundos || 0)
    } catch (e) { setErr(e?.message || t('No se pudo obtener el código.')) }
    finally { setCargando(false); pidiendo.current = false }
  }
  useEffect(() => { pedir('codigo') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuenta regresiva local; al llegar a 0 se pide el código nuevo al backend.
  useEffect(() => {
    if (!info) return
    const id = setInterval(() => {
      setSeg((s) => {
        if (s <= 1) { pedir('codigo'); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info])

  const copiar = async () => {
    try { await navigator.clipboard.writeText(info?.codigo || ''); setCopiado(true); setTimeout(() => setCopiado(false), 1200) } catch { /* noop */ }
  }
  const pct = info ? Math.max(0, Math.min(100, (seg / info.periodo) * 100)) : 0

  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><KeyRound size={26} /></div>
      <h3 className="mt-3 text-base font-black text-brand-navy dark:text-slate-100">{t('Mi código de autorización')}</h3>
      <p className="mt-1 text-xs text-slate-400">{t('El chofer lo escribe para poder entregar. Solo sirve para las órdenes de TUS trabajos, cambia solo y cada uso queda registrado.')}</p>
      {err && <Aviso tipo="error" className="mt-3">{err}</Aviso>}
      {info ? (
        <>
          <button type="button" onClick={copiar} title={t('Copiar')} className="mt-4 inline-flex items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-500/5 px-6 py-4">
            <span className="font-mono text-4xl font-black tracking-[0.35em] text-brand-navy dark:text-slate-100">{cargando ? '· · ·' : info.codigo}</span>
            <Copy size={16} className="text-slate-400" />
          </button>
          {copiado && <div className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{t('Copiado')}</div>}
          <div className="mx-auto mt-4 max-w-xs">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full transition-all duration-1000 ${seg <= 10 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`mt-1 text-xs font-bold ${seg <= 10 ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`}>
              {t('Código válido durante')}: {seg} s <span className="font-normal text-slate-400">({t('rota cada')} {info.periodo} s)</span>
            </div>
          </div>
        </>
      ) : (
        <div className="py-6 text-sm text-slate-400">{cargando ? t('Generando tu código…') : ''}</div>
      )}
      <button type="button" onClick={() => window.confirm(t('¿Generar un código nuevo? El actual dejará de valer de inmediato (útil si crees que alguien lo vio).')) && pedir('rotar')} disabled={cargando}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
        <RefreshCw size={15} /> {t('Generar nuevo código (revoca el actual)')}
      </button>
    </Card>
  )
}


// ── Progreso del viaje (mini barra por tarjeta) ─────────────────────────────
// Etapas del viaje hacia la entrega y el % que representa cada estado.
const PASOS_VIAJE = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const PASO_LABEL = { aceptada: 'Aceptada', en_planta: 'En planta', cargando: 'Cargando', en_ruta: 'En ruta', en_destino: 'En destino' }
const haceTxt = (ts) => {
  const ms = Date.parse(ts || '')
  if (!Number.isFinite(ms)) return null
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000))
  return min < 1 ? 'ahora' : min < 60 ? `hace ${min} min` : `hace ${Math.round(min / 60)} h`
}
function ProgresoViaje({ o, t }) {
  const idx = PASOS_VIAJE.indexOf(o.estado)
  const pct = idx < 0 ? 0 : Math.round(((idx + 1) / PASOS_VIAJE.length) * 100)
  const gps = o.ultimaPos?.ts ? haceTxt(o.ultimaPos.ts) : null
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <span>{t(PASO_LABEL[o.estado] || o.estado)}</span>
        <span>{pct}%{gps ? ` · GPS ${t(gps)}` : ''}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full transition-all ${o.estado === E.EN_DESTINO ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.max(6, pct)}%` }} />
      </div>
    </div>
  )
}
