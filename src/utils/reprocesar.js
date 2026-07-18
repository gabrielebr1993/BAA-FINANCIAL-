// Reproceso EXCLUSIVO del simulador: re-lee el Excel de una factura y le extrae el
// desglose por ruta×peso, guardándolo SOLO en el campo dedicado `simuladorDesglose`.
// NO toca pagos, ganancias, claims ni totales (ningún cálculo lee ese campo).
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { money } from './format'
import { procesarArchivo, combinarArchivos } from './excel'

// `inv` debe ser la factura CRUDA (con id, ingresoTotal, modoConfig). Devuelve
// { tipo:'ok'|'warn'|'error', txt, rp? }. Null si no hay archivos.
export async function reprocesarFactura(inv, files) {
  if (!inv?.id) return { tipo: 'error', txt: 'No hay una factura única seleccionada para reprocesar.' }
  const lista = [...(files || [])]
  if (!lista.length) return null
  const procs = []
  for (const f of lista) procs.push(procesarArchivo(await f.arrayBuffer(), f.name, inv.modoConfig || 'estandar'))
  const comb = combinarArchivos(procs)
  const rp = comb.simuladorDesglose || comb.resumenRutaPeso || []
  if (!rp.length) return { tipo: 'error', txt: 'El archivo no trae desglose por peso (o no es una factura válida de Gofo).' }
  const ref = Number(inv.ingresoTotal) || 0
  if (ref && Math.abs(comb.ingresoTotal - ref) / ref > 0.02) {
    return { tipo: 'warn', txt: `El total del archivo (${money(comb.ingresoTotal)}) no coincide con esta factura (${money(ref)}). Parece ser otro Excel — NO se guardó nada.` }
  }
  // SOLO se escribe el campo dedicado del simulador. Nada más cambia.
  await updateDoc(doc(db, 'invoices', inv.id), { simuladorDesglose: rp })
  return { tipo: 'ok', txt: `Desglose por peso extraído y guardado (el total no cambió: ${money(ref)}).`, rp }
}
