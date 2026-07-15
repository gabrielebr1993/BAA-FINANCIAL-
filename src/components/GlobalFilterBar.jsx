// Barra de filtros GLOBAL con jerarquía clara (vive en el Layout → afecta a toda la app):
//   1) "Mostrando: …" — siempre visible, dice exactamente qué datos se ven.
//   2) Selector PRINCIPAL — toggle "Por período" ↔ "Una factura" (excluyentes: activar
//      uno desactiva el otro; internamente es un solo estado rango.preset).
//   3) "Refinar:" — Ciudad + Chofer (opcionales, se aplican sobre lo elegido arriba) +
//      "Limpiar".
import { useState, useEffect, useRef } from 'react'
import { Calendar, Search, FileText, CalendarRange, Eraser } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { PRESETS } from '../utils/rango'
import { TODAS, TODOS, nombreCiudadDe } from '../utils/calc'
import CitySelector, { DriverSelector } from './CitySelector'

const ATAJOS = PRESETS.filter((p) => p.key !== 'personalizado')
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtDia = (d) => (d instanceof Date && !isNaN(d) ? `${d.getDate()} ${MESES[d.getMonth()]}` : '')
const fmtISO = (s) => { if (!s) return ''; const p = s.split('-'); return `${parseInt(p[2], 10)} ${MESES[parseInt(p[1], 10) - 1]}` }
const rangoDias = (a, b) => (a && b ? (a === b ? a : `${a}–${b}`) : (a || b || ''))
const fmtMonto = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`

export default function GlobalFilterBar() {
  const {
    rango, setRango, invoices, invoicesRango, numSemanas, vista, setVista,
    selectedCity, setSelectedCity, selectedDriver, setSelectedDriver,
    facturaRangoFull, ciudadBloqueada,
  } = useData()

  // El MANAGER solo puede ver "Una factura" (no "Por período"): se le oculta el modo
  // período y se le fuerza a factura (para que los pagos por factura funcionen bien).
  const { perfil } = useAuth()
  const soloFactura = perfil?.role === 'manager'

  // Modo derivado del único estado: 'factura' vs 'periodo'. Nunca coexisten.
  const modo = rango.preset === 'factura' ? 'factura' : 'periodo'
  // Recuerda el último atajo de período para restaurarlo al volver de "Una factura".
  const ultimoPreset = useRef(modo === 'periodo' && rango.preset !== 'personalizado' ? rango.preset : 'ultima')
  useEffect(() => { if (modo === 'periodo' && rango.preset !== 'personalizado') ultimoPreset.current = rango.preset }, [modo, rango.preset])

  // Fechas locales del "Personalizado": solo se aplican al pulsar Buscar.
  const [desde, setDesde] = useState(rango.desde || '')
  const [hasta, setHasta] = useState(rango.hasta || '')
  useEffect(() => { setDesde(rango.desde || ''); setHasta(rango.hasta || '') }, [rango.desde, rango.hasta])
  const [abrirPers, setAbrirPers] = useState(rango.preset === 'personalizado')
  useEffect(() => { if (rango.preset === 'personalizado') setAbrirPers(true) }, [rango.preset])

  const irPeriodo = () => { if (modo !== 'periodo') setRango({ preset: ultimoPreset.current || 'ultima', desde: '', hasta: '' }) }
  const irFactura = () => {
    if (modo === 'factura') return
    const id = rango.invoiceId && invoices.some((i) => i.id === rango.invoiceId) ? rango.invoiceId : (invoices[0]?.id || '')
    if (id) setRango({ preset: 'factura', invoiceId: id, desde: '', hasta: '' })
  }
  // Manager: forzar modo "Una factura" (elige la más reciente si venía en período).
  useEffect(() => {
    if (!soloFactura || modo === 'factura') return
    const id = rango.invoiceId && invoices.some((i) => i.id === rango.invoiceId) ? rango.invoiceId : (invoices[0]?.id || '')
    if (id) setRango({ preset: 'factura', invoiceId: id, desde: '', hasta: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloFactura, modo, invoices])
  const setPreset = (preset) => { setAbrirPers(false); setRango({ preset, desde: '', hasta: '' }) }
  const buscar = () => {
    let d = desde, h = hasta
    if (d && !h) h = d
    if (h && !d) d = h
    if (d && h && d > h) { const t = d; d = h; h = t }
    setRango({ preset: 'personalizado', desde: d, hasta: h })
  }
  const limpiar = () => {
    setDesde(''); setHasta(''); setAbrirPers(false)
    setRango({ preset: 'ultima', desde: '', hasta: '' })
    if (!ciudadBloqueada) setSelectedCity(TODAS)
    setSelectedDriver(TODOS)
  }

  // ---- indicador "Mostrando: …" ----
  const facturaSel = modo === 'factura' ? invoices.find((i) => i.id === rango.invoiceId) : null
  let periodoLabel
  if (modo === 'factura') {
    periodoLabel = facturaSel ? `Factura ${rangoDias(fmtDia(facturaSel.fechaInicio), fmtDia(facturaSel.fechaFin)) || facturaSel.semana || ''}` : 'Una factura'
  } else if (rango.preset === 'personalizado' && (rango.desde || rango.hasta)) {
    periodoLabel = `${fmtISO(rango.desde) || '…'}–${fmtISO(rango.hasta) || '…'}`
  } else {
    periodoLabel = (PRESETS.find((p) => p.key === rango.preset) || {}).label || 'Última semana'
  }
  const ciudadLabel = selectedCity === TODAS ? 'Todas las ciudades' : (nombreCiudadDe(facturaRangoFull, selectedCity) || selectedCity)
  const hayChofer = selectedDriver && selectedDriver !== TODOS
  const varias = numSemanas > 1

  const seg = (activo) => `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${activo ? 'bg-brand-navy text-white shadow-sm dark:bg-brand-gold dark:text-brand-navy' : 'text-slate-600 hover:text-brand-navy dark:text-slate-300 dark:hover:text-white'}`
  const chip = (activo) => `rounded-full px-3 py-1.5 text-xs font-medium transition ${activo ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700'}`
  const inputCls = 'rounded-lg bg-transparent px-1 py-1.5 text-sm text-slate-700 outline-none dark:text-slate-100'

  return (
    <div className="scroll-thin overflow-x-auto border-t border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur dark:border-slate-700/60 dark:bg-surface-dark-card/90">
      <div className="flex min-w-max flex-col gap-2">
        {/* 1) Mostrando */}
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="text-slate-400 dark:text-slate-500">Mostrando:</span>
          <span className="font-semibold text-brand-navy dark:text-white">{periodoLabel}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="text-slate-600 dark:text-slate-300">{ciudadLabel}</span>
          {hayChofer && (<><span className="text-slate-300 dark:text-slate-600">·</span><span className="text-slate-600 dark:text-slate-300">{selectedDriver}</span></>)}
        </div>

        {/* 2) Selector principal (período ↔ factura, excluyentes). El manager solo ve
            "Una factura". */}
        <div className="flex flex-wrap items-center gap-2">
          {soloFactura ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-brand-navy dark:border-slate-700 dark:bg-slate-800 dark:text-white"><FileText size={14} strokeWidth={1.9} className="text-brand-gold" /> Una factura</span>
          ) : (
            <>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">¿Qué quieres ver?</span>
              <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                <button onClick={irPeriodo} className={seg(modo === 'periodo')} aria-pressed={modo === 'periodo'}>📅 Por período</button>
                <button onClick={irFactura} className={seg(modo === 'factura')} aria-pressed={modo === 'factura'} disabled={invoices.length === 0}>📄 Una factura</button>
              </div>
            </>
          )}

          {(modo === 'periodo' && !soloFactura) ? (
            <div className="flex flex-wrap items-center gap-1">
              {ATAJOS.map((p) => (
                <button key={p.key} onClick={() => setPreset(p.key)} className={chip(rango.preset === p.key)}>{p.label}</button>
              ))}
              <button onClick={() => setAbrirPers((o) => !o)} className={chip(rango.preset === 'personalizado')}>
                <span className="inline-flex items-center gap-1"><CalendarRange size={13} strokeWidth={2} /> Personalizado</span>
              </button>
              {abrirPers && (
                <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
                  <Calendar size={16} strokeWidth={1.8} className="text-slate-400" />
                  <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label="Desde" />
                  <span className="text-slate-400">–</span>
                  <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label="Hasta" />
                  <button onClick={buscar} disabled={!desde && !hasta} className="ml-1 inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-brand-gold dark:text-brand-navy">
                    <Search size={13} strokeWidth={2.2} /> Buscar
                  </button>
                </div>
              )}
              {varias && (
                <div className="ml-1 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  {[{ k: 'combinado', l: 'Combinado' }, { k: 'porSemana', l: 'Por semana' }].map((v) => (
                    <button key={v.k} onClick={() => setVista(v.k)} className={`px-3 py-1.5 text-xs font-medium transition ${vista === v.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300'}`}>{v.l}</button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-brand-navy bg-brand-navy/5 px-2 py-1 dark:border-brand-gold dark:bg-brand-gold/10">
              <FileText size={16} strokeWidth={1.8} className="text-brand-gold" />
              <select
                value={rango.invoiceId || ''}
                onChange={(e) => { const id = e.target.value; if (id) setRango({ preset: 'factura', invoiceId: id, desde: '', hasta: '' }) }}
                className="max-w-[280px] rounded-lg bg-transparent px-1 py-1.5 text-sm text-slate-700 outline-none dark:text-slate-100"
                aria-label="Elegir una factura"
              >
                {invoices.map((inv) => {
                  const ciudad = inv.ciudadNombre || nombreCiudadDe(inv, inv.ciudad) || 'Sin ciudad'
                  const fechas = rangoDias(fmtDia(inv.fechaInicio), fmtDia(inv.fechaFin)) || inv.semana || 's/f'
                  return <option key={inv.id} value={inv.id}>{`${ciudad} · ${fechas} · ${fmtMonto(inv.ingresoTotal)}`}</option>
                })}
              </select>
            </div>
          )}
        </div>

        {/* 3) Refinar: ciudad + chofer + limpiar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Refinar:</span>
          <CitySelector />
          <DriverSelector />
          <button onClick={limpiar} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white" title="Volver a la última semana, todas las ciudades y todos los choferes">
            <Eraser size={13} strokeWidth={2} /> Limpiar
          </button>
        </div>
      </div>
    </div>
  )
}
