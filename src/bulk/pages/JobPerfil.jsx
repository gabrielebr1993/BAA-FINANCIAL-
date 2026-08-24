// ============================================================================
// BULK · PERFIL DE UN TRABAJO (job): toda su información consolidada.
//   · Datos generales (cliente, planta, materiales, equipo, destino, PO).
//   · PROGRESO: fórmula documentada abajo, con barra visual.
//   · Órdenes asociadas con su estado · Personal asignado (transportistas,
//     choferes, supervisores) · Actividad reciente.
// Accesible desde el listado de Trabajos (ruta /bulk/jobs/:id).
//
// FÓRMULA DE PROGRESO (por toneladas, acorde al modelo de datos actual):
//   El job no guarda un "total contratado": el tonelaje real del trabajo son
//   las órdenes GENERADAS. Por eso:
//     base    = Σ toneladas (pesoReal ?? pesoEstimado) de órdenes del job
//               con estado ≠ cancelada/rechazada
//     avance  = Σ toneladas de órdenes entregada/liberada/cerrada
//     % = avance / base   (complemento informativo: viajes entregados/total)
// ============================================================================
import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Layers, Building2, MapPin, Truck, Package, Boxes, User, ShieldCheck, Clock, ClipboardList, CheckCircle2, DollarSign, FileText, Briefcase } from 'lucide-react'
import { useColeccion, useDoc } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { useBulkAuth } from '../BulkAuthContext'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR, BULK_ROLES } from '../domain/constants'
import { Card, Badge, Cargando, EstadoVacio, Tabla } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const CANCELADAS = [E.CANCELADA, E.RECHAZADA]
const EN_PROCESO = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
const n = (v) => Number(v) || 0
const r1 = (v) => Math.round(v * 10) / 10
const fechaCorta = (s) => { const ms = Date.parse(s || ''); return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—' }

function Mini({ icon: Icon, label, val, color = '' }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400"><Icon size={12} /> {label}</div>
      <div className={`mt-0.5 text-lg font-black ${color || 'text-brand-navy dark:text-slate-100'}`}>{val}</div>
    </Card>
  )
}

