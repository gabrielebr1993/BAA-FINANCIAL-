// Selectores de ciudad y de factura/semana (siempre visibles).
import { MapPin } from 'lucide-react'
import { useData } from '../DataContext'
import { TODAS, ciudadesDeFactura, nombreCiudadDe } from '../utils/calc'
import { Select } from './ui'

export default function CitySelector() {
  // El filtro de ciudad se basa en el RANGO de fechas seleccionado (facturaRango),
  // así solo aparecen las ciudades presentes en esos días y la info corresponde a ellos.
  const { facturaRango, selectedCity, setSelectedCity, ciudadBloqueada, ciudadUsuario, ciudadesEmpresa } = useData()
  const ciudades = ciudadesDeFactura(facturaRango)

  // Usuario bloqueado a su ciudad: no puede cambiarla; se muestra fija.
  if (ciudadBloqueada) {
    const nom = (ciudadesEmpresa || []).find((c) => c.codigo === ciudadUsuario)?.nombre
      || nombreCiudadDe(facturaRango, ciudadUsuario) || ciudadUsuario
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" title="Tu cuenta está asignada a esta ciudad">
        <MapPin size={15} strokeWidth={1.8} className="text-brand-gold" /> {nom}
      </span>
    )
  }

  return (
    <Select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} aria-label="Filtro de ciudad">
      <option value={TODAS}>Todas las ciudades</option>
      {ciudades.map((c) => (
        <option key={c} value={c}>
          {nombreCiudadDe(facturaRango, c)}
        </option>
      ))}
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
