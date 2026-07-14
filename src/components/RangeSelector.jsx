// Filtro de rango de fechas: date pickers Desde/Hasta + botón BUSCAR (aplica al
// pulsar, no al teclear) + atajos rápidos + toggle Combinado/Por semana.
import { useState, useEffect } from 'react'
import { Calendar, Search, RotateCcw, FileText } from 'lucide-react'
import { useData } from '../DataContext'
import { PRESETS } from '../utils/rango'
import { nombreCiudadDe } from '../utils/calc'

const ATAJOS = PRESETS.filter((p) => p.key !== 'personalizado')

// Descripción corta de cada atajo, para que quede claro qué muestra cada opción.
const DESCRIPCIONES = {
  ultima: 'Solo la factura más reciente.',
  ultimas4: 'Suma de las 4 facturas más recientes.',
  esteMes: 'Todas las facturas del mes actual.',
  mesPasado: 'Todas las facturas del mes anterior.',
  esteTrimestre: 'Todas las facturas del trimestre actual.',
  esteAno: 'Todas las facturas de este año.',
  todo: 'Todas las facturas cargadas.',
  personalizado: 'Facturas cuya semana toca las fechas elegidas.',
  factura: 'Los datos de una sola factura que elijas.',
}

export default function RangeSelector() {
  const { rango, setRango, vista, setVista, invoicesRango, invoices } = useData()
  const varias = invoicesRango.length > 1

  // Estado LOCAL de las fechas: solo se aplica al pulsar "Buscar" (así no filtra a
  // medio escribir). Se sincroniza si el rango cambia por un atajo.
  const [desde, setDesde] = useState(rango.desde || '')
  const [hasta, setHasta] = useState(rango.hasta || '')
  useEffect(() => { setDesde(rango.desde || ''); setHasta(rango.hasta || '') }, [rango.desde, rango.hasta])

  const buscar = () => {
    let d = desde, h = hasta
    // Si solo se elige UNA fecha, se toma como ese día exacto (muestra la factura/semana
    // que contiene esa fecha), en vez de "desde esa fecha en adelante".
    if (d && !h) h = d
    if (h && !d) d = h
    if (d && h && d > h) { const t = d; d = h; h = t } // por si se invierten
    setRango({ preset: 'personalizado', desde: d, hasta: h })
  }
  const limpiar = () => { setDesde(''); setHasta(''); setRango({ preset: 'ultima', desde: '', hasta: '' }) }
  const setPreset = (preset) => setRango({ preset, desde: '', hasta: '' })

  const inputCls = 'rounded-lg bg-transparent px-1 py-1.5 text-sm text-slate-700 outline-none dark:text-slate-100'
  const activoPersonalizado = rango.preset === 'personalizado' && (rango.desde || rango.hasta)

  // Etiqueta legible de una factura para el selector "Por factura".
  const etiquetaFactura = (inv) => {
    const ciudad = inv.ciudadNombre || nombreCiudadDe(inv, inv.ciudad) || 'Sin ciudad'
    return `${ciudad} · ${inv.semana || 's/f'}`
  }
  const descripcion = DESCRIPCIONES[rango.preset] || ''

  return (
    <div className="flex w-full flex-col gap-1.5">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
        <Calendar size={16} strokeWidth={1.8} className="text-slate-400" />
        <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label="Desde" />
        <span className="text-slate-400">–</span>
        <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label="Hasta" />
        <button onClick={buscar} disabled={!desde && !hasta} className="ml-1 inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-brand-gold dark:text-brand-navy" title="Aplicar el rango de fechas">
          <Search size={13} strokeWidth={2.2} /> Buscar
        </button>
        {activoPersonalizado && (
          <button onClick={limpiar} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-slate-500 hover:text-brand-navy dark:hover:text-white" title="Limpiar y volver a la última semana">
            <RotateCcw size={13} strokeWidth={2} />
          </button>
        )}
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

      {/* Por factura: elige una factura específica y ve solo sus datos. */}
      <div className={`flex items-center gap-1.5 rounded-xl border px-2 py-1 ${rango.preset === 'factura' ? 'border-brand-navy bg-brand-navy/5 dark:border-brand-gold dark:bg-brand-gold/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
        <FileText size={16} strokeWidth={1.8} className="text-slate-400" />
        <select
          value={rango.preset === 'factura' ? (rango.invoiceId || '') : ''}
          onChange={(e) => { const id = e.target.value; if (id) setRango({ preset: 'factura', invoiceId: id, desde: '', hasta: '' }); else setPreset('ultima') }}
          className="max-w-[220px] rounded-lg bg-transparent px-1 py-1.5 text-sm text-slate-700 outline-none dark:text-slate-100"
          aria-label="Ver por factura"
          title="Ver los datos de una sola factura"
        >
          <option value="">Por factura…</option>
          {(invoices || []).map((inv) => (
            <option key={inv.id} value={inv.id}>{etiquetaFactura(inv)}</option>
          ))}
        </select>
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
      {descripcion && <p className="m-0 pl-1 text-[11px] text-slate-400 dark:text-slate-500">{descripcion}</p>}
    </div>
  )
}
