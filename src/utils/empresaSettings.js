// Ajustes por empresa guardados en settings/{companyId} (aislado por companyId).
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Ciudades propias de la empresa: [{ nombre, codigo }].
// Se incluye companyId para cumplir las reglas de seguridad de Firestore.
export async function guardarCiudadesEmpresa(cid, ciudades) {
  if (!cid) return
  await setDoc(doc(db, 'settings', cid), { companyId: cid, ciudades: ciudades || [], actualizadoEn: serverTimestamp() }, { merge: true })
}

// Marca el onboarding como completado (o lo reabre).
export async function setOnboardingCompleto(cid, valor) {
  if (!cid) return
  await setDoc(doc(db, 'settings', cid), { companyId: cid, onboardingCompleto: !!valor, actualizadoEn: serverTimestamp() }, { merge: true })
}
