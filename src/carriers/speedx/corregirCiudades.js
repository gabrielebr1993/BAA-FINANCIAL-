// ============================================================================
// SPEEDX · Corrección de CIUDAD en facturas ya guardadas.
//
// Las facturas viejas guardaron la ciudad desde el POE (el hub de entrada,
// p. ej. ATL), igual para todo. La ciudad REAL de reparto se toma, en orden:
//   1) del nombre del FLEET guardado en la factura ("CHS - B&J…" → CHS), o
//   2) de la ciudad REGISTRADA de sus choferes (respaldo, por si la factura no
//      guardó el fleet).
// Luego se reescribe en la factura, sus choferes/rutas/ciudades, claims y
// driverStats — sin volver a subir el archivo. Nunca se cambia una ciudad sin
// tener un reemplazo concreto (si no hay fuente, se deja como está y se reporta).
// ============================================================================
import { collection, query, where, getDocs, writeBatch, doc, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { nombreCiudad } from '../../constants'

const norm = (n) => (n || '').trim().toLowerCase()
const codigoFleet = (s) => (String(s ?? '').split('-')[0] || '').trim().toUpperCase()
// Códigos que son HUB de entrada (no ciudad de reparto): no sirven como destino.
const HUBS = new Set(['ATL', 'SPX', ''])

// Ciudad destino de una factura: 1º el fleet; 2º la ciudad mayoritaria de sus
// choferes registrados (solo si es una ciudad real, no un hub).
export function ciudadDestino(inv, drivers) {
  const porFleet = codigoFleet(inv.fleet)
  if (porFleet && !HUBS.has(porFleet)) return porFleet
  const conteo = {}
  for (const ch of inv.resumenChoferes || []) {
    const d = (drivers || []).find((x) => norm(x.nombre) === norm(ch.nombre))
    const c = String(d?.ciudad || '').trim().toUpperCase()
    if (c && !HUBS.has(c)) conteo[c] = (conteo[c] || 0) + ((ch.individuales || 0) + (ch.dobles || 0) || 1)
  }
  return Object.keys(conteo).sort((a, b) => conteo[b] - conteo[a])[0] || ''
}

// ¿Esta factura SpeedX necesita corrección? (tiene un destino real distinto al actual)
export function necesitaCorreccion(inv, drivers) {
  if (inv.carrier !== 'speedx' || inv.provisional) return false
  const code = ciudadDestino(inv, drivers)
  return !!code && String(inv.ciudad || '').toUpperCase() !== code
}

export async function corregirCiudadesSpeedX(companyId, invoices, drivers, onProgreso) {
  const speedx = (invoices || []).filter((i) => i.carrier === 'speedx' && !i.provisional)
  let revisadas = 0, corregidas = 0, sinDato = 0
  for (const inv of speedx) {
    revisadas++
    onProgreso?.(revisadas, speedx.length)
    const code = ciudadDestino(inv, drivers)
    if (!code) { sinDato++; continue }
    if (String(inv.ciudad || '').toUpperCase() === code) continue // ya está bien

    const nombre = nombreCiudad(code)
    const resumenChoferes = (inv.resumenChoferes || []).map((c) => ({ ...c, ciudad: code, nombreCiudad: nombre }))
    const resumenRutas = (inv.resumenRutas || []).map((r) => ({ ...r, ciudad: code }))
    const resumenChoferRuta = (inv.resumenChoferRuta || []).map((r) => ({ ...r, ciudad: code }))
    const claimsData = (inv.claimsData || []).map((c) => ({ ...c, ciudad: code }))
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
  return { revisadas, corregidas, sinDato }
}
