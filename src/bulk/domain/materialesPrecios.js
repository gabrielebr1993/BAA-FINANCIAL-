// ============================================================================
// BULK · Dominio · PRECIOS DE MATERIAL POR PLANTA — lógica pura.
// Un material puede ofrecerse en varias plantas con precio/config distintos:
//   material.precios = [{ plantaId, precio, unidad, disponible, notas }]
// COMPAT (sin migración): un material viejo con { plantaId, precio } únicos se
// lee como UNA fila; `precio` sin plantaId sigue siendo el precio general.
// ============================================================================

export function preciosDe(m) {
  if (Array.isArray(m?.precios) && m.precios.length) return m.precios
  if (m?.plantaId) return [{ plantaId: m.plantaId, precio: Number(m.precio) || 0, unidad: m.unidad || 'ton', disponible: true, notas: '', legado: true }]
  return []
}

// Plantas que ofrecen el material (filas disponibles).
export function plantasQueOfrecen(m) {
  return preciosDe(m).filter((p) => p.disponible !== false && p.plantaId)
}

// Precio del material EN una planta concreta. Prioridad: fila de esa planta →
// precio general del material (solo si el material no está atado a una planta).
export function precioMaterialEnPlanta(materiales, nombre, plantaId) {
  const clave = (s) => String(s || '').trim().toLowerCase()
  const m = (materiales || []).find((x) => clave(x.nombre) === clave(nombre))
  if (!m) return null
  const filas = preciosDe(m).filter((p) => p.disponible !== false)
  const fila = plantaId ? filas.find((p) => p.plantaId === plantaId) : null
  if (fila && Number(fila.precio) > 0) return { precio: Number(fila.precio), unidad: fila.unidad || m.unidad || 'ton', plantaId: fila.plantaId }
  if (!filas.length && Number(m.precio) > 0) return { precio: Number(m.precio), unidad: m.unidad || 'ton', plantaId: null }
  return null
}

// Precio POR VIAJE derivado del material+planta: unidad 'viaje' es directa; el
// resto ('ton', 'yd3', …) se multiplica por el tonelaje del viaje.
export function precioViajeMaterial(materiales, nombre, plantaId, ton) {
  const p = precioMaterialEnPlanta(materiales, nombre, plantaId)
  if (!p) return null
  const v = p.unidad === 'viaje' ? p.precio : p.precio * (Number(ton) || 0)
  return v > 0 ? Math.round(v * 100) / 100 : null
}
