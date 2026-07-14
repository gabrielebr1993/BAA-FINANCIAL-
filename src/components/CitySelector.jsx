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

  // Lista = ciudades CONFIGURADAS + las detectadas en las facturas. Se DEDUPLICA por
  // NOMBRE: si hay dos con el mismo nombre (ej. una configurada y otra detectada con
  // otro código), se deja SOLO la que tiene datos en la factura. Así no salen "dos
  // Dallas". Nombre siempre string (si falta, el código) para no romper el ordenado.
  const conDatos = new Set(ciudades) // códigos presentes en la factura del rango
  const porNombre = new Map() // nombre -> código elegido
  const considerar = (code, nombre) => {
    if (!code) return
    const nom = String(nombre || code).trim()
    const prev = porNombre.get(nom)
    if (!prev) { porNombre.set(nom, code); return }
    // Preferimos el código que SÍ tiene datos.
    if (conDatos.has(code) && !conDatos.has(prev)) porNombre.set(nom, code)
  }
  ;(ciudadesEmpresa || []).forEach((c) => { if (c && c.codigo) considerar(c.codigo, c.nombre) })
  ciudades.forEach((c) => considerar(c, nombreCiudadDe(facturaRango, c)))

  return (
    <Select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} aria-label="Filtro de ciudad">
      <option value={TODAS}>Todas las ciudades</option>
      {[...porNombre.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([nombre, code]) => (
        <option key={code} value={code}>{nombre}</option>
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
