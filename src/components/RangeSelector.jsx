// Filtro de rango de fechas: date pickers Desde/Hasta siempre visibles +
// atajos rápidos + toggle Combinado/Por semana.
import { Calendar } from 'lucide-react'
import { useData } from '../DataContext'
import { PRESETS } from '../utils/rango'

const ATAJOS = PRESETS.filter((p) => p.key !== 'personalizado')

export default function RangeSelector() {
  const { rango, setRango, vista, setVista, invoicesRango } = useData()
  const varias = invoicesRango.length > 1

  const setFecha = (campo, valor) => setRango((r) => ({ ...r, preset: 'personalizado', [campo]: valor }))
  const setPreset = (preset) => setRango({ preset, desde: '', hasta: '' })

  const inputCls = 'rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
        <Calendar size={16} strokeWidth={1.8} className="text-slate-400" />
        <input type="date" value={rango.desde || ''} onChange={(e) => setFecha('desde', e.target.value)} className={inputCls + ' border-0 bg-transparent px-1'} aria-label="Desde" />
        <span className="text-slate-400">–</span>
        <input type="date" value={rango.hasta || ''} onChange={(e) => setFecha('hasta', e.target.value)} className={inputCls + ' border-0 bg-transparent px-1'} aria-label="Hasta" />
      </div>

      <div className="flex flex-wrap gap-1">
        {ATAJOS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              rango.preset === p.key
                ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {varias && (
        <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          {[{ k: 'combinado', l: 'Combinado' }, { k: 'porSemana', l: 'Por semana' }].map((v) => (
            <button
              key={v.k}
              onClick={() => setVista(v.k)}
              className={`px-3 py-2 text-sm font-medium transition ${
                vista === v.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {v.l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
