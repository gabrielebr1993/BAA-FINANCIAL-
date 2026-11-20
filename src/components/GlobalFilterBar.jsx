// Barra de filtros GLOBAL con jerarquía clara (vive en el Layout → afecta a toda la app):
//   1) "Mostrando: …" — siempre visible, dice exactamente qué datos se ven.
//   2) Selector PRINCIPAL — toggle "Por período" ↔ "Una factura" (excluyentes: activar
//      uno desactiva el otro; internamente es un solo estado rango.preset).
//   3) "Refinar:" — Ciudad + Chofer (opcionales, se aplican sobre lo elegido arriba) +
//      "Limpiar".
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, Search, FileText, CalendarRange, Eraser, ChevronDown, Check, MapPin, SlidersHorizontal } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { PRESETS } from '../utils/rango'
import { TODAS, TODOS, nombreCiudadDe } from '../utils/calc'
import { useLang, tDirecto } from '../i18n'
import CitySelector, { DriverSelector } from './CitySelector'

const ATAJOS = PRESETS.filter((p) => p.key !== 'personalizado')
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtDia = (d) => (d instanceof Date && !isNaN(d) ? `${d.getDate()} ${tDirecto(MESES[d.getMonth()])}` : '')
const fmtISO = (s) => { if (!s) return ''; const p = s.split('-'); return `${parseInt(p[2], 10)} ${tDirecto(MESES[parseInt(p[1], 10) - 1])}` }
const rangoDias = (a, b) => (a && b ? (a === b ? a : `${a}–${b}`) : (a || b || ''))
const fmtMonto = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`

export default function GlobalFilterBar() {
  const { t } = useLang()
  const {
    rango, setRango, invoices, invoicesRango, numSemanas, vista, setVista,
    selectedCity, setSelectedCity, selectedCities, setSelectedCities, selectedDriver, setSelectedDriver,
    facturaRangoFull, ciudadBloqueada,
  } = useData()
  // Facturas elegidas a mano (multiselección): array de ids con respaldo a la única.
  const facturaIds = Array.isArray(rango.invoiceIds) && rango.invoiceIds.length ? rango.invoiceIds : (rango.invoiceId ? [rango.invoiceId] : [])

  // El SELECTOR de facturas respeta el filtro de ciudad SOLO POR CÓDIGO (la
  // identidad real de la ciudad). Antes también emparejaba por NOMBRE, y eso
  // cruzaba ciudades distintas con nombres parecidos (p. ej. "Chicago-ORD01" y
  // "Chicago-ORD02" tras renombrar en Gofo): al elegir una salían las dos. Con
  // códigos únicos, el código basta y cada ciudad queda aislada.
  const filtroCiu = (selectedCities && selectedCities.length)
    ? selectedCities
    : (selectedCity && selectedCity !== TODAS ? [selectedCity] : null)
  const normC = (s) => String(s || '').trim().toLowerCase()
  const selKeysCiu = new Set((filtroCiu || []).map((c) => normC(c)).filter(Boolean))
  const clavesFac = (inv) => {
    const ks = []
    if (inv.ciudad) ks.push(normC(inv.ciudad))
    ;(inv.resumenCiudades || []).forEach((c) => { if (c.ubicacion) ks.push(normC(c.ubicacion)) })
    return ks.filter(Boolean)
  }
  // Facturas de la CIUDAD seleccionada (match ESTRICTO por código). El selector de
  // "Una factura" muestra SOLO estas — antes también dejaba la factura ya elegida
  // aunque fuera de otra ciudad, y por eso al elegir Austin seguía saliendo Chicago.
  const invoicesSelector = filtroCiu
    ? invoices.filter((inv) => clavesFac(inv).some((k) => selKeysCiu.has(k)))
    : invoices
  const selKeysCiuKey = [...selKeysCiu].sort().join('|')
  const invSelIds = invoicesSelector.map((i) => i.id).join(',')

  // SOLO el rol "manager" queda restringido a "Una factura" (no "Por período").
  // Owner, admin y súper-admin conservan ambos modos SIEMPRE.
  const { perfil, esSuperAdmin } = useAuth()
  const soloFactura = !esSuperAdmin && perfil?.role === 'manager'
  // Ver el MONTO (ingreso) de la factura: solo owner/admin/súper-admin. Al manager se
  // le oculta para que no pueda deducir la ganancia (ingreso − lo que paga).
  const verMonto = esSuperAdmin || perfil?.role === 'owner' || perfil?.role === 'admin'

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
  // Hoja de filtros del iPhone (bottom sheet de vidrio).
  const [hoja, setHoja] = useState(false)
  useEffect(() => { if (rango.preset === 'personalizado') setAbrirPers(true) }, [rango.preset])

  const irPeriodo = () => { if (modo !== 'periodo') setRango({ preset: ultimoPreset.current || 'ultima', desde: '', hasta: '' }) }
  const irFactura = () => {
    if (modo === 'factura') return
    // Se elige una factura DE LA CIUDAD seleccionada (invoicesSelector ya está
    // filtrado por código). Antes se tomaba invoices[0] de cualquier ciudad, y por
    // eso "Una factura" parecía no hacer nada (quedaba en una ciudad distinta a la
    // elegida). Respaldo: cualquier factura si no hay ninguna de esa ciudad.
    const cand = invoicesSelector.length ? invoicesSelector : invoices
    const id = rango.invoiceId && cand.some((i) => i.id === rango.invoiceId)
      ? rango.invoiceId
      : (cand[0]?.id || invoices[0]?.id || '')
    if (id) setRango({ preset: 'factura', invoiceId: id, desde: '', hasta: '' })
  }
  // Manager: forzar modo "Una factura" (elige la más reciente si venía en período).
  useEffect(() => {
    if (!soloFactura || modo === 'factura') return
    const id = rango.invoiceId && invoices.some((i) => i.id === rango.invoiceId) ? rango.invoiceId : (invoices[0]?.id || '')
    if (id) setRango({ preset: 'factura', invoiceId: id, desde: '', hasta: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloFactura, modo, invoices])
  // Al CAMBIAR de ciudad estando en "Una factura": si la(s) factura(s) elegida(s)
  // NO son de la ciudad seleccionada, se cambian por una de esa ciudad (o se deja la
  // que sí corresponde). Así elegir Austin deja de mostrar la factura de Chicago.
  useEffect(() => {
    if (modo !== 'factura' || !filtroCiu) return
    const idsCiudad = new Set(invoicesSelector.map((i) => i.id))
    const vigentes = facturaIds.filter((id) => idsCiudad.has(id))
    if (vigentes.length === facturaIds.length && vigentes.length > 0) return // ya están todas en la ciudad
    const nuevos = vigentes.length ? vigentes : (invoicesSelector[0]?.id ? [invoicesSelector[0].id] : [])
    if (nuevos.length === 0) return // no hay facturas de esa ciudad: no se toca
    setRango({ preset: 'factura', invoiceIds: nuevos, invoiceId: nuevos[0], desde: '', hasta: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, selKeysCiuKey, invSelIds])
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
    if (!ciudadBloqueada) { setSelectedCity(TODAS); setSelectedCities([]) }
    setSelectedDriver(TODOS)
  }

  // ---- indicador "Mostrando: …" ----
  const facturaSel = modo === 'factura' && facturaIds.length === 1 ? invoices.find((i) => i.id === facturaIds[0]) : null
  let periodoLabel
  if (modo === 'factura') {
    periodoLabel = facturaIds.length > 1
      ? `${facturaIds.length} ${t('facturas')}`
      : facturaSel ? `${t('Factura')} ${rangoDias(fmtDia(facturaSel.fechaInicio), fmtDia(facturaSel.fechaFin)) || facturaSel.semana || ''}` : t('Una factura')
  } else if (rango.preset === 'personalizado' && (rango.desde || rango.hasta)) {
    periodoLabel = `${fmtISO(rango.desde) || '…'}–${fmtISO(rango.hasta) || '…'}`
  } else {
    periodoLabel = t((PRESETS.find((p) => p.key === rango.preset) || {}).label || 'Última semana')
  }
  const ciudadLabel = (selectedCities && selectedCities.length >= 2)
    ? `${selectedCities.length} ${t('ciudades')}`
    : selectedCity === TODAS ? t('Todas las ciudades') : (nombreCiudadDe(facturaRangoFull, selectedCity) || selectedCity)
  const hayChofer = selectedDriver && selectedDriver !== TODOS
  const varias = numSemanas > 1

  const seg = (activo) => `rounded-pill px-3 py-1.5 text-sm font-semibold transition ${activo ? 'lg-pill-on text-white dark:text-brand-navy' : 'text-slate-600 hover:text-brand-navy dark:text-slate-300 dark:hover:text-white'}`
  const chip = (activo) => `rounded-full px-3 py-1.5 text-xs font-medium transition ${activo ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-white/70 text-slate-600 ring-1 ring-slate-200/70 hover:bg-white dark:bg-slate-700/50 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-700'}`
  const inputCls = 'rounded-lg bg-transparent px-1 py-1.5 text-sm text-slate-700 outline-none dark:text-slate-100'

  // Filtros activos (para la burbuja del botón en el móvil).
  const numActivos = (rango.preset !== 'ultima' ? 1 : 0) + (selectedCity !== TODAS || (selectedCities && selectedCities.length) ? 1 : 0) + (hayChofer ? 1 : 0)

  const controles = (
    <>
        {/* 2) Selector principal (período ↔ factura, excluyentes). El manager solo ve
            "Una factura". */}
        <div className="flex flex-wrap items-center gap-2">
          {soloFactura ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-brand-navy dark:border-slate-700 dark:bg-slate-800 dark:text-white"><FileText size={14} strokeWidth={1.9} className="text-brand-gold" /> {t('Una factura')}</span>
          ) : (
            <>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('¿Qué quieres ver?')}</span>
              <div className="lg-glass inline-flex items-center gap-0.5 rounded-pill p-0.5">
                <button onClick={irPeriodo} className={seg(modo === 'periodo')} aria-pressed={modo === 'periodo'}>📅 {t('Por período')}</button>
                <button onClick={irFactura} className={seg(modo === 'factura')} aria-pressed={modo === 'factura'} disabled={invoices.length === 0}>📄 {t('Una factura')}</button>
              </div>
            </>
          )}

          {(modo === 'periodo' && !soloFactura) ? (
            <div className="flex flex-wrap items-center gap-1">
              {ATAJOS.map((p) => (
                <button key={p.key} onClick={() => setPreset(p.key)} className={chip(rango.preset === p.key)}>{t(p.label)}</button>
              ))}
              <button onClick={() => setAbrirPers((o) => !o)} className={chip(abrirPers || rango.preset === 'personalizado')}>
                <span className="inline-flex items-center gap-1"><CalendarRange size={13} strokeWidth={2} /> {t('Personalizado')}</span>
              </button>
              {varias && (
                <div className="ml-1 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  {[{ k: 'combinado', l: t('Combinado') }, { k: 'porSemana', l: t('Por semana') }].map((v) => (
                    <button key={v.k} onClick={() => setVista(v.k)} className={`px-3 py-1.5 text-xs font-medium transition ${vista === v.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300'}`}>{v.l}</button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <FacturaMultiSelect invoices={invoicesSelector} facturaIds={facturaIds} verMonto={verMonto} onChange={(ids) => setRango({ preset: 'factura', invoiceIds: ids, invoiceId: ids[0] || '', desde: '', hasta: '' })} />
          )}
        </div>

        {/* Fila propia para el rango PERSONALIZADO (así se ve completo, sin scroll). */}
        {modo === 'periodo' && !soloFactura && abrirPers && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
            <Calendar size={16} strokeWidth={1.8} className="text-slate-400" />
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('Desde')}</span>
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label={t('Desde')} />
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('Hasta')}</span>
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label={t('Hasta')} />
            <button onClick={buscar} disabled={!desde && !hasta} className="ml-1 inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-brand-gold dark:text-brand-navy">
              <Search size={13} strokeWidth={2.2} /> {t('Buscar')}
            </button>
          </div>
        )}

        {/* 3) Refinar: ciudad + chofer + limpiar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('Refinar:')}</span>
          <CitySelector />
          <DriverSelector />
          <button onClick={limpiar} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white" title={t('Volver a la última semana, todas las ciudades y todos los choferes')}>
            <Eraser size={13} strokeWidth={2} /> {t('Limpiar')}
          </button>
        </div>
    </>
  )

  return (
    <>
      {/* WEB / TABLET (≥ sm): la barra completa de siempre, con acabado de vidrio. */}
      <div className="scroll-thin hidden overflow-x-auto border-t border-white/40 px-4 py-2.5 dark:border-white/5 sm:block">
        <div className="flex min-w-max flex-col gap-2">
          {/* 1) Mostrando */}
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="text-slate-400 dark:text-slate-500">{t('Mostrando:')}</span>
          <span className="font-semibold text-brand-navy dark:text-white">{periodoLabel}</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="text-slate-600 dark:text-slate-300">{ciudadLabel}</span>
          {hayChofer && (<><span className="text-slate-300 dark:text-slate-600">·</span><span className="text-slate-600 dark:text-slate-300">{selectedDriver}</span></>)}
        </div>

        {/* 2) Selector principal (período ↔ factura, excluyentes). El manager solo ve
              "Una factura". */}
          <div className="flex flex-wrap items-center gap-2">
            {soloFactura ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-brand-navy dark:border-slate-700 dark:bg-slate-800 dark:text-white"><FileText size={14} strokeWidth={1.9} className="text-brand-gold" /> {t('Una factura')}</span>
            ) : (
              <>
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('¿Qué quieres ver?')}</span>
                <div className="lg-glass inline-flex items-center gap-0.5 rounded-pill p-0.5">
                  <button onClick={irPeriodo} className={seg(modo === 'periodo')} aria-pressed={modo === 'periodo'}>📅 {t('Por período')}</button>
                  <button onClick={irFactura} className={seg(modo === 'factura')} aria-pressed={modo === 'factura'} disabled={invoices.length === 0}>📄 {t('Una factura')}</button>
                </div>
              </>
            )}

            {(modo === 'periodo' && !soloFactura) ? (
              <div className="flex flex-wrap items-center gap-1">
                {ATAJOS.map((p) => (
                  <button key={p.key} onClick={() => setPreset(p.key)} className={chip(rango.preset === p.key)}>{t(p.label)}</button>
                ))}
                <button onClick={() => setAbrirPers((o) => !o)} className={chip(abrirPers || rango.preset === 'personalizado')}>
                  <span className="inline-flex items-center gap-1"><CalendarRange size={13} strokeWidth={2} /> {t('Personalizado')}</span>
                </button>
                {varias && (
                  <div className="ml-1 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    {[{ k: 'combinado', l: t('Combinado') }, { k: 'porSemana', l: t('Por semana') }].map((v) => (
                      <button key={v.k} onClick={() => setVista(v.k)} className={`px-3 py-1.5 text-xs font-medium transition ${vista === v.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300'}`}>{v.l}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <FacturaMultiSelect invoices={invoicesSelector} facturaIds={facturaIds} verMonto={verMonto} onChange={(ids) => setRango({ preset: 'factura', invoiceIds: ids, invoiceId: ids[0] || '', desde: '', hasta: '' })} />
            )}
          </div>

          {/* Fila propia para el rango PERSONALIZADO (así se ve completo, sin scroll). */}
          {modo === 'periodo' && !soloFactura && abrirPers && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
              <Calendar size={16} strokeWidth={1.8} className="text-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('Desde')}</span>
              <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label={t('Desde')} />
              <span className="text-xs text-slate-500 dark:text-slate-400">{t('Hasta')}</span>
              <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label={t('Hasta')} />
              <button onClick={buscar} disabled={!desde && !hasta} className="ml-1 inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-brand-gold dark:text-brand-navy">
                <Search size={13} strokeWidth={2.2} /> {t('Buscar')}
              </button>
            </div>
          )}

          {/* 3) Refinar: ciudad + chofer + limpiar */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('Refinar:')}</span>
            <CitySelector />
            <DriverSelector />
            <button onClick={limpiar} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white" title={t('Volver a la última semana, todas las ciudades y todos los choferes')}>
              <Eraser size={13} strokeWidth={2} /> {t('Limpiar')}
            </button>
          </div>
        </div>
      </div>

      {/* iPHONE (< sm): una sola fila de pastillas de vidrio con lo que estás viendo.
          Al tocarla se abre la HOJA de filtros desde abajo (estilo iOS). */}
      <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2.5 pt-1 sm:hidden">
        <button type="button" onClick={() => setHoja(true)} className="lg-glass inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-semibold text-brand-navy dark:text-white">
          <CalendarRange size={15} strokeWidth={2} className="text-brand-gold" /> {periodoLabel}
        </button>
        <button type="button" onClick={() => setHoja(true)} className="lg-glass inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-medium text-slate-700 dark:text-slate-200">
          <MapPin size={15} strokeWidth={2} className="text-brand-gold" /> <span className="max-w-[9.5rem] truncate">{ciudadLabel}</span>
        </button>
        {hayChofer && (
          <button type="button" onClick={() => setHoja(true)} className="lg-glass inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-medium text-slate-700 dark:text-slate-200">
            <span className="max-w-[8rem] truncate">{selectedDriver}</span>
          </button>
        )}
        <button type="button" onClick={() => setHoja(true)} aria-label={t('Refinar:')} className="lg-glass relative ml-auto grid h-10 w-10 shrink-0 place-items-center rounded-pill text-brand-navy dark:text-white">
          <SlidersHorizontal size={17} strokeWidth={2} />
          {numActivos > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-gold px-1 text-[10px] font-bold text-brand-navy">{numActivos}</span>}
        </button>
      </div>

      {hoja && createPortal(
        <div className="fixed inset-0 z-[60] sm:hidden" role="dialog" aria-modal="true" aria-label={t('Mostrando:')}>
          <div className="absolute inset-0 bg-slate-900/25" onClick={() => setHoja(false)} />
          <div className="lg-glass lg-hoja absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[28px] px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-2">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-400/50" aria-hidden="true" />
            <div className="mb-3 flex items-center gap-2">
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="text-slate-500 dark:text-slate-400">{t('Mostrando:')}</div>
                <div className="truncate font-semibold text-brand-navy dark:text-white">{periodoLabel} · {ciudadLabel}{hayChofer ? ` · ${selectedDriver}` : ''}</div>
              </div>
              <button type="button" onClick={() => setHoja(false)} className="lg-pill-on min-h-[40px] rounded-pill px-4 text-sm font-bold text-brand-gold dark:text-brand-navy">{t('Listo')}</button>
            </div>
            <div className="lg-hoja-cuerpo flex flex-col gap-3 rounded-[22px] bg-white/80 p-3 dark:bg-slate-900/50">
        {/* 2) Selector principal (período ↔ factura, excluyentes). El manager solo ve
                  "Una factura". */}
              <div className="flex flex-wrap items-center gap-2">
                {soloFactura ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-brand-navy dark:border-slate-700 dark:bg-slate-800 dark:text-white"><FileText size={14} strokeWidth={1.9} className="text-brand-gold" /> {t('Una factura')}</span>
                ) : (
                  <>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('¿Qué quieres ver?')}</span>
                    <div className="lg-glass inline-flex items-center gap-0.5 rounded-pill p-0.5">
                      <button onClick={irPeriodo} className={seg(modo === 'periodo')} aria-pressed={modo === 'periodo'}>📅 {t('Por período')}</button>
                      <button onClick={irFactura} className={seg(modo === 'factura')} aria-pressed={modo === 'factura'} disabled={invoices.length === 0}>📄 {t('Una factura')}</button>
                    </div>
                  </>
                )}

                {(modo === 'periodo' && !soloFactura) ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {ATAJOS.map((p) => (
                      <button key={p.key} onClick={() => setPreset(p.key)} className={chip(rango.preset === p.key)}>{t(p.label)}</button>
                    ))}
                    <button onClick={() => setAbrirPers((o) => !o)} className={chip(abrirPers || rango.preset === 'personalizado')}>
                      <span className="inline-flex items-center gap-1"><CalendarRange size={13} strokeWidth={2} /> {t('Personalizado')}</span>
                    </button>
                    {varias && (
                      <div className="ml-1 inline-flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                        {[{ k: 'combinado', l: t('Combinado') }, { k: 'porSemana', l: t('Por semana') }].map((v) => (
                          <button key={v.k} onClick={() => setVista(v.k)} className={`px-3 py-1.5 text-xs font-medium transition ${vista === v.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300'}`}>{v.l}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <FacturaMultiSelect invoices={invoicesSelector} facturaIds={facturaIds} verMonto={verMonto} onChange={(ids) => setRango({ preset: 'factura', invoiceIds: ids, invoiceId: ids[0] || '', desde: '', hasta: '' })} />
                )}
              </div>

              {/* Fila propia para el rango PERSONALIZADO (así se ve completo, sin scroll). */}
              {modo === 'periodo' && !soloFactura && abrirPers && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                  <Calendar size={16} strokeWidth={1.8} className="text-slate-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t('Desde')}</span>
                  <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label={t('Desde')} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t('Hasta')}</span>
                  <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} className={inputCls} aria-label={t('Hasta')} />
                  <button onClick={buscar} disabled={!desde && !hasta} className="ml-1 inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-brand-gold dark:text-brand-navy">
                    <Search size={13} strokeWidth={2.2} /> {t('Buscar')}
                  </button>
                </div>
              )}

              {/* 3) Refinar: ciudad + chofer + limpiar */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{t('Refinar:')}</span>
                <CitySelector />
                <DriverSelector />
                <button onClick={limpiar} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white" title={t('Volver a la última semana, todas las ciudades y todos los choferes')}>
                  <Eraser size={13} strokeWidth={2} /> {t('Limpiar')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// Selector de UNA o VARIAS facturas (se ven combinadas/sumadas). Cada ciudad es una
// factura aparte, así que aquí puedes juntar, por ej., Houston 1 + Houston 2 de la
// misma semana. Al menos una factura queda siempre elegida.
function FacturaMultiSelect({ invoices, facturaIds, verMonto, onChange }) {
  const { t } = useLang()
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const toggle = () => {
    if (abierto) return setAbierto(false)
    const r = btnRef.current.getBoundingClientRect()
    const ancho = 320
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)), ancho })
    setAbierto(true)
  }
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return; setAbierto(false) }
    const cerrar = () => setAbierto(false)
    document.addEventListener('mousedown', fuera)
    window.addEventListener('resize', cerrar)
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('resize', cerrar) }
  }, [abierto])

  const sel = new Set(facturaIds)
  const etiquetaDe = (inv) => {
    const ciudad = inv.ciudadNombre || nombreCiudadDe(inv, inv.ciudad) || t('Sin ciudad')
    const fechas = rangoDias(fmtDia(inv.fechaInicio), fmtDia(inv.fechaFin)) || inv.semana || t('s/f')
    return verMonto ? `${ciudad} · ${fechas} · ${fmtMonto(inv.ingresoTotal)}` : `${ciudad} · ${fechas}`
  }
  const label = facturaIds.length > 1
    ? `${facturaIds.length} ${t('facturas combinadas')}`
    : (() => { const inv = invoices.find((i) => i.id === facturaIds[0]); return inv ? etiquetaDe(inv) : t('Elegir factura') })()

  const toggleFactura = (id) => {
    const s = new Set(facturaIds)
    if (s.has(id)) { if (s.size === 1) return; s.delete(id) } else s.add(id)
    onChange([...s])
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 rounded-xl border border-brand-navy bg-brand-navy/5 px-2.5 py-1.5 text-sm text-slate-700 dark:border-brand-gold dark:bg-brand-gold/10 dark:text-slate-100"
        aria-label={t('Elegir una o varias facturas')}
        aria-expanded={abierto}
      >
        <FileText size={16} strokeWidth={1.8} className="text-brand-gold" />
        <span className="max-w-[280px] truncate">{label}</span>
        <ChevronDown size={15} strokeWidth={2} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.ancho, zIndex: 80 }}
          className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          {invoices.map((inv) => {
            const on = sel.has(inv.id)
            return (
              <button
                key={inv.id}
                type="button"
                onClick={() => toggleFactura(inv.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${on ? 'bg-brand-navy/5 font-semibold text-brand-navy dark:bg-brand-gold/10 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'}`}
              >
                <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded border ${on ? 'border-brand-gold bg-brand-gold text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="truncate">{etiquetaDe(inv)}</span>
              </button>
            )
          })}
          {facturaIds.length >= 2 && (
            <div className="mt-1 border-t border-slate-100 px-2.5 pt-1.5 text-[11px] text-slate-400 dark:border-slate-700/60">{t('Viendo')} {facturaIds.length} {t('facturas combinadas (sumadas).')}</div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
