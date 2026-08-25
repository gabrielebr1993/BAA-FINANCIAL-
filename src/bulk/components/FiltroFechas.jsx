// Filtro por RANGO DE FECHAS reutilizable para vistas de pagos/finanzas.
// Uso: const [rango, setRango] = useState(RANGO_VACIO)
//      <FiltroFechas rango={rango} onChange={setRango} />
//      lista.filter((x) => enRangoFechas(x.fecha, rango))
import { Calendar } from 'lucide-react'
import { useLang } from '../../i18n'

export const RANGO_VACIO = { desde: '', hasta: '' }

// ¿El timestamp (ISO o Date) cae dentro del rango? Rango vacío = todo pasa.
// Un registro SIN fecha solo pasa cuando no hay rango activo.
export function enRangoFechas(ts, rango) {
  const { desde = '', hasta = '' } = rango || {}
  if (!desde && !hasta) return true
  const t = ts ? new Date(ts).getTime() : NaN
  if (Number.isNaN(t)) return false
  if (desde && t < new Date(`${desde}T00:00:00`).getTime()) return false
  if (hasta && t > new Date(`${hasta}T23:59:59.999`).getTime()) return false
  return true
}

// Fecha local YYYY-MM-DD (sin toISOString: evita el corrimiento de zona horaria).
const d10 = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function FiltroFechas({ rango = RANGO_VACIO, onChange, className = '' }) {
  const { t } = useLang()
  const hoy = new Date()
  const preset = (dias) => {
    if (dias === 'mes') { onChange({ desde: d10(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: '' }); return }
    if (dias == null) { onChange(RANGO_VACIO); return }
    const d = new Date(hoy); d.setDate(d.getDate() - dias)
    onChange({ desde: d10(d), hasta: '' })
  }
  const activo = !!(rango.desde || rango.hasta)
  const btn = 'rounded-lg px-2 py-1 text-[11px] font-bold transition'
  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      <Calendar size={14} className="flex-shrink-0 text-amber-500" />
      <input type="date" value={rango.desde} onChange={(e) => onChange({ ...rango, desde: e.target.value })}
        className="rounded-lg border border-slate-200 bg-transparent px-1.5 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-200" />
      <span className="text-xs text-slate-400">→</span>
      <input type="date" value={rango.hasta} onChange={(e) => onChange({ ...rango, hasta: e.target.value })}
        className="rounded-lg border border-slate-200 bg-transparent px-1.5 py-1 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-200" />
      <span className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => preset(7)} className={`${btn} bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300`}>{t('7 días')}</button>
        <button type="button" onClick={() => preset(15)} className={`${btn} bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300`}>{t('15 días')}</button>
        <button type="button" onClick={() => preset('mes')} className={`${btn} bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300`}>{t('Este mes')}</button>
        {activo && <button type="button" onClick={() => preset(null)} className={`${btn} bg-rose-500/10 text-rose-500 hover:bg-rose-500/20`}>{t('Todo')}</button>}
      </span>
    </div>
  )
}
