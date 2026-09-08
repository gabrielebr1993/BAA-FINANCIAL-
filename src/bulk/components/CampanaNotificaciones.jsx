// Campana + panel de notificaciones (presentacional, reutilizable por rol).
// Recibe la lista ya construida `notifs`; gestiona estado leído/pendiente por
// dispositivo (localStorage con `claveLS` distinta por rol para no mezclarlos).
// Rediseño 2026 (Bloque 6): campana = círculo blanco del kit con badge dorado;
// en MÓVIL el panel es una PANTALLA completa crema; en escritorio (md+) sigue
// siendo un menú flotante. Además muestra un TOAST navy cuando llega un aviso
// nuevo con la app abierta (tocar el toast abre el destino del aviso).
import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, Timer, FileWarning, Receipt, MessageSquare, CheckCheck, X, MapPin } from 'lucide-react'
import { useLang } from '../../i18n'

const S = 1.75 // stroke Lucide del sistema
const ICONO = { sla: AlertTriangle, riesgo: Timer, factura: Receipt, incidencia: AlertTriangle, documento: FileWarning, mensaje: MessageSquare, pago: Receipt, geocerca: MapPin }
// Color del icono por severidad (tokens mp-*).
const COLOR = { critico: 'text-mp-red', warn: 'text-mp-amber', info: 'text-mp-blue' }

