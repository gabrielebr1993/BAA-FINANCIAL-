// Selector de ciudad (arriba de cada página). Usa las ciudades de la factura
// seleccionada + la opción "Todas las ciudades" (combinado).
import { useData } from '../DataContext'
import { TODAS, ciudadesDeFactura } from '../utils/calc'
import { nombreCiudad, COLORS } from '../constants'

export default function CitySelector() {
  const { selectedInvoice, selectedCity, setSelectedCity } = useData()
  const ciudades = ciudadesDeFactura(selectedInvoice)
  return (
    <select
      value={selectedCity}
      onChange={(e) => setSelectedCity(e.target.value)}
      style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, background: '#fff', color: COLORS.navy }}
    >
      <option value={TODAS}>🌎 Todas las ciudades</option>
      {ciudades.map((c) => (
        <option key={c} value={c}>
          {nombreCiudad(c)}
        </option>
      ))}
    </select>
  )
}

// Selector de factura/semana.
export function InvoiceSelector() {
  const { invoices, selectedInvoiceId, setSelectedInvoiceId } = useData()
  if (invoices.length === 0) return null
  return (
    <select
      value={selectedInvoiceId || ''}
      onChange={(e) => setSelectedInvoiceId(e.target.value)}
      style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, background: '#fff', color: COLORS.navy }}
    >
      {invoices.map((inv) => (
        <option key={inv.id} value={inv.id}>
          📅 {inv.semana || inv.archivoNombre || inv.id}
        </option>
      ))}
    </select>
  )
}
