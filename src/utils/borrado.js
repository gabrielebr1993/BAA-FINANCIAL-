// ---------------------------------------------------------------------------
// Borrado en cascada de una factura y TODO lo que cuelga de ella.
//
// La factura guarda los AGREGADOS (resumen por chofer/ruta/ciudad) dentro del
// propio documento `invoices/{id}`; NO existen documentos individuales por
// paquete (los ~101k paquetes solo viven en memoria al procesar el .xlsx). Por
// eso lo único que hay que borrar además del doc de factura son sus colecciones
// hijas: claims, payroll y driverStats (una fila por chofer/semana).
//
// Rendimiento (clave para no tardar minutos):
//   - El total se obtiene con getCountFromServer (agregación en el servidor: 1
//     lectura barata por colección, NO descarga los documentos).
//   - El borrado es en STREAMING: se leen páginas de 450 con limit() y se borran
//     con writeBatch a medida que llegan, sin cargar 100k refs en memoria y
//     mostrando progreso desde el primer lote.
//   - Las 3 colecciones hijas se borran EN PARALELO.
// Todas las queries acotan por companyId + invoiceId (eficiencia + reglas de
// seguridad: una query de lista debe estar acotada por empresa).
// ---------------------------------------------------------------------------
import { collection, getDocs, getCountFromServer, query, where, limit, doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

const CHUNK = 450 // máx. 500 por batch de Firestore; dejamos margen

// Colecciones hijas de una factura (todas llevan companyId + invoiceId).
const HIJAS = ['claims', 'payroll', 'driverStats']

// Cuenta cuántos documentos hijos tiene la factura, con agregación en el servidor
// (barato: no descarga los documentos). Si el count falla, devuelve 0 (la barra
// funciona igual, solo sin total exacto).
async function contarHijas(companyId, invoiceId) {
  const counts = await Promise.all(
    HIJAS.map(async (col) => {
      try {
        const s = await getCountFromServer(
          query(collection(db, col), where('companyId', '==', companyId), where('invoiceId', '==', invoiceId))
        )
        return s.data().count
      } catch {
        return 0
      }
    })
  )
  return counts.reduce((a, b) => a + b, 0)
}

// Borra en STREAMING una colección hija: lee una página de CHUNK, la borra en un
// batch, y repite hasta vaciar. No acumula refs en memoria. `onLote(n)` reporta
// cuántos borró en cada vuelta.
async function borrarColeccionStream(col, companyId, invoiceId, onLote) {
  const q = query(
    collection(db, col),
    where('companyId', '==', companyId),
    where('invoiceId', '==', invoiceId),
    limit(CHUNK)
  )
  // Se vuelve a ejecutar la misma query en cada vuelta: como ya borramos lo leído,
  // la siguiente página son documentos distintos (patrón estándar de borrado masivo).
  for (;;) {
    const snap = await getDocs(q)
    if (snap.empty) break
    const batch = writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    onLote?.(snap.size)
    if (snap.size < CHUNK) break
  }
}

// Borra la factura y sus hijas. `onProgress(hechos, total)` se llama para pintar
// una barra/contador. Devuelve el total de documentos borrados.
export async function eliminarFacturaCascada(companyId, invoiceId, onProgress) {
  if (!companyId || !invoiceId) throw new Error('Faltan datos para eliminar (empresa o factura).')

  // 1) Total aproximado (hijas + el propio doc de factura) para la barra de progreso.
  const totalHijas = await contarHijas(companyId, invoiceId)
  const total = totalHijas + 1
  let hechos = 0
  onProgress?.(0, total)

  // 2) Borrar las 3 colecciones hijas EN PARALELO, en streaming.
  await Promise.all(
    HIJAS.map((col) =>
      borrarColeccionStream(col, companyId, invoiceId, (n) => {
        hechos += n
        onProgress?.(Math.min(hechos, totalHijas), total)
      })
    )
  )

  // 3) Borrar el documento de la factura.
  const batch = writeBatch(db)
  batch.delete(doc(db, 'invoices', invoiceId))
  await batch.commit()
  onProgress?.(total, total)

  return total
}

// Borra una lista de refs cualesquiera en lotes de 450 ejecutados en paralelo por
// olas. `onProgress(hechos, total)` para pintar progreso. Reutilizable (p. ej. al
// eliminar una empresa entera, que junta refs de varias colecciones).
const OLAS = 5 // lotes en paralelo por ola
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
