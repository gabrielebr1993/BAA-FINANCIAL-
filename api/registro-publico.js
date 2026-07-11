// Registro PÚBLICO de choferes (sin login): un enlace con TOKEN de la empresa +
// un PIN por chofer. El chofer se busca en la lista, valida su PIN, completa
// SSN/banco y se guarda su W-9 (PDF ya generado en el cliente). Al enviar, queda
// registroCompletado=true → desaparece del enlace y nadie puede reenviarlo/verlo.
// Todo por Admin SDK (no se abren reglas). Solo se exponen NOMBRES de pendientes.
import { randomUUID } from 'node:crypto'
import { cargarAdmin, ensureAdmin } from './_common.js'

function bucketName() {
  const b = process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET
  if (b) return b
  try { const j = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '', 'base64').toString('utf8')); if (j.project_id) return `${j.project_id}.appspot.com` } catch { /* noop */ }
  return null
}
const soloDigitos = (s, n) => { const d = String(s || '').replace(/\D/g, ''); return d.length === n ? d : null }

// Encuentra la empresa por su token de registro (settings.registroToken).
async function empresaPorToken(db, token) {
  if (!token) return null
  const snap = await db.collection('settings').where('registroToken', '==', token).limit(1).get()
  if (snap.empty) return null
  const doc = snap.docs[0]
  return { companyId: doc.id, ajustes: doc.data() }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch { return res.status(503).json({ ok: false, error: 'Servicio no disponible.' }) }
    const db = a.getFirestore()

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { accion, token, driverId, pin } = body

    const emp = await empresaPorToken(db, token)
    if (!emp) return res.status(404).json({ ok: false, error: 'Enlace no válido o expirado. Pídele a tu empresa un enlace nuevo.' })
    const { companyId } = emp

    // 1) LISTA de pendientes (solo nombres). No expone datos sensibles.
    if (accion === 'lista') {
      const snap = await db.collection('drivers').where('companyId', '==', companyId).get()
      const pendientes = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((d) => d.activo !== false && !d.registroCompletado && d.registroPin)
        .map((d) => ({ id: d.id, nombre: d.nombre || '' }))
        .sort((x, y) => x.nombre.localeCompare(y.nombre))
      let empresa = companyId
      try { const c = await db.collection('companies').doc(companyId).get(); if (c.exists) empresa = c.data().nombre || companyId } catch { /* noop */ }
      return res.status(200).json({ ok: true, empresa, pendientes })
    }

    // Para verificar/enviar hace falta driver + pin válidos.
    if (!driverId || !pin) return res.status(400).json({ ok: false, error: 'Falta seleccionar tu nombre y tu PIN.' })
    const dref = db.collection('drivers').doc(driverId)
    const dsnap = await dref.get()
    if (!dsnap.exists) return res.status(404).json({ ok: false, error: 'Chofer no encontrado.' })
    const driver = dsnap.data()
    if (driver.companyId !== companyId) return res.status(403).json({ ok: false, error: 'No autorizado.' })
    if (driver.registroCompletado) return res.status(409).json({ ok: false, error: 'Este chofer ya envió su información. Si necesitas corregir algo, contacta a tu empresa.' })
    if (!driver.registroPin || String(driver.registroPin) !== String(pin).trim()) return res.status(401).json({ ok: false, error: 'PIN incorrecto. Revísalo con tu empresa.' })

    // 2) VERIFICAR PIN → devuelve datos NO sensibles para prellenar (su propio nombre/…).
    if (accion === 'verificar') {
      const v = driver.verificacion || {}
      return res.status(200).json({ ok: true, driver: { nombre: driver.nombre || '', nombreCompleto: v.nombreCompleto || '', direccion: v.direccion || '', telefono: v.telefono || '', email: v.email || '' } })
    }

    // 3) ENVIAR: guarda SSN/banco + W-9 (PDF base64) y bloquea el registro.
    if (accion === 'enviar') {
      const d = body.datos || {}
      const ssn = soloDigitos(d.ssn, 9)
      const ruta = soloDigitos(d.rutaNumero, 9)
      if (!ssn) return res.status(400).json({ ok: false, error: 'El SSN debe tener 9 dígitos.' })
      if (!ruta) return res.status(400).json({ ok: false, error: 'El número de ruta (routing) debe tener 9 dígitos.' })
      if (!String(d.cuentaNumero || '').trim()) return res.status(400).json({ ok: false, error: 'Falta el número de cuenta.' })
      if (!String(d.bancoNombre || '').trim()) return res.status(400).json({ ok: false, error: 'Falta el banco.' })

      // Sube el W-9 (PDF generado en el cliente) a Storage con token de descarga.
      let w9Url = ''
      if (body.w9Base64) {
        const bucketId = bucketName()
        if (!bucketId) return res.status(503).json({ ok: false, error: 'Falta el bucket de Storage (FIREBASE_STORAGE_BUCKET) en Vercel.' })
        const { getStorage } = await import('firebase-admin/storage')
        const buffer = Buffer.from(body.w9Base64, 'base64')
        if (buffer.length > 6 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'El W-9 es muy grande.' })
        const path = `verificacion/${companyId}/${driverId}/w9-registro-${Date.now()}.pdf`
        const tok = randomUUID()
        await getStorage().bucket(bucketId).file(path).save(buffer, { resumable: false, metadata: { contentType: 'application/pdf', metadata: { firebaseStorageDownloadTokens: tok } } })
        w9Url = `https://firebasestorage.googleapis.com/v0/b/${bucketId}/o/${encodeURIComponent(path)}?alt=media&token=${tok}`
      }

      await dref.update({
        'verificacion.nombreCompleto': String(d.nombreCompleto || driver.nombre || '').trim(),
        'verificacion.direccion': String(d.direccion || '').trim(),
        'verificacion.telefono': String(d.telefono || '').trim(),
        'verificacion.email': String(d.email || '').trim(),
        'verificacion.tieneSSN': true,
        'verificacion.ssn': ssn,
        'verificacion.bancoNombre': String(d.bancoNombre || '').trim(),
        'verificacion.tipoCuenta': d.tipoCuenta === 'savings' ? 'savings' : 'checking',
        'verificacion.cuentaNumero': String(d.cuentaNumero || '').trim(),
        'verificacion.rutaNumero': ruta,
        'verificacion.w9Url': w9Url || (driver.verificacion?.w9Url || ''),
        'verificacion.w9Entregado': true,
        'verificacion.w9SubidoPorChofer': true,
        'verificacion.w9SubidoEn': a.FieldValue.serverTimestamp(),
        registroCompletado: true,
        registroEn: a.FieldValue.serverTimestamp(),
      })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ ok: false, error: 'Acción no válida.' })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Error: ' + (e?.message || 'desconocido') })
  }
}
