// ============================================================================
// BULK · Portal del SUPERVISOR DE PLANTA — mismo lenguaje visual del admin
// (KPIs, tabla, badges de estado), enfocado en SU planta. AISLAMIENTO: solo ve las
// órdenes cuyo plantaId == su planta asignada (bMyPlanta, vía bulk_users.plantaId).
// Acción principal: confirmar/LIBERAR cargas entregadas (por código o desde la lista).
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, LogOut, Grid2x2, QrCode, CheckCircle2, ClipboardList, Package, Truck, PackageCheck } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { guardar, where } from '../data/repo'
import { liberar as liberarPresencia } from '../data/presencia'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL, ORDEN_ESTADO_COLOR } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { NIVEL_LABEL } from '../domain/liberacion'
import { Card, KPI, Boton, Input, Badge, Aviso, EstadoVacio, Tabla } from '../../components/ui'
import { useLang } from '../../i18n'

const HACIA_PLANTA = [E.CREADA, E.EN_COLA, E.NOTIFICANDO, E.ACEPTADA]
const EN_PLANTA = [E.EN_PLANTA, E.CARGANDO]
const EN_RUTA = [E.EN_RUTA, E.EN_DESTINO]
const FINAL = [E.ENTREGADA, E.LIBERADA, E.CERRADA, E.CANCELADA]
const COLOR_NIVEL = { alta: 'green', media: 'gold', baja: 'slate', critico: 'red' }

export default function SupervisorPortal() {
  const { t } = useLang()
  const { usuario, cerrarSesion, tenantId, rol } = useBulkAuth()
  const navigate = useNavigate()
  const plantaId = usuario?.plantaId || null
  const { datos: ordenes } = useColeccion('orders', [where('plantaId', '==', plantaId || '__none__')])
  const [codigo, setCodigo] = useState('')
  const [msg, setMsg] = useState(null)

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

  const liberarPorCodigo = async () => {
    setMsg(null)
    const c = codigo.trim().toLowerCase()
    const o = pendientes.find((x) => String(x.codigoLiberacion || '').toLowerCase() === c || (x.numero || '').toLowerCase() === c)
    if (!o) { setMsg({ tipo: 'error', txt: t('No hay una orden entregada con ese código esperando liberación.') }); return }
    await liberarOrden(o); setCodigo('')
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="head-safe flex items-center gap-2 bg-slate-900 px-4 pb-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><ShieldCheck size={18} /></div>
        <div><div className="text-sm font-bold">{usuario?.nombre}</div><div className="text-[11px] text-slate-400">{t('Supervisor de planta')}</div></div>
        <button onClick={() => navigate('/elegir')} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10"><Grid2x2 size={18} /></button>
        <button onClick={cerrarSesion} className="rounded-lg p-2 text-rose-300 hover:bg-white/10"><LogOut size={18} /></button>
      </header>

      <main className="mx-auto max-w-4xl p-4">
        {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}
        {!plantaId && <Aviso tipo="warn" className="mb-3">{t('Aún no tienes una planta asignada. Pídele al administrador que te asigne una en Usuarios y roles para ver las cargas de tu planta.')}</Aviso>}

        {/* KPIs (mismas tarjetas del admin) */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KPI label={t('En cola hacia planta')} value={stats.haciaPlanta} icon={ClipboardList} accent="navy" />
          <KPI label={t('En planta / cargando')} value={stats.enPlanta} icon={Package} accent="gold" />
          <KPI label={t('En ruta / salidas')} value={stats.enRuta} icon={Truck} accent="blue" />
          <KPI label={t('Esperando liberación')} value={stats.esperando} icon={PackageCheck} accent="green" />
        </div>

        {/* Liberar por código */}
        <Card className="mb-4 p-5 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 text-amber-500"><QrCode size={28} /></div>
          <div className="text-base font-black text-brand-navy dark:text-slate-100">{t('Liberar una carga')}</div>
          <div className="mt-0.5 text-xs text-slate-400">{t('Escribe el código que te muestra el chofer.')}</div>
          <div className="mx-auto mt-4 flex max-w-sm gap-2">
            <Input placeholder={t('Código (4 dígitos)')} inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && liberarPorCodigo()} className="flex-1 text-center text-lg font-bold tracking-widest" />
            <button onClick={liberarPorCodigo} disabled={!codigo.trim()} className="rounded-lg bg-emerald-500 px-5 text-sm font-black text-white shadow transition hover:bg-emerald-600 disabled:opacity-50">{t('Liberar')}</button>
          </div>
        </Card>

        {/* Esperando liberación (acción) */}
        <div className="mb-2 flex items-center gap-2"><PackageCheck size={16} className="text-emerald-500" /><h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Esperando liberación')}</h3><Badge color="gold">{pendientes.length}</Badge></div>
        {pendientes.length === 0 ? (
          <Card className="mb-4 flex flex-col items-center gap-2 p-8 text-center text-slate-400"><CheckCircle2 size={30} strokeWidth={1.4} className="text-emerald-400" /><p className="max-w-xs text-sm">{t('Ninguna orden esperando. Cuando un chofer entregue, aparecerá aquí.')}</p></Card>
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
                {o.codigoLiberacion && (
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                    <span className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-400">{t('Código para el chofer')}</span>
                    <span className="font-mono text-xl font-black tracking-[0.3em] text-brand-navy dark:text-slate-100">{o.codigoLiberacion}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Actividad de la planta (tabla, mismo estilo del admin) */}
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
      </main>
    </div>
  )
}
