// Acciones sobre claims (perdonar / quitar perdón). Compartidas por Claims y Pagos.
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
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
