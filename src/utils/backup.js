// ---------------------------------------------------------------------------
// Respaldo (backup) y restauración de los datos de UNA empresa.
//   - generarBackup: lee todas las colecciones acotadas por companyId → objeto JSON.
//   - descargarBackup: baja ese JSON como archivo (copia offline).
//   - subirBackupStorage: sube el JSON a Firebase Storage (backup automático).
//   - restaurarBackup: reescribe los documentos del backup con MERGE (solo agrega/
//     repone; NUNCA borra datos actuales).
// Las marcas de tiempo (Timestamp) se serializan como {__ts,__ns} y se reconstruyen
// al restaurar, para no perder los tipos de fecha.
// ---------------------------------------------------------------------------
import { collection, getDocs, query, where, writeBatch, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { ref, uploadString, listAll, getMetadata, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'

// Colecciones que pertenecen a una empresa (todas llevan companyId).
export const COLECCIONES_BACKUP = ['invoices', 'drivers', 'claims', 'payroll', 'driverStats', 'managers', 'alertEstados', 'settings']

function ser(v) {
  if (v && typeof v.toDate === 'function' && typeof v.seconds === 'number') return { __ts: v.seconds, __ns: v.nanoseconds || 0 }
  if (Array.isArray(v)) return v.map(ser)
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = ser(v[k]); return o }
  return v
}
function deser(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, '__ts')) return new Timestamp(v.__ts, v.__ns || 0)
  if (Array.isArray(v)) return v.map(deser)
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = deser(v[k]); return o }
  return v
}

export function totalDocsBackup(data) {
  return Object.values(data?.colecciones || {}).reduce((a, arr) => a + (arr?.length || 0), 0)
}

// Genera el objeto de backup completo de la empresa.
export async function generarBackup(companyId) {
  if (!companyId) throw new Error('No hay empresa activa.')
  const data = { version: 1, companyId, fecha: new Date().toISOString(), colecciones: {} }
  for (const col of COLECCIONES_BACKUP) {
    try {
      const snap = await getDocs(query(collection(db, col), where('companyId', '==', companyId)))
      data.colecciones[col] = snap.docs.map((d) => ({ id: d.id, ...ser(d.data()) }))
    } catch {
      data.colecciones[col] = []
    }
  }
  return data
}

// Descarga el backup como archivo JSON.
export async function descargarBackup(companyId) {
  const data = await generarBackup(companyId)
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `milepay-backup-${companyId}-${data.fecha.slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return { total: totalDocsBackup(data), fecha: data.fecha }
}

// Sube el backup a Firebase Storage: backups/{companyId}/{YYYY-MM-DD}.json
export async function subirBackupStorage(companyId) {
  const data = await generarBackup(companyId)
  const path = `backups/${companyId}/${data.fecha.slice(0, 10)}.json`
  await uploadString(ref(storage, path), JSON.stringify(data), 'raw', { contentType: 'application/json' })
  // Deja constancia de la fecha del último backup en settings (para el intervalo).
  await setDoc(doc(db, 'settings', companyId), { companyId, ultimoBackupAuto: serverTimestamp(), ultimoBackupPath: path }, { merge: true }).catch(() => {})
  return { path, fecha: data.fecha, total: totalDocsBackup(data) }
}

// Lista el HISTORIAL de backups en la nube (Storage) de la empresa, más reciente
// primero. Devuelve [{ name, path, url, size, updated }].
export async function listarBackups(companyId) {
  if (!companyId) return []
  const res = await listAll(ref(storage, `backups/${companyId}`))
  const items = await Promise.all(
    res.items.map(async (it) => {
      const [meta, url] = await Promise.all([getMetadata(it).catch(() => ({})), getDownloadURL(it).catch(() => '')])
      return { name: it.name, path: it.fullPath, url, size: meta.size || 0, updated: meta.updated || meta.timeCreated || '' }
    })
  )
  return items.sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
}

// Restaura desde un backup guardado en la nube (por su URL de descarga).
export async function restaurarDesdeUrl(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error('No se pudo descargar el backup de la nube.')
  const data = await resp.json()
  return restaurarBackup(data)
}

// Borra un backup de la nube (por su ruta en Storage).
export async function borrarBackupNube(path) {
  await deleteObject(ref(storage, path))
}

// Restaura desde un objeto de backup. MERGE por documento: repone lo que falte y
// sobrescribe con los valores del backup; NO borra nada que exista hoy.
export async function restaurarBackup(data) {
  if (!data || !data.colecciones) throw new Error('El archivo no es un backup válido de MilePay.')
  let restaurados = 0
  for (const col of Object.keys(data.colecciones)) {
    const docs = data.colecciones[col] || []
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db)
      for (const item of docs.slice(i, i + 400)) {
        const { id, ...rest } = item
        if (!id) continue
        batch.set(doc(db, col, id), deser(rest), { merge: true })
        restaurados++
      }
      await batch.commit()
    }
  }
  return restaurados
}
