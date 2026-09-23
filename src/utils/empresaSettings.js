// Ajustes por empresa guardados en settings/{companyId} (aislado por companyId).
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// Ciudades propias de la empresa: [{ nombre, codigo }].
// Se incluye companyId para cumplir las reglas de seguridad de Firestore.
// Multi-Company: cada carrier tiene SU catálogo de ciudades (las de SpeedX no
// son las de Gofo). Gofo usa el campo histórico `ciudades` (sin migraciones);
// los demás carriers guardan en `ciudades_<carrier>` del mismo doc de settings.
export async function guardarCiudadesEmpresa(cid, ciudades, carrier = 'gofo') {
  if (!cid) return
  const campo = !carrier || carrier === 'gofo' ? 'ciudades' : `ciudades_${carrier}`
  await setDoc(doc(db, 'settings', cid), { companyId: cid, [campo]: ciudades || [], actualizadoEn: serverTimestamp() }, { merge: true })
}

// Marca el onboarding como completado (o lo reabre).
export async function setOnboardingCompleto(cid, valor) {
  if (!cid) return
  await setDoc(doc(db, 'settings', cid), { companyId: cid, onboardingCompleto: !!valor, actualizadoEn: serverTimestamp() }, { merge: true })
}

// Reglas de cálculo: default de empresa { claimFee, dobleMonto } y overrides por
// ciudad { [codigoCiudad]: { claimFee?, dobleMonto? } }. Valores vacíos = heredar.
export async function guardarReglasEmpresa(cid, reglas, reglasCiudad) {
  if (!cid) return
  await setDoc(doc(db, 'settings', cid), { companyId: cid, reglas: reglas || {}, reglasCiudad: reglasCiudad || {}, actualizadoEn: serverTimestamp() }, { merge: true })
}

// Modo de configuración de reglas: 'estandar' (por ciudad) o 'ruta' (por ruta).
export async function guardarModoConfig(cid, modoConfig) {
  if (!cid) return
  await setDoc(doc(db, 'settings', cid), { companyId: cid, modoConfig: modoConfig || 'estandar', actualizadoEn: serverTimestamp() }, { merge: true })
}

// Reglas por RUTA (modo 'ruta'): { [rutaCode]: { nombre, tarifaInd, tarifaDoble,
// dobleMonto, claimFee, metodos:{cat->M}, montos:{cat->$} } }.
export async function guardarReglasRuta(cid, reglasRuta) {
  if (!cid) return
  await setDoc(doc(db, 'settings', cid), { companyId: cid, reglasRuta: reglasRuta || {}, actualizadoEn: serverTimestamp() }, { merge: true })
}
