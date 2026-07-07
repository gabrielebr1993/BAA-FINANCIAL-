// Persistencia en Firestore del estado de cada alerta: 'resuelta' | 'descartada'.
// Un doc por (empresa, alerta) en la colección `alertEstados`, con id determinista
// para poder sobreescribir sin duplicar.
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

// El id de alerta puede traer ':' o '/'; lo saneamos para usarlo como docId.
const docId = (cid, alertId) => `${cid}__${String(alertId).replace(/[/:]/g, '_')}`

// Carga el mapa { alertId: estado } de la empresa.
export async function cargarEstadosAlertas(cid) {
  if (!cid) return {}
  try {
    const snap = await getDocs(query(collection(db, 'alertEstados'), where('companyId', '==', cid)))
    const map = {}
    snap.docs.forEach((d) => {
      const data = d.data()
      if (data.alertId) map[data.alertId] = data.estado
    })
    return map
  } catch {
    return {}
  }
}

// Marca una alerta con un estado ('resuelta' | 'descartada').
export async function guardarEstadoAlerta(cid, alertId, estado) {
  if (!cid || !alertId) return
  await setDoc(doc(db, 'alertEstados', docId(cid, alertId)), {
    companyId: cid,
    alertId,
    estado,
    actualizado: new Date().toISOString(),
  })
}

// Quita el estado (la alerta vuelve a estar activa).
export async function borrarEstadoAlerta(cid, alertId) {
  if (!cid || !alertId) return
  await deleteDoc(doc(db, 'alertEstados', docId(cid, alertId))).catch(() => {})
}
