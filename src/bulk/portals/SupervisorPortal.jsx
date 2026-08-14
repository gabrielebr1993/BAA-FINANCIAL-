import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, LogOut, Grid2x2, QrCode, CheckCircle2 } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { liberar } from '../data/presencia'
import { auditar } from '../data/auditoria'
import { ORDEN_ESTADO as E } from '../domain/constants'
import { ahora } from '../domain/flujo'
import { NIVEL_LABEL } from '../domain/liberacion'
import { Card, Boton, Input, Badge, Aviso } from '../../components/ui'
import { useLang } from '../../i18n'

export default function SupervisorPortal() {
  const { t } = useLang()
  const { usuario, cerrarSesion, tenantId, rol } = useBulkAuth()
  const navigate = useNavigate()
  const { datos: ordenes } = useColeccion('orders')
  const [codigo, setCodigo] = useState('')
  const [msg, setMsg] = useState(null)

  const pendientes = useMemo(() => ordenes.filter((o) => o.estado === E.ENTREGADA), [ordenes])

  const nivelDe = (o) => (o.liberacion && o.liberacion.nivel) || null
  const COLOR_NIVEL = { alta: 'green', media: 'gold', baja: 'slate', critico: 'red' }

  const liberar = async (orden) => {
    const nivel = nivelDe(orden)
    const sensible = nivel === 'baja' || nivel === 'critico'
    let motivo = ''
    if (sensible) {
      // Caso sensible (§8): motivo obligatorio + doble confirmación.
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
    // Sin esto quedaba 'ocupado' para siempre y el matcher no le ofrecía nada.
    if (orden.choferId) { try { await liberar(orden.choferId) } catch { /* noop */ } }
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'liberar_carga', entidad: 'orden', entidadId: orden.id, detalle: sensible ? `confianza ${nivel} · ${motivo}` : `confianza ${nivel || 'n/d'}` })
    setMsg({ tipo: 'ok', txt: `${t('Orden')} ${orden.numero} ${t('liberada. El chofer ya puede tomar otra carga.')}` })
  }

  const liberarPorCodigo = async () => {
    setMsg(null)
    const c = codigo.trim().toLowerCase()
    // Acepta el código de liberación de 4 dígitos o el número de la orden.
    const o = pendientes.find((x) => String(x.codigoLiberacion || '').toLowerCase() === c || (x.numero || '').toLowerCase() === c)
    if (!o) { setMsg({ tipo: 'error', txt: t('No hay una orden entregada con ese código esperando liberación.') }); return }
    await liberar(o); setCodigo('')
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><ShieldCheck size={18} /></div>
        <div><div className="text-sm font-bold">{usuario?.nombre}</div><div className="text-[11px] text-slate-400">{t('Supervisor de planta')}</div></div>
        <button onClick={() => navigate('/elegir')} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10"><Grid2x2 size={18} /></button>
        <button onClick={cerrarSesion} className="rounded-lg p-2 text-rose-300 hover:bg-white/10"><LogOut size={18} /></button>
      </header>

      <main className="flex-1 overflow-y-auto p-3">
        {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}
        <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-amber-500/10 text-amber-500"><QrCode size={30} /></div>
          <div className="text-base font-black text-brand-navy dark:text-slate-100">{t('Liberar una carga')}</div>
          <div className="mt-0.5 text-xs text-slate-400">{t('Escribe el código que te muestra el chofer.')}</div>
          <div className="mt-4 flex gap-2">
            <Input placeholder={t('Código (4 dígitos)')} inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && liberarPorCodigo()} className="flex-1 text-center text-lg font-bold tracking-widest" />
            <button onClick={liberarPorCodigo} disabled={!codigo.trim()} className="rounded-2xl bg-emerald-500 px-5 text-sm font-black text-white shadow transition hover:bg-emerald-600 disabled:opacity-50">{t('Liberar')}</button>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2"><span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Esperando liberación')}</span><span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-amber-500/15 px-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">{pendientes.length}</span></div>
        {pendientes.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2 text-center text-slate-400"><CheckCircle2 size={34} strokeWidth={1.4} className="text-emerald-400" /><p className="max-w-xs text-sm">{t('Ninguna orden esperando. Cuando un chofer entregue, aparecerá aquí.')}</p></div>
        ) : (
          pendientes.map((o) => (
            <div key={o.id} className="mb-2 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-700/60 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-brand-navy dark:text-slate-100">{o.numero}</span>
                <Badge color="gold">{o.pesoReal ?? o.pesoEstimado} ton</Badge>
                {nivelDe(o) && <Badge color={COLOR_NIVEL[nivelDe(o)] || 'slate'}>{t(NIVEL_LABEL[nivelDe(o)] || nivelDe(o))}</Badge>}
                <button onClick={() => liberar(o)} className="ml-auto inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600"><CheckCircle2 size={14} /> {t('Liberar')}</button>
              </div>
              <div className="mt-1 text-xs text-slate-400">{t(o.material || 'material s/e')} · {t('chofer:')} {o.choferNombre || '—'}</div>
              {o.codigoLiberacion && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                  <span className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-400">{t('Código para el chofer')}</span>
                  <span className="font-mono text-xl font-black tracking-[0.3em] text-brand-navy dark:text-slate-100">{o.codigoLiberacion}</span>
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  )
}
