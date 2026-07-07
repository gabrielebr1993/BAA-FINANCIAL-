// Selector de rango de fechas (atajos + personalizado) y toggle de vista.
import { useData } from '../DataContext'
import { PRESETS } from '../utils/rango'
import { Select, Input } from './ui'

export default function RangeSelector() {
  const { rango, setRango, vista, setVista, invoicesRango } = useData()
  const setPreset = (preset) => setRango((r) => ({ ...r, preset }))
  const varias = invoicesRango.length > 1

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={rango.preset} onChange={(e) => setPreset(e.target.value)} aria-label="Rango de fechas">
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>📅 {p.label}</option>
        ))}
      </Select>

      {rango.preset === 'personalizado' && (
        <>
          <Input type="date" value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} aria-label="Desde" />
          <span className="text-sm text-slate-400">→</span>
          <Input type="date" value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} aria-label="Hasta" />
        </>
      )}

      {varias && (
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
          {[
            { k: 'combinado', l: 'Combinado' },
            { k: 'porSemana', l: 'Por semana' },
          ].map((v) => (
            <button
              key={v.k}
              onClick={() => setVista(v.k)}
              className={`px-3 py-2 text-sm font-medium transition ${
                vista === v.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'
              }`}
            >
              {v.l}
            </button>
          ))}
        </div>
      )}

      {varias && <span className="text-xs text-slate-500 dark:text-slate-400">{invoicesRango.length} semanas</span>}
    </div>
  )
}
