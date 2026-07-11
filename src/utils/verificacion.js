// Guardado del perfil de VERIFICACIÓN del chofer + subida de documentos a Storage.
// Los documentos (licencia, W-9) van a Firebase Storage con reglas restringidas.
// NOTA: por decisión del dueño, este perfil puede incluir datos sensibles (SSN,
// cuenta/ruta bancaria). Solo dueño/súper-admin de la empresa acceden (reglas de
// Firestore). Alternativa más segura: gestionarlos solo en Stripe.
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage, auth } from '../firebase'

export const ESTADOS_VERIFICACION = [
  { key: 'pendiente', label: 'Pendiente', color: 'gold' },
  { key: 'aprobado', label: 'Aprobado', color: 'green' },
  { key: 'rechazado', label: 'Rechazado', color: 'red' },
]

// coleccion: 'drivers' (chofer) o 'managers' (gasto fijo). Guarda el perfil de
// verificación en el doc del registro correspondiente.
export async function guardarVerificacion(recordId, verificacion, revisor, coleccion = 'drivers') {
  if (!recordId) return
  await updateDoc(doc(db, coleccion, recordId), {
    verificacion: { ...verificacion, revisadoPor: revisor || verificacion.revisadoPor || '', revisadoEn: verificacion.estado ? serverTimestamp() : verificacion.revisadoEn || null },
    verificacionActualizada: serverTimestamp(),
  })
}

// Guarda la URL de la foto de perfil en el doc del registro (chofer/manager).
export async function guardarFotoRegistro(recordId, url, coleccion = 'drivers') {
  if (!recordId) return
  await updateDoc(doc(db, coleccion, recordId), { fotoUrl: url, 'verificacion.fotoUrl': url })
}

// El DUEÑO habilita (o bloquea) que el chofer actualice sus datos de pago desde su
// portal. Escribe con dot-path para NO pisar el resto de la verificación.
export async function habilitarEdicionDatos(recordId, permitir = true, coleccion = 'drivers') {
  if (!recordId) return
  await updateDoc(doc(db, coleccion, recordId), { 'verificacion.actualizacionSolicitada': !!permitir })
}

// El CHOFER sube su propio W-9 desde su portal (vía endpoint serverless con Admin
// SDK: no requiere abrir reglas al rol driver). Devuelve la URL guardada.
export async function subirW9Chofer(file) {
  if (!file) throw new Error('Falta el archivo.')
  if (file.size > 5 * 1024 * 1024) throw new Error('El archivo es muy grande (máx 5 MB).')
  const t = await auth.currentUser?.getIdToken()
  if (!t) throw new Error('Sesión no válida. Vuelve a iniciar sesión.')
  const fileBase64 = await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '')
    fr.onerror = () => reject(new Error('No se pudo leer el archivo'))
    fr.readAsDataURL(file)
  })
  const resp = await fetch('/api/driver-w9', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ fileBase64, fileName: file.name, mimeType: file.type }),
  })
  const d = await resp.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }))
  if (!d.ok) throw new Error(d.error || 'No se pudo subir el W-9.')
  return d.url
}

// Llama al endpoint de autoservicio del chofer (driver-w9) con la sesión actual.
async function llamarPortal(payload) {
  const t = await auth.currentUser?.getIdToken()
  if (!t) throw new Error('Sesión no válida. Vuelve a iniciar sesión.')
  const resp = await fetch('/api/driver-w9', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(payload),
  })
  const d = await resp.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }))
  if (!d.ok) throw new Error(d.error || 'No se pudo completar la operación.')
  return d
}

const aBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader()
  fr.onload = () => resolve(String(fr.result).split(',')[1] || '')
  fr.onerror = () => reject(new Error('No se pudo leer el archivo'))
  fr.readAsDataURL(file)
})

// Estado de verificación del chofer (para pintar su portal). No trae datos sensibles.
export async function estadoChoferPortal() {
  const d = await llamarPortal({ accion: 'estado' })
  return d.estado || {}
}

// El CHOFER guarda sus datos de pago (SSN + banco + dirección) desde su portal.
export async function guardarDatosBancariosChofer(datos) {
  await llamarPortal({ accion: 'datos', datos })
  return true
}

// El CHOFER firma su W-9 en la app (tipo DocuSign): el sistema lo rellena con sus
// datos guardados y solo se envía la imagen de la firma (PNG) + la fecha.
export async function firmarW9Chofer(firmaPngBase64, fecha) {
  const d = await llamarPortal({ accion: 'w9firmar', firmaPngBase64, fecha })
  return d.url
}

// El CHOFER sube su foto de perfil o su licencia desde su portal.
export async function subirFotoChofer(file) {
  if (!file) throw new Error('Falta la imagen.')
  if (file.size > 4 * 1024 * 1024) throw new Error('La imagen es muy grande (máx 4 MB).')
  const fileBase64 = await aBase64(file)
  const d = await llamarPortal({ accion: 'foto', fileBase64, fileName: file.name, mimeType: file.type })
  return d.url
}
export async function subirLicenciaChofer(file) {
  if (!file) throw new Error('Falta el archivo.')
  if (file.size > 5 * 1024 * 1024) throw new Error('El archivo es muy grande (máx 5 MB).')
  const fileBase64 = await aBase64(file)
  const d = await llamarPortal({ accion: 'licencia', fileBase64, fileName: file.name, mimeType: file.type })
  return d.url
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
