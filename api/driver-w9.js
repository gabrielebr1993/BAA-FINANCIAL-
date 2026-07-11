// El CHOFER sube su propio W-9 desde su portal. Se procesa en el servidor (Admin
// SDK) para NO tener que abrir reglas de Storage/Firestore al rol driver:
//   - Verifica la sesión y que el que llama sea un CHOFER vinculado (caller.driverId).
//   - Sube el archivo a Storage (con token de descarga) en la carpeta del chofer.
//   - Actualiza SOLO su verificacion.w9Url/w9Entregado + marca "subido por el chofer".
// El dueño lo ve actualizado en el perfil del chofer.
import { randomUUID } from 'node:crypto'
import { cargarAdmin, ensureAdmin, autorizar } from './_common.js'

function bucketName() {
  const b = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET
  if (b) return b
  try { const j = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '', 'base64').toString('utf8')); if (j.project_id) return `${j.project_id}.appspot.com` } catch { /* noop */ }
  return null
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_SERVICE_ACCOUNT' ? 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar.' })
    }
    const auth = await autorizar(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })

    // Debe ser un chofer vinculado a un registro de chofer y a su empresa.
    const caller = auth.caller
    const driverId = caller?.driverId
    const companyId = caller?.companyId
    if (!caller || caller.role !== 'driver' || !driverId || !companyId) {
      return res.status(403).json({ ok: false, error: 'Tu cuenta no está vinculada a un chofer. Pídele a tu empresa que la vincule.' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

    // Rama "datos": el chofer guarda sus datos de pago (SSN + banco) desde el portal.
    // Se escriben con dot-path para NO pisar el resto de su verificacion (ej. W-9).
    if (body.accion === 'datos') {
      const d = body.datos || {}
      const soloDig = (s, n) => { const x = String(s || '').replace(/\D/g, ''); return x.length === n ? x : null }
      const ssn = soloDig(d.ssn, 9)
      const ruta = soloDig(d.rutaNumero, 9)
      if (!ssn) return res.status(400).json({ ok: false, error: 'El SSN debe tener 9 dígitos.' })
      if (!ruta) return res.status(400).json({ ok: false, error: 'El número de ruta (routing) debe tener 9 dígitos.' })
      if (!String(d.cuentaNumero || '').trim()) return res.status(400).json({ ok: false, error: 'Falta el número de cuenta.' })
      if (!String(d.bancoNombre || '').trim()) return res.status(400).json({ ok: false, error: 'Falta el banco.' })
      await auth.db.collection('drivers').doc(driverId).update({
        'verificacion.tieneSSN': true,
        'verificacion.ssn': ssn,
        'verificacion.bancoNombre': String(d.bancoNombre || '').trim(),
        'verificacion.tipoCuenta': d.tipoCuenta === 'savings' ? 'savings' : 'checking',
        'verificacion.cuentaNumero': String(d.cuentaNumero || '').trim(),
        'verificacion.rutaNumero': ruta,
        'verificacion.datosBancariosPorChofer': true,
        'verificacion.datosBancariosEn': a.FieldValue.serverTimestamp(),
      })
      return res.status(200).json({ ok: true })
    }

    const { fileBase64, fileName, mimeType } = body
    if (!fileBase64) return res.status(400).json({ ok: false, error: 'Falta el archivo.' })
    const buffer = Buffer.from(fileBase64, 'base64')
    if (!buffer.length) return res.status(400).json({ ok: false, error: 'Archivo vacío.' })
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'El archivo es muy grande (máx 5 MB).' })

    const bucketId = bucketName()
    if (!bucketId) return res.status(503).json({ ok: false, error: 'Falta la variable del bucket de Storage (FIREBASE_STORAGE_BUCKET) en Vercel.' })

    const { getStorage } = await import('firebase-admin/storage')
    const safe = String(fileName || 'w9').replace(/[^\w.\-]+/g, '_').slice(-60)
    const path = `verificacion/${companyId}/${driverId}/w9-${Date.now()}-${safe}`
    const token = randomUUID()
    const fileRef = getStorage().bucket(bucketId).file(path)
    await fileRef.save(buffer, {
      resumable: false,
      metadata: { contentType: mimeType || 'application/octet-stream', metadata: { firebaseStorageDownloadTokens: token } },
    })
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketId}/o/${encodeURIComponent(path)}?alt=media&token=${token}`

    // Actualiza SOLO los campos del W-9 (dot-path: no pisa el resto de verificacion).
    await auth.db.collection('drivers').doc(driverId).update({
      'verificacion.w9Url': url,
      'verificacion.w9Entregado': true,
      'verificacion.w9SubidoPorChofer': true,
      'verificacion.w9SubidoEn': a.FieldValue.serverTimestamp(),
      'verificacion.w9Solicitado': false,
    })

    return res.status(200).json({ ok: true, url })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'No se pudo subir el W-9: ' + (e?.message || 'desconocido') })
  }
}
