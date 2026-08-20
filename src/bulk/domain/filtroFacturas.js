// BULK · Dominio · Filtro de búsqueda de facturas / avisos de pago (lógica PURA).
// Se usa en el panel de admin (facturas a clientes / pagos a transportistas) y en
// los portales de cliente y transportista. NO altera el listado; solo lo reduce
// a los documentos que coinciden con los criterios. La búsqueda es case-insensitive
// y "contiene" (substring), para que sea rápida y tolerante.
//
// Criterios soportados (todos opcionales y COMBINABLES):
//   texto  → coincide con número de factura Y/O nombre (cliente/transportista)
//   monto  → coincide con el total (substring del número, p. ej. "150" ⊂ 1500.00)
//   desde  → fecha (yyyy-mm-dd) mínima de creación/envío
//   hasta  → fecha (yyyy-mm-dd) máxima de creación/envío
// `nombreKey` indica qué campo de nombre buscar (clienteNombre | carrierNombre).
// En los portales (cliente/transportista) NO se pasa nombre: el aislamiento por
// usuario ya lo imponen la consulta (where) y las reglas de Firestore; el texto
// solo busca por número.

export const FILTRO_FACTURAS_VACIO = { texto: '', monto: '', desde: '', hasta: '' }

// ¿Hay algún criterio activo? (para saber si mostrar "sin resultados" vs "sin facturas")
export function hayFiltroActivo(f) {
  if (!f) return false
  return !!((f.texto && f.texto.trim()) || (f.monto && f.monto.trim()) || f.desde || f.hasta)
}

const norm = (s) => String(s == null ? '' : s).toLowerCase().trim()
// Fecha representativa del documento para el filtro por rango: creación/envío (ts).
const fechaDoc = (d) => String(d?.ts || '').slice(0, 10)

// Filtra una lista de facturas/avisos por los criterios. `nombreKey` opcional.
export function filtrarFacturas(docs, f, { nombreKey } = {}) {
  if (!f || !hayFiltroActivo(f)) return docs || []
  const texto = norm(f.texto)
  const monto = norm(f.monto).replace(/[^0-9.]/g, '')
  const desde = f.desde || null
  const hasta = f.hasta || null
  return (docs || []).filter((d) => {
    if (texto) {
      const campos = [d.numero, nombreKey ? d[nombreKey] : null].filter(Boolean).map(norm).join(' ')
      if (!campos.includes(texto)) return false
    }
    if (monto) {
      if (!norm(d.total).includes(monto)) return false
    }
    if (desde || hasta) {
      const fecha = fechaDoc(d)
      if (!fecha) return false
      if (desde && fecha < desde) return false
      if (hasta && fecha > hasta) return false
    }
    return true
  })
}
