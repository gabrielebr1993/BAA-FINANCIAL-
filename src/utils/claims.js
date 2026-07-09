// Acciones sobre claims (perdonar / quitar perdón / revisión de repetidos).
import { doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export async function perdonarClaim(claim, motivo, perfil) {
  await updateDoc(doc(db, 'claims', claim.id), {
    perdonado: true,
    motivo: motivo || '',
    perdonadoPor: perfil?.nombre || perfil?.email || '',
    perdonadoEn: serverTimestamp(),
  })
}

export async function quitarPerdon(claim) {
  await updateDoc(doc(db, 'claims', claim.id), {
    perdonado: false,
    motivo: '',
    perdonadoPor: '',
    perdonadoEn: null,
  })
}

// Perdona VARIOS claims a la vez con un mismo motivo. Cada claim conserva su
// propio montoGofo (la pérdida absorbida es el monto real de cada uno).
export async function perdonarVarios(claimsArr, motivo, perfil) {
  const lista = (claimsArr || []).filter((c) => c?.id && !c.perdonado)
  const chunk = 450
  for (let i = 0; i < lista.length; i += chunk) {
    const batch = writeBatch(db)
    for (const c of lista.slice(i, i + chunk)) {
      batch.update(doc(db, 'claims', c.id), {
        perdonado: true,
        motivo: motivo || '',
        perdonadoPor: perfil?.nombre || perfil?.email || '',
        perdonadoEn: serverTimestamp(),
      })
    }
    await batch.commit()
  }
  return lista.length
}

// Quita el perdón a VARIOS claims a la vez.
export async function quitarPerdonVarios(claimsArr) {
  const lista = (claimsArr || []).filter((c) => c?.id && c.perdonado)
  const chunk = 450
  for (let i = 0; i < lista.length; i += chunk) {
    const batch = writeBatch(db)
    for (const c of lista.slice(i, i + chunk)) {
      batch.update(doc(db, 'claims', c.id), { perdonado: false, motivo: '', perdonadoPor: '', perdonadoEn: null })
    }
    await batch.commit()
  }
  return lista.length
}

// Define MANUALMENTE el método de cobro (M1/M2/M3) de un claim, sobrescribiendo el
// que resuelven las reglas. `metodo` null/'' o 'auto' quita el override (vuelve a
// resolverse por ciudad/categoría o por ruta).
export async function cambiarMetodoClaim(claim, metodo) {
  const val = metodo === 'M1' || metodo === 'M2' || metodo === 'M3' ? metodo : null
  await updateDoc(doc(db, 'claims', claim.id), { metodo: val, metodoManual: !!val })
}

// Igual que el anterior pero para VARIOS claims a la vez.
export async function cambiarMetodoVarios(claimsArr, metodo) {
  const val = metodo === 'M1' || metodo === 'M2' || metodo === 'M3' ? metodo : null
  const lista = (claimsArr || []).filter((c) => c?.id)
  const chunk = 450
  for (let i = 0; i < lista.length; i += chunk) {
    const batch = writeBatch(db)
    for (const c of lista.slice(i, i + chunk)) batch.update(doc(db, 'claims', c.id), { metodo: val, metodoManual: !!val })
    await batch.commit()
  }
  return lista.length
}

// Guarda la decisión de un caso de claim repetido en TODOS sus claims.
// decision: 'aprobado' (cuenta, cobra $100) | 'anulado' (no cuenta, no cobra).
export async function decidirClaimRepetido(claimsDelCaso, decision, perfil) {
  const batch = writeBatch(db)
  for (const c of claimsDelCaso || []) {
    if (!c.id) continue
    batch.update(doc(db, 'claims', c.id), {
      estadoRevision: decision,
      revisadoPor: perfil?.nombre || perfil?.email || '',
      revisadoEn: serverTimestamp(),
    })
  }
  await batch.commit()
}
