// Centro de notificaciones in-app (§14): campana + panel con estados leído/pendiente.
// Deriva alertas accionables de los datos en vivo (SLA, riesgo, disputas, incidencias,
// documentos). El estado "leído" se guarda por dispositivo (localStorage).
import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, Timer, FileWarning, Receipt, CheckCheck, X } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { construirNotificaciones } from '../domain/notificaciones'
import { useLang } from '../../i18n'

const LS = 'bulk_notif_leidas'
const leerLeidas = () => { try { return new Set(JSON.parse(localStorage.getItem(LS) || '[]')) } catch { return new Set() } }
const ICONO = { sla: AlertTriangle, riesgo: Timer, factura: Receipt, incidencia: AlertTriangle, documento: FileWarning }
const COLOR = { critico: 'text-rose-500', warn: 'text-amber-500', info: 'text-sky-500' }

export default function NotificacionesCentro() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [leidas, setLeidas] = useState(leerLeidas)
  const [soloPendientes, setSoloPendientes] = useState(false)
  const ref = useRef(null)

  const { datos: ordenes } = useColeccion('orders')
  const { datos: facturas } = useColeccion('invoices')
  const { datos: incidencias } = useColeccion('incidents')
  const { datos: documentos } = useColeccion('documents')

  const notifs = useMemo(
    () => construirNotificaciones({ ordenes, facturas, incidencias, documentos, ahoraMs: Date.now() }),
    [ordenes, facturas, incidencias, documentos],
  )
  const pendientes = notifs.filter((n) => !leidas.has(n.id))
  const visibles = soloPendientes ? pendientes : notifs

  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    if (abierto) document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const guardar = (set) => { setLeidas(new Set(set)); try { localStorage.setItem(LS, JSON.stringify([...set])) } catch { /* noop */ } }
  const marcarLeida = (id) => { const s = new Set(leidas); s.add(id); guardar(s) }
  const marcarTodas = () => { const s = new Set(leidas); notifs.forEach((n) => s.add(n.id)); guardar(s) }
  const abrir = (n) => { marcarLeida(n.id); setAbierto(false); navigate(n.link) }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto((v) => !v)} title={t('Notificaciones')}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
        <Bell size={17} />
        {pendientes.length > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">{pendientes.length > 99 ? '99+' : pendientes.length}</span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
            <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Notificaciones')}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{pendientes.length}</span>
            <button onClick={() => setSoloPendientes((v) => !v)} className={`ml-auto rounded-md px-2 py-1 text-[11px] font-semibold ${soloPendientes ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{t('Solo pendientes')}</button>
            <button onClick={() => setAbierto(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={15} /></button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {visibles.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">{soloPendientes ? t('Sin pendientes. Todo al día.') : t('Sin notificaciones.')}</div>
            ) : visibles.map((n) => {
              const Icon = ICONO[n.tipo] || Bell
              const pend = !leidas.has(n.id)
              return (
                <button key={n.id} onClick={() => abrir(n)} className={`flex w-full items-start gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/50 ${pend ? '' : 'opacity-60'}`}>
                  <Icon size={16} className={`mt-0.5 flex-shrink-0 ${COLOR[n.sev] || 'text-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-brand-navy dark:text-slate-100">{n.titulo}</div>
                    {n.detalle && <div className="truncate text-xs text-slate-400">{n.detalle}</div>}
                  </div>
                  {pend && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />}
                </button>
              )
            })}
          </div>

          {pendientes.length > 0 && (
            <button onClick={marcarTodas} className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
              <CheckCheck size={14} /> {t('Marcar todas como leídas')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
