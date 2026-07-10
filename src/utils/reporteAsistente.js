// Genera y DESCARGA un reporte (Excel/PDF) para una sección, a partir de los
// datos ya cargados (facturaRango + claims + drivers). Lo usa JARVIS cuando pides
// "genera el reporte de pagos", etc. Reutiliza las utilidades de exportación.
import { exportarExcel, exportarPDF } from './exportar'
import { calcularPagos } from './calc'
import { nombreCiudad } from '../constants'

const money = (n) => Math.round((Number(n) || 0) * 100) / 100

// Devuelve { hojaNombre, rows, head, body, titulo } según la sección.
function armar(seccion, inv, claims, drivers, ciudad) {
  switch (seccion) {
    case 'pagos': {
      const filas = calcularPagos(inv, claims, drivers, ciudad)
      return {
        titulo: 'Pagos a choferes',
        rows: filas.map((f) => ({ Chofer: f.nombre, Ciudad: f.nombreCiudad, Individuales: f.individuales, Dobles: f.dobles, Ingreso: money(f.ingreso), 'Total a pagar': money(f.totalPagar), Ganancia: money(f.ganancia), Claims: f.claimsActivos, Fallidos: f.fallidos })),
        head: ['Chofer', 'Ciudad', 'Ind.', 'Dobles', 'Ingreso', 'Pagar', 'Ganancia', 'Claims', 'Fallidos'],
        body: filas.map((f) => [f.nombre, f.nombreCiudad, f.individuales, f.dobles, money(f.ingreso), money(f.totalPagar), money(f.ganancia), f.claimsActivos, f.fallidos]),
      }
    }
    case 'performance': {
      const filas = calcularPagos(inv, claims, drivers, ciudad)
      return {
        titulo: 'Rendimiento de choferes',
        rows: filas.map((f) => ({ Chofer: f.nombre, Ciudad: f.nombreCiudad, Paquetes: f.individuales + f.dobles, Ingreso: money(f.ingreso), Ganancia: money(f.ganancia), Claims: f.claimsActivos, Fallidos: f.fallidos, '% Fallidos': money((f.pctFallidos || 0) * 100) })),
        head: ['Chofer', 'Ciudad', 'Paquetes', 'Ingreso', 'Ganancia', 'Claims', 'Fallidos', '% Fall.'],
        body: filas.map((f) => [f.nombre, f.nombreCiudad, f.individuales + f.dobles, money(f.ingreso), money(f.ganancia), f.claimsActivos, f.fallidos, money((f.pctFallidos || 0) * 100)]),
      }
    }
    case 'choferes': {
      const list = drivers || []
      return {
        titulo: 'Choferes y tarifas',
        rows: list.map((d) => ({ Chofer: d.nombre, 'Tarifa ind.': money(d.tarifa ?? d.rate ?? 0), 'Tarifa doble': money(d.tarifaDoble ?? 0), Stripe: d.stripeEstado || 'sin_registrar', Verificación: d.verificacion?.estado || 'pendiente' })),
        head: ['Chofer', 'Tarifa ind.', 'Tarifa doble', 'Stripe', 'Verificación'],
        body: list.map((d) => [d.nombre, money(d.tarifa ?? d.rate ?? 0), money(d.tarifaDoble ?? 0), d.stripeEstado || 'sin_registrar', d.verificacion?.estado || 'pendiente']),
      }
    }
    case 'rutas': {
      const list = (inv.resumenRutas || []).slice().sort((a, b) => (b.ingreso || 0) - (a.ingreso || 0))
      return {
        titulo: 'Rutas',
        rows: list.map((r) => ({ Ruta: r.ruta, Ciudad: r.nombreCiudad || nombreCiudad(r.ciudad), Paquetes: r.paquetes || 0, Ingreso: money(r.ingreso), '$/paquete': money(r.precioPorPaquete || (r.paquetes ? r.ingreso / r.paquetes : 0)) })),
        head: ['Ruta', 'Ciudad', 'Paquetes', 'Ingreso', '$/paquete'],
        body: list.map((r) => [r.ruta, r.nombreCiudad || nombreCiudad(r.ciudad), r.paquetes || 0, money(r.ingreso), money(r.precioPorPaquete || (r.paquetes ? r.ingreso / r.paquetes : 0))]),
      }
    }
    // dashboard / financiero → resumen por ciudad
    default: {
      const list = inv.resumenCiudades || []
      return {
        titulo: seccion === 'financiero' ? 'Financiero (por ciudad)' : 'Resumen por ciudad',
        rows: list.map((c) => ({ Ciudad: c.nombreCiudad || nombreCiudad(c.ubicacion), Paquetes: c.paquetes || 0, Ingreso: money(c.ingreso), Choferes: c.numChoferes || 0, Rutas: c.numRutas || 0, Claims: c.numClaims || 0 })),
        head: ['Ciudad', 'Paquetes', 'Ingreso', 'Choferes', 'Rutas', 'Claims'],
        body: list.map((c) => [c.nombreCiudad || nombreCiudad(c.ubicacion), c.paquetes || 0, money(c.ingreso), c.numChoferes || 0, c.numRutas || 0, c.numClaims || 0]),
      }
    }
  }
}

// Genera y descarga. ctx = { facturaRango, claims, drivers, selectedCity }.
export async function generarReporteAsistente(seccion, formato, ctx) {
  const inv = ctx?.facturaRango
  if (!inv) throw new Error('No hay datos en el rango seleccionado. Carga o selecciona una semana con facturas.')
  const sec = seccion || 'dashboard'
  const { titulo, rows, head, body } = armar(sec, inv, ctx.claims || [], ctx.drivers || [], ctx.selectedCity)
  if (!rows.length) throw new Error('No hay filas para exportar en “' + titulo + '”.')
  const semana = inv.semana || 'rango'
  const base = `reporte-${sec}-${String(semana).replace(/[^\w-]+/g, '_')}`
  if (formato === 'pdf') {
    await exportarPDF(base, titulo, semana, [{ titulo, head, body }])
  } else {
    exportarExcel(base, [{ nombre: titulo.slice(0, 28), rows }])
  }
  return { titulo, formato: formato === 'pdf' ? 'PDF' : 'Excel', filas: rows.length }
}
