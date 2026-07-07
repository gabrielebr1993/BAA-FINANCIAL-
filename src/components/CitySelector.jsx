// Selectores de ciudad y de factura/semana (siempre visibles).
import { useData } from '../DataContext'
import { TODAS, ciudadesDeFactura, nombreCiudadDe } from '../utils/calc'
import { Select } from './ui'

export default function CitySelector() {
  const { selectedInvoice, selectedCity, setSelectedCity } = useData()
  const ciudades = ciudadesDeFactura(selectedInvoice)
  return (
    <Select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} aria-label="Filtro de ciudad">
      <option value={TODAS}>Todas las ciudades</option>
      {ciudades.map((c) => (
        <option key={c} value={c}>
          {nombreCiudadDe(selectedInvoice, c)}
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
