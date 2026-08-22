// BULK · Avisos EN-APP (toast + sonido) de entrada/salida de geocercas. Se muestran al
// ADMIN/STAFF y al TRANSPORTISTA (su carrier); el chofer y el cliente NO lo montan.
// Reutiliza la misma colección bulk_geoeventos que alimenta el push. No repite avisos
// ya vistos y no dispara nada por los eventos que ya existían al abrir la app.
import { useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { where } from '../data/repo'
import { tsMillis } from '../data/chatKeys'
import { beep, notificar } from '../integraciones/alertasLocales'
import { useLang } from '../../i18n'

// `carrierId`: si se pasa (portal del transportista) filtra a su carrier; si es null
// (consola staff/admin) escucha todo el tenant.
export default function AvisosGeocerca({ carrierId = null }) {
  const { t } = useLang()
  const filtros = carrierId ? [where('carrierId', '==', carrierId)] : []
  const opts = carrierId ? {} : { orden: 'ts', dir: 'desc', limite: 15 }
  const { datos: eventos } = useColeccion('geoeventos', filtros, opts)

  const vistos = useRef(null) // Set de ids ya conocidos (null hasta la primera carga)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    if (!eventos) return
    // Primera carga: marca todo lo existente como visto (no avisar por lo viejo).
    if (vistos.current === null) { vistos.current = new Set(eventos.map((e) => e.id)); return }
    const nuevos = eventos.filter((e) => e.id && !vistos.current.has(e.id))
    if (!nuevos.length) return
    nuevos.forEach((e) => vistos.current.add(e.id))
    // Ordena por tiempo y muestra (evita spam: máximo los 3 más recientes de golpe).
    const recientes = nuevos.sort((a, b) => tsMillis(b.ts) - tsMillis(a.ts)).slice(0, 3)
    try { beep() } catch { /* noop */ }
    for (const e of recientes) {
      const entrada = e.evento === 'entrada'
      const titulo = entrada ? t('🚨 Entrada a geocerca') : t('🔔 Salida de geocerca')
      const idTxt = e.choferCodigo ? ` (ID: ${e.choferCodigo})` : ''
      const cuerpo = `${e.choferNombre || t('Chofer')}${idTxt} ${entrada ? t('entró a') : t('salió de')} ${e.geocerca || t('la geocerca')}`
      try { notificar(titulo, cuerpo) } catch { /* noop */ }
      const id = e.id
      setToasts((s) => [{ id, entrada, titulo, cuerpo, unidad: e.unidad || '', ts: e.ts }, ...s].slice(0, 4))
      setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 8000)
    }
  }, [eventos, t])

  if (!toasts.length) return null
  return (
    <div className="fixed right-3 top-3 z-[120] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((x) => (
        <div key={x.id} className={`flex items-start gap-2 rounded-2xl border bg-white p-3 shadow-xl dark:bg-slate-900 ${x.entrada ? 'border-emerald-300 dark:border-emerald-500/40' : 'border-amber-300 dark:border-amber-500/40'}`}>
          <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full ${x.entrada ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}`}><MapPin size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-brand-navy dark:text-slate-100">{x.titulo}</div>
            <div className="text-xs text-slate-500 dark:text-slate-300">{x.cuerpo}</div>
            {x.unidad && <div className="text-[11px] text-slate-400">{t('Unidad')} {x.unidad}</div>}
          </div>
          <button onClick={() => setToasts((s) => s.filter((y) => y.id !== x.id))} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={16} /></button>
        </div>
      ))}
    </div>
  )
}
