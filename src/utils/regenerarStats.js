// ============================================================================
// Regenera los driverStats (la "foto" que ve el portal del chofer) de UNA
// factura ya guardada, usando las TARIFAS ACTUALES de los perfiles.
//
// Pagos/Financiero/Dashboard ya calculan en vivo con la tarifa vigente; lo
// único congelado al importar es driverStats. Este recálculo lo sincroniza:
// mismo motor (calcularPagos), misma agregación por chofer y mismos ids de
// documento ({invoiceId}__{driverKey}), así que sobreescribe la foto anterior
// sin duplicar nada. Sirve para Gofo y para SpeedX.
// ============================================================================
import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { calcularPagos, promediosFlota, calificarChofer, TODAS } from './calc'
import { conFechas } from './rango'
import { carrierDe } from '../carriers/index'

const keyDe = (n) => (n || '').trim().toLowerCase()

export async function regenerarDriverStats(inv, claimsTodos, drivers, companyId) {
  if (!inv?.id) throw new Error('Factura inválida.')
  // Claims de ESTA factura: la copia embebida (respaldo fiel del guardado) o,
  // si no existe, los de la colección filtrados por invoiceId.
  const claimsInv = (inv.claimsData && inv.claimsData.length)
    ? inv.claimsData
    : (claimsTodos || []).filter((c) => c.invoiceId === inv.id)

  const pagos = calcularPagos(inv, claimsInv, drivers, TODAS)
  // Agregación por chofer (mismo criterio que el importador): un chofer con
  // varias ciudades = UNA fila sumada; su ciudad es donde entrega más.
  const SUMAR = ['individuales', 'dobles', 'ingreso', 'claimsTotales', 'claimsActivos', 'claimsPerdonados', 'descuentoClaims', 'descontadoGofo', 'totalPagar', 'ganancia', 'gananciaClaims', 'fallidos']
  const porDriver = {}
  for (const p of pagos) {
    const key = keyDe(p.nombre)
    const pq = (p.individuales || 0) + (p.dobles || 0)
    if (!porDriver[key]) {
      porDriver[key] = { ...p, _pqPrincipal: pq }
    } else {
      const t = porDriver[key]
      SUMAR.forEach((k) => { t[k] = (t[k] || 0) + (p[k] || 0) })
      if (!t.tarifaInd && p.tarifaInd) t.tarifaInd = p.tarifaInd
      if (!t.tarifaDoble && p.tarifaDoble) t.tarifaDoble = p.tarifaDoble
      if (pq > t._pqPrincipal) { t._pqPrincipal = pq; t.ciudad = p.ciudad; t.nombreCiudad = p.nombreCiudad }
    }
  }
  const pagosPorChofer = Object.values(porDriver)
  const prom = promediosFlota(pagosPorChofer)
  const f = conFechas(inv)
  const fechaInicioISO = f?.fechaInicio instanceof Date ? f.fechaInicio.toISOString() : ''
  const carrier = carrierDe(inv)

  const chunk = 400
  for (let i = 0; i < pagosPorChofer.length; i += chunk) {
    const batch = writeBatch(db)
    for (const p of pagosPorChofer.slice(i, i + chunk)) {
      const key = keyDe(p.nombre)
      const paquetes = (p.individuales || 0) + (p.dobles || 0)
      const calif = calificarChofer({ ...p, paquetes }, prom)
      const sref = doc(db, 'driverStats', `${inv.id}__${key.replace(/[^a-z0-9]+/g, '_').slice(0, 80)}`)
      batch.set(sref, {
        companyId,
        ...(carrier !== 'gofo' ? { carrier } : {}),
        invoiceId: inv.id,
        semana: inv.semana || '',
        fechaInicioISO,
        driverNombre: p.nombre,
        driverKey: key,
        ciudad: p.ciudad || '',
        individuales: p.individuales,
        dobles: p.dobles,
        paquetes,
        fallidos: p.fallidos || 0,
        ingreso: p.ingreso,
        tarifaInd: p.tarifaInd,
        tarifaDoble: p.tarifaDoble,
        claimsTotales: p.claimsTotales,
        claimsActivos: p.claimsActivos,
        claimsPerdonados: p.claimsPerdonados,
        descuentoClaims: p.descuentoClaims,
        descontadoGofo: p.descontadoGofo,
        totalPagar: p.totalPagar,
        ganancia: p.ganancia,
        recalculadoEn: new Date().toISOString(),
        calificacion: { puntaje: calif.puntaje, estrellas: calif.estrellas, nivel: calif.nivel, etiqueta: calif.etiqueta, desglose: calif.desglose },
      })
    }
    await batch.commit()
  }
  return pagosPorChofer.length
}
