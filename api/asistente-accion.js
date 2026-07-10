// ---------------------------------------------------------------------------
// Ejecuta un cambio YA CONFIRMADO por el usuario, propuesto por el asistente.
// BLINDAJE: solo se permiten DOS cambios NO sensibles y nada más:
//   1) verificacion_estado  → drivers/{id}.verificacion.estado (pendiente/aprobado/rechazado)
//   2) tarifa_chofer         → drivers/{id}.tarifa (número >= 0)
// Cualquier otro "tipo" se rechaza. NUNCA paga, transfiere, borra ni toca
// configuración sensible. Revalida rol (owner/súper-admin) + companyId en el
// servidor y registra la acción en `asistente_logs`.
// ---------------------------------------------------------------------------
import { cargarAdmin, ensureAdmin, autorizar, cargarChoferAutorizado } from './_common.js'

const TIPOS_PERMITIDOS = ['verificacion_estado', 'tarifa_chofer']
const ESTADOS_OK = ['pendiente', 'aprobado', 'rechazado']

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_SERVICE_ACCOUNT' ? 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar: ' + (e?.message || '') })
    }
    const auth = await autorizar(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })

    const { companyId, tipo, driverId } = req.body || {}
    if (!companyId || !tipo || !driverId) return res.status(400).json({ ok: false, error: 'Faltan datos (companyId, tipo, driverId).' })
    if (!TIPOS_PERMITIDOS.includes(tipo)) return res.status(403).json({ ok: false, error: 'Acción no permitida por el asistente.' })

    // Revalida rol/empresa y que el chofer pertenezca a la empresa.
    const cargado = await cargarChoferAutorizado(auth, companyId, driverId)
    if (cargado.error) return res.status(cargado.code).json({ ok: false, error: cargado.error })
    const { dref, driver } = cargado

    let cambio, antes
    if (tipo === 'verificacion_estado') {
      const estado = String(req.body.estado || '')
      if (!ESTADOS_OK.includes(estado)) return res.status(400).json({ ok: false, error: 'Estado inválido.' })
      antes = driver.verificacion?.estado || 'pendiente'
      cambio = { verificacion: { ...(driver.verificacion || {}), estado, revisadoPor: (auth.decoded.email || 'asistente') + ' (asistente)' } }
    } else {
      const tarifa = Number(req.body.tarifa)
      if (!isFinite(tarifa) || tarifa < 0) return res.status(400).json({ ok: false, error: 'Tarifa inválida.' })
      antes = driver.tarifa ?? driver.rate ?? null
      cambio = { tarifa }
    }

    await dref.set(cambio, { merge: true })

    // Registro de auditoría de lo que hizo el asistente.
    try {
      await auth.db.collection('asistente_logs').add({
        companyId, uid: auth.decoded.uid, email: auth.decoded.email || null,
        tipo, driverId, driverNombre: driver.nombre || null,
        antes, despues: tipo === 'verificacion_estado' ? req.body.estado : Number(req.body.tarifa),
        en: a.FieldValue.serverTimestamp(),
      })
    } catch { /* el log no debe romper la acción */ }

    return res.status(200).json({ ok: true, tipo, driverNombre: driver.nombre || driverId })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'No se pudo aplicar: ' + (e?.message || 'desconocido') })
  }
}
