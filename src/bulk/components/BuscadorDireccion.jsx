// ── Buscador de DIRECCIÓN con Google Places (autocompletado) ─────────────────
// Compartido por Geocercas y Clientes y Plantas. Escribe → sugerencias del
// backend (bulkPlacesOp; la API key nunca toca el navegador) → al elegir,
// entrega { direccion, ciudad, estado, zip, lat, lng } al padre.
import { useEffect, useRef, useState } from 'react'
import { Search, MapPin, CheckCircle2, X } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { Input, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

export default function BuscadorDireccion({ onElegir, seleccion, onLimpiar, placeholder }) {
  const { t } = useLang()
  const [q, setQ] = useState('')
  const [sugerencias, setSugerencias] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [errApi, setErrApi] = useState('')
  const timer = useRef(null)
  const pedido = useRef(0)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const texto = q.trim()
    if (texto.length < 3) { setSugerencias([]); setBuscando(false); return }
    setBuscando(true)
    timer.current = setTimeout(async () => {
      const n = ++pedido.current
      try {
        const fn = httpsCallable(funcsBulk, 'bulkPlacesOp', { timeout: 15000 })
        const r = await fn({ op: 'autocomplete', q: texto })
        if (n === pedido.current) { setSugerencias(r?.data?.sugerencias || []); setErrApi('') }
      } catch (e) {
        if (n === pedido.current) { setSugerencias([]); setErrApi(e?.message || t('No se pudo buscar la dirección.')) }
      } finally { if (n === pedido.current) setBuscando(false) }
    }, 350)
    return () => timer.current && clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const elegir = async (s) => {
    setSugerencias([]); setQ(''); setBuscando(true)
    try {
      const fn = httpsCallable(funcsBulk, 'bulkPlacesOp', { timeout: 15000 })
      const r = await fn({ op: 'detalles', placeId: s.placeId })
      const d = r?.data || {}
      if (d.lat == null || d.lng == null) { setErrApi(t('Esa dirección no tiene coordenadas; elige otra.')); return }
      setErrApi('')
      onElegir(d)
    } catch (e) { setErrApi(e?.message || t('No se pudo obtener la dirección.')) }
    finally { setBuscando(false) }
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || t('Busca la dirección (Google Maps)…')} className="h-11 w-full pl-9" />
        {buscando && <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner /></span>}
      </div>
      {sugerencias.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {sugerencias.map((s) => (
            <button key={s.placeId} type="button" onClick={() => elegir(s)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-amber-50 dark:text-slate-200 dark:hover:bg-slate-800">
              <MapPin size={14} className="mt-0.5 flex-shrink-0 text-amber-500" /> <span>{s.texto}</span>
            </button>
          ))}
        </div>
      )}
      {errApi && <p className="mt-1 text-xs font-medium text-rose-500">{errApi}</p>}
      {seleccion && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-700 dark:text-slate-200">{seleccion.direccion}</div>
            <div className="text-slate-500 dark:text-slate-400">
              {[seleccion.ciudad, seleccion.estado, seleccion.zip].filter(Boolean).join(', ')} · GPS {Number(seleccion.lat).toFixed(5)}, {Number(seleccion.lng).toFixed(5)}
            </div>
          </div>
          {onLimpiar && <button type="button" onClick={onLimpiar} className="text-slate-400 hover:text-rose-500"><X size={14} /></button>}
        </div>
      )}
    </div>
  )
}
