// AUTOSERVICIO del CHOFER (rol driver) desde su portal. Todo pasa por el Admin SDK
// para NO abrir reglas de Storage/Firestore al rol driver. Un solo endpoint con
// varias acciones (para no sumar funciones serverless; Vercel Hobby = 12):
//   - (por defecto)   sube su W-9 (archivo).
//   - accion:'estado' devuelve el estado de su verificación (para el portal).
//   - accion:'datos'  guarda SSN + banco + dirección (con bloqueo tras enviar).
//   - accion:'foto'   sube su foto de perfil.
//   - accion:'licencia' sube su licencia / ID.
// El dueño lo ve actualizado en el perfil del chofer. Los datos quedan BLOQUEADOS
// tras enviarlos; solo se pueden actualizar si el dueño habilita la edición
// (verificacion.actualizacionSolicitada = true).
import { randomUUID } from 'node:crypto'
import { cargarAdmin, ensureAdmin, autorizar } from './_common.js'

function bucketName() {
  const b = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET
  if (b) return b
  try { const j = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '', 'base64').toString('utf8')); if (j.project_id) return `${j.project_id}.appspot.com` } catch { /* noop */ }
  return null
}

// Sube un archivo base64 a Storage (con token de descarga) y devuelve su URL.
async function subirArchivo(companyId, driverId, prefijo, fileBase64, fileName, mimeType, maxMB = 5) {
  const bucketId = bucketName()
  if (!bucketId) throw new Error('Falta la variable del bucket de Storage (FIREBASE_STORAGE_BUCKET) en Vercel.')
  const buffer = Buffer.from(fileBase64, 'base64')
  if (!buffer.length) throw new Error('Archivo vacío.')
  if (buffer.length > maxMB * 1024 * 1024) throw new Error(`El archivo es muy grande (máx ${maxMB} MB).`)
  const { getStorage } = await import('firebase-admin/storage')
  const safe = String(fileName || prefijo).replace(/[^\w.\-]+/g, '_').slice(-60)
  const path = `verificacion/${companyId}/${driverId}/${prefijo}-${Date.now()}-${safe}`
  const token = randomUUID()
  await getStorage().bucket(bucketId).file(path).save(buffer, {
    resumable: false,
    metadata: { contentType: mimeType || 'application/octet-stream', metadata: { firebaseStorageDownloadTokens: token } },
  })
  return `https://firebasestorage.googleapis.com/v0/b/${bucketId}/o/${encodeURIComponent(path)}?alt=media&token=${token}`
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
    const dref = auth.db.collection('drivers').doc(driverId)
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const accion = body.accion || 'w9'

    // --- ESTADO: lo que el portal necesita para pintar la pantalla (no sensible) ---
    if (accion === 'estado') {
      const snap = await dref.get()
      const dv = (snap.exists ? snap.data() : {}) || {}
      const v = dv.verificacion || {}
      const tieneDatos = !!(v.ssn && v.rutaNumero && v.cuentaNumero && v.bancoNombre)
      const completo = !!(v.tieneSSN && v.ssn && v.rutaNumero && v.cuentaNumero && v.bancoNombre && (v.nombreCompleto || dv.nombre) && v.direccion)
      return res.status(200).json({
        ok: true,
        estado: {
          nombreCompleto: v.nombreCompleto || dv.nombre || '',
          direccion: v.direccion || '',
          telefono: v.telefono || '',
          email: v.email || '',
          tipoCuenta: v.tipoCuenta || 'checking',
          bancoNombre: v.bancoNombre || '',
          tieneDatos,
          completo,
          bloqueado: !!v.datosBloqueados,
          puedeActualizar: !v.datosBloqueados || !!v.actualizacionSolicitada,
          licenciaUrl: v.licenciaUrl || '',
          licenciaSubidaPorChofer: !!v.licenciaSubidaPorChofer,
          w9Url: v.w9Url || '',
          w9Solicitado: !!v.w9Solicitado,
          w9SubidoPorChofer: !!v.w9SubidoPorChofer,
          fotoUrl: dv.fotoUrl || v.fotoUrl || '',
        },
      })
    }

    // --- DATOS: SSN + banco + dirección, con bloqueo tras enviar ---
    if (accion === 'datos') {
      const snap = await dref.get()
      const v = (snap.exists ? snap.data().verificacion : {}) || {}
      if (v.datosBloqueados && !v.actualizacionSolicitada) {
        return res.status(409).json({ ok: false, error: 'Tus datos ya fueron enviados y están bloqueados. Pídele a tu empresa que habilite la edición para actualizarlos.' })
      }
      const d = body.datos || {}
      const soloDig = (s, n) => { const x = String(s || '').replace(/\D/g, ''); return x.length === n ? x : null }
      const ssn = soloDig(d.ssn, 9)
      const ruta = soloDig(d.rutaNumero, 9)
      // Para el 1099/W-9 exigimos TODOS los campos.
      if (!String(d.nombreCompleto || '').trim()) return res.status(400).json({ ok: false, error: 'Falta tu nombre completo.' })
      if (!String(d.direccion || '').trim()) return res.status(400).json({ ok: false, error: 'Falta tu dirección.' })
      if (!ssn) return res.status(400).json({ ok: false, error: 'El SSN debe tener 9 dígitos.' })
      if (!ruta) return res.status(400).json({ ok: false, error: 'El número de ruta (routing) debe tener 9 dígitos.' })
      if (!String(d.cuentaNumero || '').trim()) return res.status(400).json({ ok: false, error: 'Falta el número de cuenta.' })
      if (!String(d.bancoNombre || '').trim()) return res.status(400).json({ ok: false, error: 'Falta el banco.' })
      await dref.update({
        'verificacion.nombreCompleto': String(d.nombreCompleto || '').trim(),
        'verificacion.direccion': String(d.direccion || '').trim(),
        'verificacion.tieneSSN': true,
        'verificacion.ssn': ssn,
        'verificacion.bancoNombre': String(d.bancoNombre || '').trim(),
        'verificacion.tipoCuenta': d.tipoCuenta === 'savings' ? 'savings' : 'checking',
        'verificacion.cuentaNumero': String(d.cuentaNumero || '').trim(),
        'verificacion.rutaNumero': ruta,
        'verificacion.datosBancariosPorChofer': true,
        'verificacion.datosBancariosEn': a.FieldValue.serverTimestamp(),
        'verificacion.datosBloqueados': true,
        'verificacion.actualizacionSolicitada': false, // consume el permiso de edición
      })
      return res.status(200).json({ ok: true })
    }

    // --- FOTO de perfil ---
    if (accion === 'foto') {
      if (!body.fileBase64) return res.status(400).json({ ok: false, error: 'Falta la imagen.' })
      const url = await subirArchivo(companyId, driverId, 'foto', body.fileBase64, body.fileName, body.mimeType, 4)
      await dref.update({ fotoUrl: url, 'verificacion.fotoUrl': url, 'verificacion.fotoEn': a.FieldValue.serverTimestamp() })
      return res.status(200).json({ ok: true, url })
    }

    // --- LICENCIA / ID ---
    if (accion === 'licencia') {
      if (!body.fileBase64) return res.status(400).json({ ok: false, error: 'Falta el archivo.' })
      const url = await subirArchivo(companyId, driverId, 'licencia', body.fileBase64, body.fileName, body.mimeType, 5)
      await dref.update({ 'verificacion.licenciaUrl': url, 'verificacion.licenciaSubidaPorChofer': true, 'verificacion.licenciaEn': a.FieldValue.serverTimestamp() })
      return res.status(200).json({ ok: true, url })
    }

    // --- W-9 (por defecto) ---
    if (!body.fileBase64) return res.status(400).json({ ok: false, error: 'Falta el archivo.' })
    const url = await subirArchivo(companyId, driverId, 'w9', body.fileBase64, body.fileName, body.mimeType, 5)
    await dref.update({
      'verificacion.w9Url': url,
      'verificacion.w9Entregado': true,
      'verificacion.w9SubidoPorChofer': true,
      'verificacion.w9SubidoEn': a.FieldValue.serverTimestamp(),
      'verificacion.w9Solicitado': false,
    })
    return res.status(200).json({ ok: true, url })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'No se pudo completar: ' + (e?.message || 'desconocido') })
  }
}
