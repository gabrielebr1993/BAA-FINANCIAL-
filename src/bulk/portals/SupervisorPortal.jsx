// ============================================================================
// BULK · Portal del SUPERVISOR — mismo lenguaje visual del admin (KPIs, tabla,
// badges), enfocado en SUS TRABAJOS (jobs). AISLAMIENTO: solo ve las órdenes
// cuyo jobId está en sus trabajos asignados (bulk_users.jobIds, reforzado por
// las reglas con bMyJobs). COMPAT: un supervisor aún no migrado (solo con
// plantaId del modelo viejo) sigue viendo su planta hasta que le asignen jobs.
// Acción principal: confirmar/LIBERAR cargas entregadas (por código o lista).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { ShieldCheck, CheckCircle2, ClipboardList, Package, Truck, PackageCheck, KeyRound, RefreshCw, History, Copy } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useBulkAuth } from '../BulkAuthContext'
import PortalLayout from '../components/PortalLayout'
import { useColeccion } from '../data/useColeccion'
import { guardar, where } from '../data/repo'
import { liberar as liberarPresencia } from '../data/presencia'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { NIVEL_LABEL } from '../domain/liberacion'
import { Card, KPI, Badge, Aviso, EstadoVacio, Tabla } from '../../components/ui'
import { useLang } from '../../i18n'

const HACIA_PLANTA = [E.CREADA, E.EN_COLA, E.NOTIFICANDO, E.ACEPTADA]
const EN_PLANTA = [E.EN_PLANTA, E.CARGANDO]
const EN_RUTA = [E.EN_RUTA, E.EN_DESTINO]
const FINAL = [E.ENTREGADA, E.LIBERADA, E.CERRADA, E.CANCELADA]
const COLOR_NIVEL = { alta: 'green', media: 'gold', baja: 'slate', critico: 'red' }

export default function SupervisorPortal() {
  const { t } = useLang()
  const { usuario, tenantId, rol } = useBulkAuth()
  // Alcance NUEVO: por trabajos (jobIds). Respaldo legado: por planta.
  const jobIds = usuario?.jobIds || []
  const jobsNombres = usuario?.jobsNombres || []
  const plantaId = usuario?.plantaId || null
  const sinAsignacion = jobIds.length === 0 && !plantaId
  const { datos: ordenes } = useColeccion('orders', [
    jobIds.length
      ? where('jobId', 'in', jobIds.slice(0, 10)) // Firestore admite hasta 10 valores en 'in'
      : where('plantaId', '==', plantaId || '__none__'),
  ])
  const [msg, setMsg] = useState(null)
  const [tab, setTab] = useState('token')

  // Órdenes 'entregada' = SOLO legado (el sistema nuevo entrega y libera en un
  // paso con el token; ninguna orden nueva se queda en este estado).
  const pendientes = useMemo(() => ordenes.filter((o) => o.estado === E.ENTREGADA), [ordenes])
  const activas = useMemo(() => ordenes.filter((o) => !FINAL.includes(o.estado) || o.estado === E.ENTREGADA), [ordenes])
  const stats = useMemo(() => ({
    haciaPlanta: ordenes.filter((o) => HACIA_PLANTA.includes(o.estado)).length,
    enPlanta: ordenes.filter((o) => EN_PLANTA.includes(o.estado)).length,
    enRuta: ordenes.filter((o) => EN_RUTA.includes(o.estado)).length,
    esperando: pendientes.length,
  }), [ordenes, pendientes])

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
    ...(pendientes.length > 0 ? [{ k: 'liberar', label: t('Cargas antiguas'), icon: PackageCheck, badge: pendientes.length }] : []),
    { k: 'liberaciones', label: t('Liberaciones'), icon: History },
    { k: 'actividad', label: t('Actividad'), icon: ClipboardList },
  ]
  const activo = items.some((i) => i.k === tab) ? tab : 'token'

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
      {/* KPIs (mismas tarjetas del admin), persistentes arriba del contenido */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label={t('En cola hacia planta')} value={stats.haciaPlanta} icon={ClipboardList} accent="navy" />
        <KPI label={t('En planta / cargando')} value={stats.enPlanta} icon={Package} accent="gold" />
        <KPI label={t('En ruta / salidas')} value={stats.enRuta} icon={Truck} accent="blue" />
        <KPI label={t('Esperando liberación')} value={stats.esperando} icon={PackageCheck} accent="green" />
      </div>

      {activo === 'token' && <TokenSupervisor t={t} />}

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
        <div className="mb-2 flex items-center gap-2"><ClipboardList size={16} className="text-amber-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Actividad de la planta')}</h3></div>
        {activas.length === 0 ? (
          <EstadoVacio titulo={t('Sin actividad en tu planta')} texto={t('Cuando haya cargas asignadas a tu planta, verás aquí su avance.')} mostrarBoton={false} />
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
