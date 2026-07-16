// Selectores de ciudad (MULTISELECCIÓN combinada), chofer y factura/semana.
import { useState, useRef, useEffect } from 'react'
import { MapPin, Check, ChevronDown } from 'lucide-react'
import { useData } from '../DataContext'
import { TODAS, TODOS, ciudadesDeFactura, nombreCiudadDe } from '../utils/calc'
import { Select } from './ui'

// Dropdown con casillas para elegir UNA o VARIAS ciudades (se ven combinadas).
export default function CitySelector() {
  const {
    facturaRangoFull, selectedCity, selectedCities, setSelectedCities,
    ciudadBloqueada, ciudadUsuario, ciudadesUsuario, ciudadesEmpresa,
  } = useData()
  const facturaRango = facturaRangoFull
  const ciudades = ciudadesDeFactura(facturaRango)
  const nombreDe = (code) => (ciudadesEmpresa || []).find((c) => c.codigo === code)?.nombre || nombreCiudadDe(facturaRango, code) || code

  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  // Usuario bloqueado a UNA sola ciudad: se muestra fija (no puede cambiarla).
  if (ciudadBloqueada) {
    const misCiudades = (ciudadesUsuario && ciudadesUsuario.length ? ciudadesUsuario : [ciudadUsuario]).filter(Boolean)
    if (misCiudades.length <= 1) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" title="Tu cuenta está asignada a esta ciudad">
          <MapPin size={15} strokeWidth={1.8} className="text-brand-gold" /> {nombreDe(misCiudades[0])}
        </span>
      )
    }
    // Varias ciudades propias: multiselección entre las SUYAS.
    return <MultiCiudad opciones={[...misCiudades].map((c) => [c, nombreDe(c)])} {...{ selectedCity, selectedCities, setSelectedCities, abierto, setAbierto, refEl: ref }} />
  }

  // Lista = ciudades CONFIGURADAS + detectadas en facturas, deduplicadas por NOMBRE.
  const conDatos = new Set(ciudades)
  const porNombre = new Map()
  const considerar = (code, nombre) => {
    if (!code) return
    const nom = String(nombre || code).trim()
    const prev = porNombre.get(nom)
    if (!prev) { porNombre.set(nom, code); return }
    if (conDatos.has(code) && !conDatos.has(prev)) porNombre.set(nom, code)
  }
  ;(ciudadesEmpresa || []).forEach((c) => { if (c && c.codigo) considerar(c.codigo, c.nombre) })
  ciudades.forEach((c) => considerar(c, nombreCiudadDe(facturaRango, c)))
  const opciones = [...porNombre.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([nombre, code]) => [code, nombre])

  return <MultiCiudad opciones={opciones} {...{ selectedCity, selectedCities, setSelectedCities, abierto, setAbierto, refEl: ref }} />
}

function MultiCiudad({ opciones, selectedCity, selectedCities, setSelectedCities, abierto, setAbierto, refEl }) {
  const subset = (selectedCities || []).length >= 2
  const seleccion = subset ? selectedCities : (selectedCity && selectedCity !== TODAS ? [selectedCity] : [])
  const selSet = new Set(seleccion)
  const nombrePorCode = new Map(opciones.map(([c, n]) => [c, n]))

  const toggle = (code) => {
    const s = new Set(seleccion)
    if (s.has(code)) s.delete(code); else s.add(code)
    setSelectedCities([...s])
  }
  const todas = () => { setSelectedCities([]); setAbierto(false) }

  const etiqueta = seleccion.length === 0
    ? 'Todas las ciudades'
    : seleccion.length === 1
      ? (nombrePorCode.get(seleccion[0]) || seleccion[0])
      : `${seleccion.length} ciudades`

  return (
    <div className="relative" ref={refEl}>
      <button
        type="button"
        onClick={() => setAbierto((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        aria-label="Filtro de ciudad"
      >
        <MapPin size={15} strokeWidth={1.8} className="text-brand-gold" />
        <span className="max-w-[160px] truncate">{etiqueta}</span>
        <ChevronDown size={15} strokeWidth={2} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="absolute left-0 z-30 mt-1 max-h-72 w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={todas}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${seleccion.length === 0 ? 'bg-brand-navy/5 font-semibold text-brand-navy dark:bg-brand-gold/10 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'}`}
          >
            Todas las ciudades
            {seleccion.length === 0 && <Check size={15} strokeWidth={2.4} className="text-brand-gold" />}
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />
          {opciones.map(([code, nombre]) => {
            const on = selSet.has(code)
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggle(code)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${on ? 'bg-brand-navy/5 font-semibold text-brand-navy dark:bg-brand-gold/10 dark:text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/50'}`}
              >
                <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded border ${on ? 'border-brand-gold bg-brand-gold text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="truncate">{nombre}</span>
              </button>
            )
          })}
          {seleccion.length >= 2 && (
            <div className="mt-1 border-t border-slate-100 px-2.5 pt-1.5 text-[11px] text-slate-400 dark:border-slate-700/60">Viendo {seleccion.length} ciudades combinadas (sumadas).</div>
          )}
        </div>
      )}
    </div>
  )
}

// Filtro de CHOFER (Refinar). Solo lista los choferes presentes en el período (y en
// la ciudad elegida). Acota todos los datos a ese chofer (ver DataContext).
export function DriverSelector() {
  const { facturaRangoFull, selectedCity, selectedDriver, setSelectedDriver } = useData()
  const choferes = (facturaRangoFull?.resumenChoferes || [])
    .filter((c) => selectedCity === TODAS || (c.ciudad || c.ubicacion) === selectedCity)
  const nombres = [...new Set(choferes.map((c) => c.nombre).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  if (nombres.length === 0 && (!selectedDriver || selectedDriver === TODOS)) return null
  return (
    <Select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} aria-label="Filtro de chofer">
      <option value={TODOS}>Todos los choferes</option>
      {nombres.map((n) => (<option key={n} value={n}>{n}</option>))}
    </Select>
  )
}

export function InvoiceSelector() {
  const { invoices, selectedInvoiceId, setSelectedInvoiceId } = useData()
  if (invoices.length === 0) return null
  return (
    <Select value={selectedInvoiceId || ''} onChange={(e) => setSelectedInvoiceId(e.target.value)} aria-label="Selector de semana">
      {invoices.map((inv) => (
        <option key={inv.id} value={inv.id}>
          {inv.semana || inv.archivoNombre || inv.id}
        </option>
      ))}
    </Select>
  )
}
