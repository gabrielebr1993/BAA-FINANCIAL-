// ============================================================================
// SPEEDX · Corrección de CIUDAD en facturas ya guardadas.
//
// Las facturas viejas guardaron la ciudad desde el POE (el hub de entrada,
// p. ej. ATL), igual para todo. La ciudad REAL de reparto está en el nombre
// del FLEET ("CHS - B&J…" → CHS, "MYR - …" → MYR), que SÍ quedó guardado en
// cada factura. Esto re-deriva la ciudad desde ese fleet y la reescribe en la
// factura, sus choferes/rutas/ciudades, claims y driverStats — sin tener que
// volver a subir el archivo.
//
// Nota: cada factura guarda UN fleet, así que una factura de UNA sola ciudad
// queda exacta. Si un mismo archivo mezcló dos ciudades, para ese caso lo
// correcto es volver a subirlo (el detalle por paquete ya no está guardado).
// ============================================================================
import { collection, query, where, getDocs, writeBatch, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { nombreCiudad } from '../../constants'

// Código de ciudad desde el nombre del fleet ("CHS - B&J…" → "CHS").
const codigoFleet = (s) => (String(s ?? '').split('-')[0] || '').trim().toUpperCase()

export async function corregirCiudadesSpeedX(companyId, invoices, onProgreso) {
  // Solo facturas OFICIALES de SpeedX (los provisionales del reporte manual no
  // guardan resumen por ciudad y se recalculan al conciliar).
  const speedx = (invoices || []).filter((i) => i.carrier === 'speedx' && !i.provisional)
  let revisadas = 0, corregidas = 0, sinFleet = 0
  for (const inv of speedx) {
    revisadas++
    onProgreso?.(revisadas, speedx.length)
    const code = codigoFleet(inv.fleet)
    if (!code) { sinFleet++; continue }
    if (String(inv.ciudad || '').toUpperCase() === code) continue // ya está bien

    const nombre = nombreCiudad(code)
    const resumenChoferes = (inv.resumenChoferes || []).map((c) => ({ ...c, ciudad: code, nombreCiudad: nombre }))
    const resumenRutas = (inv.resumenRutas || []).map((r) => ({ ...r, ciudad: code }))
    const resumenChoferRuta = (inv.resumenChoferRuta || []).map((r) => ({ ...r, ciudad: code }))
    const claimsData = (inv.claimsData || []).map((c) => ({ ...c, ciudad: code }))
    // resumenCiudades: colapsa todas las entradas en la ciudad real (suma montos).
    const resumenCiudades = (() => {
      const base = inv.resumenCiudades || []
      if (!base.length) return base
      const acc = { ubicacion: code, nombreCiudad: nombre, paquetes: 0, individuales: 0, dobles: 0, ingreso: 0, numClaims: 0, numChoferes: 0, numRutas: 0 }
      for (const c of base) {
        acc.paquetes += c.paquetes || 0
        acc.individuales += c.individuales || 0
        acc.dobles += c.dobles || 0
        acc.ingreso += c.ingreso || 0
        acc.numClaims += c.numClaims || 0
        acc.numChoferes = Math.max(acc.numChoferes, c.numChoferes || 0)
        acc.numRutas += c.numRutas || 0
      }
      return [acc]
    })()

    await updateDoc(doc(db, 'invoices', inv.id), {
      ciudad: code,
      ciudadNombre: nombre,
      ciudadesMap: { [code]: code },
      resumenChoferes,
      resumenRutas,
      resumenChoferRuta,
      resumenCiudades,
      ...(inv.claimsData ? { claimsData } : {}),
    })

    // Claims y driverStats de ESTA factura (en sus propias colecciones).
    for (const colName of ['claims', 'driverStats']) {
      const snap = await getDocs(query(collection(db, colName), where('companyId', '==', companyId), where('invoiceId', '==', inv.id)))
      let batch = writeBatch(db), n = 0
      for (const d of snap.docs) {
        batch.update(d.ref, { ciudad: code })
        n++
        if (n % 450 === 0) { await batch.commit(); batch = writeBatch(db) }
      }
      if (n % 450 !== 0 && n > 0) await batch.commit()
    }
    corregidas++
  }
  return { revisadas, corregidas, sinFleet }
}
