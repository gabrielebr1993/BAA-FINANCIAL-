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
