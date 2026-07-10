// Guardado del perfil de VERIFICACIÓN del chofer + subida de documentos a Storage.
// Los documentos (licencia, W-9) van a Firebase Storage con reglas restringidas.
// NUNCA se guardan números de cuenta bancaria (eso lo maneja Stripe).
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'

export const ESTADOS_VERIFICACION = [
  { key: 'pendiente', label: 'Pendiente', color: 'gold' },
  { key: 'aprobado', label: 'Aprobado', color: 'green' },
  { key: 'rechazado', label: 'Rechazado', color: 'red' },
]

export async function guardarVerificacion(driverId, verificacion, revisor) {
  if (!driverId) return
  await updateDoc(doc(db, 'drivers', driverId), {
    verificacion: { ...verificacion, revisadoPor: revisor || verificacion.revisadoPor || '', revisadoEn: verificacion.estado ? serverTimestamp() : verificacion.revisadoEn || null },
    verificacionActualizada: serverTimestamp(),
  })
}

// Sube un documento del chofer a Storage y devuelve su URL de descarga.
// Ruta: verificacion/{companyId}/{driverId}/{tipo}-{timestamp}-{nombreArchivo}
export async function subirDocumento(companyId, driverId, tipo, file) {
  if (!companyId || !driverId || !file) throw new Error('Faltan datos para subir el documento.')
  const safe = (file.name || 'doc').replace(/[^\w.\-]+/g, '_').slice(-60)
  const path = `verificacion/${companyId}/${driverId}/${tipo}-${safe}`
  const r = ref(storage, path)
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' })
  return getDownloadURL(r)
}