export default function JobPerfil() {
  const { t } = useLang()
  const { id } = useParams()
  const { puede } = useBulkAuth()
  const { dato: job, cargando } = useDoc('jobs', id)
  const { datos: ordenesTodas } = useOrdenesConPagos()
  const { datos: clientes } = useColeccion('clients')
  const { datos: plantas } = useColeccion('plants')
  const { datos: carriers } = useColeccion('carriers')
  // Supervisores asignados a este job (solo el admin puede listar usuarios; si
  // las reglas lo niegan —p. ej. dispatcher—, la sección simplemente se oculta).
  const { datos: usuarios } = useColeccion('users')

  const ordenes = useMemo(() => (ordenesTodas || []).filter((o) => o.jobId === id), [ordenesTodas, id])

  const resumen = useMemo(() => {
    const validas = ordenes.filter((o) => !CANCELADAS.includes(o.estado))
    const entregadas = validas.filter((o) => ENTREGADAS.includes(o.estado))
    const tonBase = validas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)
    const tonAvance = entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)
    const pct = tonBase > 0 ? Math.min(100, Math.round((tonAvance / tonBase) * 100)) : 0
    return {
      pct, tonBase: r1(tonBase), tonAvance: r1(tonAvance),
      total: validas.length, entregadas: entregadas.length,
      enProceso: validas.filter((o) => EN_PROCESO.includes(o.estado)).length,
      enCola: validas.filter((o) => [E.CREADA, E.EN_COLA, E.NOTIFICANDO].includes(o.estado)).length,
      canceladas: ordenes.length - validas.length,
      facturado: entregadas.reduce((a, o) => a + n(o.precioCliente), 0),
    }
  }, [ordenes])

  const personal = useMemo(() => {
    const autorizados = (job?.transportistasAutorizados || []).map((cid) => carriers.find((c) => c.id === cid)).filter(Boolean)
    // Choferes: los AFILIADOS al job en el roster + los que ya movieron órdenes.
    const set = new Map()
    for (const c of carriers) for (const d of c.choferes || []) if ((d.jobs || []).includes(id)) set.set((d.nombre || '').toLowerCase(), { nombre: d.nombre, carrier: c.nombre, afiliado: true })
    for (const o of ordenes) if (o.choferNombre && !set.has(o.choferNombre.toLowerCase())) set.set(o.choferNombre.toLowerCase(), { nombre: o.choferNombre, carrier: carriers.find((c) => c.id === o.transportistaId)?.nombre || '', afiliado: false })
    const supervisores = (usuarios || []).filter((u) => u.rol === BULK_ROLES.SUPERVISOR_PLANTA && (u.jobIds || []).includes(id))
    return { autorizados, choferes: [...set.values()], supervisores }
  }, [job, carriers, ordenes, usuarios, id])

  // Actividad reciente: hitos reales de las órdenes (creación / entrega), más nuevas primero.
  const actividad = useMemo(() => {
    const ev = []
    for (const o of ordenes) {
      if (o.hitos?.entrega) ev.push({ ts: o.hitos.entrega, txt: `${o.numero} ${t('entregada')} · ${o.pesoReal ?? o.pesoEstimado} ton${o.choferNombre ? ` · ${o.choferNombre}` : ''}`, tipo: 'ok' })
      if (o.hitos?.carga) ev.push({ ts: o.hitos.carga, txt: `${o.numero} ${t('cargada en planta')}`, tipo: 'info' })
      if (CANCELADAS.includes(o.estado)) ev.push({ ts: o.actualizadoEn?.toDate?.()?.toISOString?.() || o.hitos?.entrega || '', txt: `${o.numero} ${t('cancelada')}`, tipo: 'warn' })
    }
    return ev.filter((e) => e.ts).sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 12)
  }, [ordenes, t])

  if (cargando) return <Cargando />
  if (!job) return (
    <div>
      <Link to="/bulk/jobs" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Trabajos')}</Link>
      <EstadoVacio titulo={t('Trabajo no encontrado')} texto={t('Puede que se haya borrado.')} mostrarBoton={false} />
    </div>
  )

  const cliente = clientes.find((c) => c.id === job.clienteId)
  const planta = plantas.find((p) => p.id === job.plantaId)
  const verDinero = puede('fin.precioCliente')

  return (
    <div className="w-full">
      <Link to="/bulk/jobs" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"><ArrowLeft size={15} /> {t('Trabajos')}</Link>

      {/* Cabecera del trabajo */}
      <Card className="mb-4 overflow-hidden p-0">
        <div className="h-20 bg-gradient-to-r from-brand-navy via-[#1e3a5f] to-amber-600" />
        <div className="px-5 pb-5">
          <div className="relative -mt-9 inline-grid h-16 w-16 place-items-center rounded-2xl border-4 border-white bg-brand-navy text-white shadow-lg dark:border-slate-900"><Layers size={28} /></div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-xl font-black text-brand-navy dark:text-slate-100">{job.nombre}</h1>
            <Badge color="slate">{job.codigo}</Badge>
            <Badge color={job.activo === false ? 'slate' : 'green'}>{job.activo === false ? t('Inactivo') : t('Activo')}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
            {cliente && <Link to={`/bulk/cliente/${cliente.id}`} className="inline-flex items-center gap-1 hover:underline"><Building2 size={14} className="text-amber-500" /> {cliente.nombre}</Link>}
            {planta && <span className="inline-flex items-center gap-1"><MapPin size={14} className="text-amber-500" /> {planta.nombre}</span>}
            {job.tipoEquipo && <span className="inline-flex items-center gap-1"><Truck size={14} className="text-amber-500" /> {job.tipoEquipo}</span>}
            {job.destino && <span className="inline-flex items-center gap-1"><MapPin size={14} className="text-slate-400" /> → {job.destino}</span>}
            {job.po && <span className="inline-flex items-center gap-1"><FileText size={14} className="text-slate-400" /> PO {job.po}</span>}
          </div>
          {(job.materiales || []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">{job.materiales.map((m) => <Badge key={m} color="green"><Boxes size={10} className="mr-0.5 inline" />{t(m)}</Badge>)}</div>
          )}

          {/* Progreso (ver fórmula en la cabecera del archivo) */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wide text-slate-400">{t('Progreso')}</span>
              <span className="font-black text-brand-navy dark:text-slate-100">{resumen.pct}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full transition-all ${resumen.pct >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-amber-600'}`} style={{ width: `${Math.max(2, resumen.pct)}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {resumen.tonAvance} / {resumen.tonBase} {t('ton entregadas')} · {resumen.entregadas}/{resumen.total} {t('viajes')} · {t('calculado por toneladas entregadas sobre las generadas (sin canceladas)')}
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className={`mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 ${verDinero ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
        <Mini icon={ClipboardList} label={t('Órdenes')} val={resumen.total} />
        <Mini icon={CheckCircle2} label={t('Entregadas')} val={resumen.entregadas} color="text-emerald-600 dark:text-emerald-400" />
        <Mini icon={Clock} label={t('En proceso')} val={resumen.enProceso} />
        <Mini icon={Package} label={t('En cola')} val={resumen.enCola} />
        <Mini icon={Layers} label={t('Toneladas')} val={`${resumen.tonAvance}/${resumen.tonBase}`} />
        {verDinero && <Mini icon={DollarSign} label={t('Facturado (entregado)')} val={money(resumen.facturado)} color="text-emerald-600 dark:text-emerald-400" />}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Órdenes del trabajo */}
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><ClipboardList size={15} className="text-amber-500" /> {t('Órdenes del trabajo')} <span className="text-xs font-normal text-slate-400">({ordenes.length})</span></h3>
            {ordenes.length === 0 ? <p className="text-sm text-slate-400">{t('Aún no se generan órdenes para este trabajo.')}</p> : (
              <Tabla
                columns={[{ key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') }, { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'chofer', label: t('Chofer') }, { key: 'estado', label: t('Estado') }, { key: 'fecha', label: t('Fecha') }]}
                rows={ordenes.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).map((o) => ({ ...o, _key: o.id }))}
                renderCell={(o, k) => {
                  if (k === 'numero') return <Link to={`/bulk/ordenes/${o.id}`} className="font-mono font-semibold text-brand-navy hover:underline dark:text-slate-100">{o.numero}</Link>
                  if (k === 'material') return t(o.material || '—')
                  if (k === 'ton') return o.pesoReal ?? o.pesoEstimado ?? '—'
                  if (k === 'chofer') return o.choferNombre || <span className="text-slate-400">—</span>
                  if (k === 'estado') return <Badge color={ORDEN_ESTADO_COLOR[o.estado] || 'slate'}>{t(ORDEN_ESTADO_LABEL[o.estado] || o.estado)}</Badge>
                  if (k === 'fecha') return <span className="text-xs text-slate-500">{fechaCorta(o.hitos?.entrega || o.hitos?.carga)}</span>
                  return null
                }}
                minWidth="min-w-[640px]"
              />
            )}
          </Card>

          {/* Actividad reciente */}
          <Card className="p-4">
            <h3 className="m-0 mb-3 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Clock size={15} className="text-amber-500" /> {t('Actividad reciente')}</h3>
            {actividad.length === 0 ? <p className="text-sm text-slate-400">{t('Sin actividad todavía.')}</p> : (
              <div className="space-y-1.5">
                {actividad.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full ${e.tipo === 'ok' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : e.tipo === 'warn' ? 'bg-rose-500/10 text-rose-500' : 'bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-200'}`}><CheckCircle2 size={11} /></span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">{e.txt}</span>
                    <span className="ml-auto flex-shrink-0 text-slate-400">{String(e.ts).slice(0, 16).replace('T', ' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Personal asignado */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="m-0 mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Truck size={15} className="text-amber-500" /> {t('Transportistas autorizados')} <span className="text-xs font-normal text-slate-400">({personal.autorizados.length})</span></h3>
            {personal.autorizados.length === 0 ? <p className="text-sm text-slate-400">{t('Ninguno. Autorízalos desde la tarjeta del trabajo en Trabajos.')}</p> : (
              <div className="space-y-1.5">
                {personal.autorizados.map((c) => (
                  <Link key={c.id} to={`/bulk/transportistas/${c.id}`} className="flex items-center gap-2 rounded-xl border border-slate-100 p-2 transition hover:border-amber-300 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-800">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-navy/10 text-brand-navy dark:bg-white/10 dark:text-slate-200"><Truck size={14} /></span>
                    <span className="text-sm font-semibold text-brand-navy dark:text-slate-100">{c.nombre}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="m-0 mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><ShieldCheck size={15} className="text-amber-500" /> {t('Supervisores')} <span className="text-xs font-normal text-slate-400">({personal.supervisores.length})</span></h3>
            {personal.supervisores.length === 0 ? <p className="text-sm text-slate-400">{t('Sin supervisor asignado a este trabajo (se asigna en Usuarios).')}</p> : (
              <div className="space-y-1.5">
                {personal.supervisores.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 rounded-xl border border-slate-100 p-2 dark:border-slate-700/60">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400"><ShieldCheck size={14} /></span>
                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{u.nombre}</div><div className="truncate text-[11px] text-slate-400">{u.email}</div></div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="m-0 mb-2 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><User size={15} className="text-amber-500" /> {t('Choferes')} <span className="text-xs font-normal text-slate-400">({personal.choferes.length})</span></h3>
            {personal.choferes.length === 0 ? <p className="text-sm text-slate-400">{t('Nadie ha movido cargas de este trabajo todavía.')}</p> : (
              <div className="space-y-1.5">
                {personal.choferes.map((d, i) => (
                  <Link key={i} to={`/bulk/chofer/${encodeURIComponent(d.nombre)}`} className="flex items-center gap-2 rounded-xl border border-slate-100 p-2 transition hover:border-amber-300 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-800">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><User size={14} /></span>
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{d.nombre}</div>{d.carrier && <div className="truncate text-[11px] text-slate-400">{d.carrier}</div>}</div>
                    {d.afiliado && <Badge color="gold"><Briefcase size={9} className="mr-0.5 inline" />{t('afiliado')}</Badge>}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