export default function CampanaNotificaciones({ notifs = [], claveLS = 'bulk_notif_leidas', invertido = false }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [leidas, setLeidas] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(claveLS) || '[]')) } catch { return new Set() } })
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [toast, setToast] = useState(null) // aviso recién llegado (banner temporal)
  const ref = useRef(null)
  const vistasRef = useRef(null) // ids ya vistos en esta sesión (para no re-toastear)

  const pendientes = useMemo(() => notifs.filter((n) => !leidas.has(n.id)), [notifs, leidas])
  const visibles = soloPendientes ? pendientes : notifs

  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    if (abierto) document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  // TOAST: la primera pasada solo "aprende" lo que ya había; después, cualquier
  // aviso pendiente nuevo se anuncia unos segundos (uno a la vez).
  useEffect(() => {
    if (!vistasRef.current) { vistasRef.current = new Set(notifs.map((n) => n.id)); return }
    const nuevo = pendientes.find((n) => !vistasRef.current.has(n.id))
    notifs.forEach((n) => vistasRef.current.add(n.id))
    if (nuevo && !abierto) setToast(nuevo)
  }, [notifs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  const guardar = (set) => { setLeidas(new Set(set)); try { localStorage.setItem(claveLS, JSON.stringify([...set])) } catch { /* noop */ } }
  const marcarLeida = (id) => { const s = new Set(leidas); s.add(id); guardar(s) }
  const marcarTodas = () => { const s = new Set(leidas); notifs.forEach((n) => s.add(n.id)); guardar(s) }
  const abrir = (n) => { marcarLeida(n.id); setAbierto(false); setToast(null); if (n.link) navigate(n.link) }

  // Campana: círculo blanco del kit (2026); `invertido` conserva la variante
  // para headers oscuros del panel de escritorio.
  const btnClase = invertido
    ? 'relative grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10'
    : 'relative grid h-10 w-10 place-items-center rounded-pill bg-white text-mp-navy shadow-card transition active:scale-95'

  // Fila de un aviso (pantalla móvil y menú de escritorio comparten diseño).
  const Fila = ({ n }) => {
    const Icon = ICONO[n.tipo] || Bell
    const pend = !leidas.has(n.id)
    return (
      <button onClick={() => abrir(n)} className={`flex w-full items-start gap-3 rounded-row bg-white p-3 text-left shadow-card transition active:scale-[0.99] ${pend ? '' : 'opacity-55'}`}>
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] bg-mp-cream">
          <Icon size={18} strokeWidth={S} className={COLOR[n.sev] || 'text-mp-ink-2'} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-mp-ink">{n.titulo}</span>
          {n.detalle && <span className="block truncate text-[12px] text-mp-ink-2">{n.detalle}</span>}
          {n.accion && <span className="mt-0.5 block truncate text-[12px] font-medium text-mp-gold">→ {t(n.accion)}</span>}
        </span>
        {pend && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-pill bg-mp-gold" />}
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto((v) => !v)} title={t('Notificaciones')} aria-label={t('Notificaciones')} className={btnClase}>
        <Bell size={invertido ? 17 : 20} strokeWidth={S} />
        {pendientes.length > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-mp-gold px-1 text-[11px] font-semibold text-mp-navy">{pendientes.length > 99 ? '99+' : pendientes.length}</span>
        )}
      </button>

      {/* TOAST de aviso nuevo (tarjeta navy arriba; tocar = abrir el destino) */}
      {toast && !abierto && (
        <button
          onClick={() => abrir(toast)}
          className="fixed left-1/2 z-[70] flex w-[min(92vw,360px)] -translate-x-1/2 items-start gap-3 rounded-card bg-mp-navy p-3.5 text-left text-mp-cream shadow-float"
          style={{ top: 'max(env(safe-area-inset-top), 12px)' }}
        >
          {(() => { const Icon = ICONO[toast.tipo] || Bell; return (
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] bg-white/10 text-mp-gold"><Icon size={18} strokeWidth={S} /></span>
          ) })()}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{toast.titulo}</span>
            {toast.detalle && <span className="block truncate text-[12px] text-mp-cream/60">{toast.detalle}</span>}
          </span>
          <span onClick={(e) => { e.stopPropagation(); setToast(null) }} className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-pill text-mp-cream/50 hover:bg-white/10"><X size={14} strokeWidth={S} /></span>
        </button>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-mp-cream md:absolute md:inset-auto md:right-0 md:mt-2 md:max-h-[70vh] md:w-[360px] md:rounded-card md:shadow-float">
          {/* Header: en móvil respeta la safe area; en escritorio es compacto */}
          <div className="flex items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] min-[430px]:px-5 md:px-4 md:pt-3">
            <button onClick={() => setAbierto(false)} aria-label={t('Cerrar')} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-pill bg-white text-mp-navy shadow-card transition active:scale-95 md:h-8 md:w-8"><X size={20} strokeWidth={S} /></button>
            <span className="text-[17px] font-semibold text-mp-ink">{t('Notificaciones')}</span>
            {pendientes.length > 0 && <span className="grid h-5 min-w-[20px] place-items-center rounded-pill bg-mp-gold px-1.5 text-[11px] font-semibold text-mp-navy">{pendientes.length}</span>}
          </div>

          {/* Filtros pill: Todas / Pendientes */}
          <div className="flex items-center gap-2 px-4 pb-2 min-[430px]:px-5 md:px-4">
            {[[false, t('Todas')], [true, t('Pendientes')]].map(([v, etq]) => (
              <button key={String(v)} onClick={() => setSoloPendientes(v)}
                className={`rounded-pill px-3.5 py-1.5 text-[13px] transition ${soloPendientes === v ? 'bg-mp-navy text-mp-cream' : 'bg-white text-mp-ink-2 shadow-card'}`}>
                {etq}
              </button>
            ))}
            {pendientes.length > 0 && (
              <button onClick={marcarTodas} className="ml-auto inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-[12px] font-medium text-mp-ink-2 transition hover:text-mp-ink">
                <CheckCheck size={14} strokeWidth={S} /> {t('Marcar todas')}
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-1 min-[430px]:px-5 md:px-4 md:pb-4">
            {visibles.length === 0 ? (
              <div className="px-4 py-12 text-center text-[14px] text-mp-ink-2">{soloPendientes ? t('Sin pendientes. Todo al día.') : t('Sin notificaciones.')}</div>
            ) : visibles.map((n) => <Fila key={n.id} n={n} />)}
          </div>
        </div>
      )}
    </div>
  )
}
