// ---------------------------------------------------------------------------
// Borrado en cascada de una factura y TODO lo que cuelga de ella.
//
// La factura guarda los AGREGADOS (resumen por chofer/ruta/ciudad) dentro del
// propio documento `invoices/{id}`; NO existen documentos individuales por
// paquete (los ~101k paquetes solo viven en memoria al procesar el .xlsx). Por
// eso lo único que hay que borrar además del doc de factura son sus colecciones
// hijas: claims, payroll y driverStats (una fila por chofer/semana).
//
// Rendimiento: se recogen todas las refs y se borran con writeBatch en lotes de
// 450, ejecutando varios lotes EN PARALELO por olas (no todos a la vez, para no
// saturar). Todas las queries acotan por companyId + invoiceId, tanto para ser
// eficientes como para cumplir las reglas de seguridad (una query de lista debe
// estar acotada por empresa).
// ---------------------------------------------------------------------------
import { collection, getDocs, query, where, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

const CHUNK = 450 // máx. 500 por batch de Firestore; dejamos margen
const OLAS = 5 // lotes en paralelo por ola

// Colecciones hijas de una factura (todas llevan companyId + invoiceId).
const HIJAS = ['claims', 'payroll', 'driverStats']

// Borra la factura y sus hijas. `onProgress(hechos, total)` se llama para pintar
// una barra/contador. Devuelve el total de documentos borrados.
export async function eliminarFacturaCascada(companyId, invoiceId, onProgress) {
  if (!companyId || !invoiceId) throw new Error('Faltan datos para eliminar (empresa o factura).')

  // 1) Reunir refs de las hijas en paralelo (acotando por empresa + factura).
  const snaps = await Promise.all(
    HIJAS.map((col) =>
      getDocs(query(collection(db, col), where('companyId', '==', companyId), where('invoiceId', '==', invoiceId)))
    )
  )
  const refs = snaps.flatMap((s) => s.docs.map((d) => d.ref))
  refs.push(doc(db, 'invoices', invoiceId)) // el doc de la factura al final

  const total = refs.length
  let hechos = 0
  onProgress?.(0, total)

  // 2) Partir en lotes de 450.
  const lotes = []
  for (let i = 0; i < refs.length; i += CHUNK) lotes.push(refs.slice(i, i + CHUNK))

  // 3) Ejecutar los lotes en olas de OLAS en paralelo.
  for (let i = 0; i < lotes.length; i += OLAS) {
    const ola = lotes.slice(i, i + OLAS)
    await Promise.all(
      ola.map((grupo) => {
        const batch = writeBatch(db)
        grupo.forEach((r) => batch.delete(r))
        return batch.commit().then(() => {
          hechos += grupo.length
          onProgress?.(hechos, total)
        })
      })
    )
  }

  return total
}

// Borra una lista de refs cualesquiera en lotes de 450 ejecutados en paralelo por
// olas. `onProgress(hechos, total)` para pintar progreso. Reutilizable (p. ej. al
// eliminar una empresa entera, que junta refs de varias colecciones).
export async function borrarRefsEnLotes(refs, onProgress) {
  const total = refs.length
  let hechos = 0
  onProgress?.(0, total)
  const lotes = []
  for (let i = 0; i < refs.length; i += CHUNK) lotes.push(refs.slice(i, i + CHUNK))
  for (let i = 0; i < lotes.length; i += OLAS) {
    const ola = lotes.slice(i, i + OLAS)
    await Promise.all(
      ola.map((grupo) => {
        const batch = writeBatch(db)
        grupo.forEach((r) => batch.delete(r))
        return batch.commit().then(() => {
          hechos += grupo.length
          onProgress?.(hechos, total)
        })
      })
    )
  }
  return total
}
