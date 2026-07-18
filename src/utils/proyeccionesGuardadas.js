// Historial de proyecciones guardadas. Se almacena en settings/{companyId} en el
// campo `proyecciones` (append atómico con arrayUnion; sin colección nueva ni cambios
// de reglas). Cada entrada guarda la CONFIGURACIÓN (ciudades, factura, %, precios
// editados) para poder recargarla, y un RESUMEN para mostrarla en la lista.
import { doc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../firebase'

export async function guardarProyeccion(companyId, entrada) {
  if (!companyId) return null
  const ent = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    ...entrada,
  }
  try {
    await updateDoc(doc(db, 'settings', companyId), { proyecciones: arrayUnion(ent) })
  } catch {
    try { await setDoc(doc(db, 'settings', companyId), { proyecciones: [ent] }, { merge: true }) } catch { /* noop */ }
  }
  return ent
}

export async function borrarProyeccion(companyId, todas, id) {
  if (!companyId) return
  const restantes = (todas || []).filter((p) => p.id !== id)
  await setDoc(doc(db, 'settings', companyId), { proyecciones: restantes }, { merge: true }).catch(() => {})
}
