// ---------------------------------------------------------------------------
// BULK · Rastreo GPS en SEGUNDO PLANO (app nativa iOS/Android).
//
// Problema: dentro del WebView, el JavaScript se congela cuando el teléfono se
// bloquea o la app pasa a segundo plano → el mapa en vivo deja de recibir
// posiciones. Solución: la app NATIVA sigue leyendo el GPS del sistema y manda
// cada punto aquí, sin depender de la sesión web (que puede estar congelada).
//
// Autenticación por PASE DE RASTREO (no por idToken, que caduca en 1 hora):
//   1) accion 'pase' (con Bearer idToken, solo rol chofer): genera/renueva un
//      pase aleatorio en bulk_trackpass/{uid} con vencimiento a 30 días y lo
//      devuelve. La web lo guarda en localStorage para que la app nativa lo lea.
//   2) accion 'punto' (sin sesión; con { uid, pass, ordenId, lat, lng, speed }):
//      valida el pase contra Firestore, valida que la orden sea DEL chofer y
//      esté ACTIVA, y escribe el punto igual que la web: bulk_trackpoints +
//      ultimaPos en la orden + eventos de geocerca (entrada/salida) con la
//      misma histéresis de 40 m que el cliente.
//
// El pase NO da acceso a nada más: solo permite escribir posiciones del propio
// chofer sobre su propia orden activa. Si la orden terminó, responde
// { activo:false } y la app nativa apaga el GPS.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto'
import { cargarAdmin, ensureAdmin } from './_common.js'

// Mismos estados que ESTADOS_ACTIVOS_CHOFER (src/bulk/domain/flujo.js).
const ESTADOS_ACTIVOS = ['aceptada', 'en_planta', 'cargando', 'en_ruta', 'en_destino', 'entregada']
const DIA_MS = 86400000

// Distancia haversine en metros (misma fórmula que src/bulk/domain/geo.js).
function distanciaM(a, b) {
  const R = 6371000
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Caché de geocercas por tenant (60 s): un camión manda un punto cada ~20 s y
// no queremos releer la colección completa en cada uno.
const cacheGeo = new Map() // tenantId -> { ts, lista }
async function geocercasDe(db, tenantId) {
  const hit = cacheGeo.get(tenantId)
  if (hit && Date.now() - hit.ts < 60000) return hit.lista
  const snap = await db.collection('bulk_geofences').where('tenantId', '==', tenantId).get()
  const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  cacheGeo.set(tenantId, { ts: Date.now(), lista })
  return lista
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
  let a
  try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) { return res.status(500).json({ ok: false, error: String(e.message || e) }) }
  const db = a.getFirestore()
  const body = req.body || {}
  const accion = body.accion || 'punto'

  try {
    // ── 1) Emitir/renovar el pase de DISPOSITIVO (requiere sesión web) ──────
    // Todos los roles lo piden: el chofer lo usa para el GPS en segundo plano y
    // cualquier rol lo usa para registrar el token de notificaciones push de la
    // app nativa (accion 'token').
    if (accion === 'pase') {
      const h = req.headers.authorization || ''
      const idToken = h.startsWith('Bearer ') ? h.slice(7) : ''
      if (!idToken) return res.status(401).json({ ok: false, error: 'Falta el token de sesión.' })
      let d
      try { d = await a.getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ ok: false, error: 'Token inválido o expirado.' }) }
      if (!d.bulkTenant || !d.bulkRole) return res.status(403).json({ ok: false, error: 'Tu cuenta no pertenece al módulo Freight.' })
      const ref = db.collection('bulk_trackpass').doc(d.uid)
      const prev = await ref.get()
      const ahora = Date.now()
      // Reutiliza el pase vigente si aún le quedan >5 días (no invalidar al
      // segundo dispositivo/recarga); si no, genera uno nuevo.
      let pass = prev.exists ? prev.data().pass : null
      let venceEn = prev.exists ? Number(prev.data().venceEn) : 0
      if (!pass || !(venceEn > ahora + 5 * DIA_MS)) {
        pass = crypto.randomBytes(24).toString('hex')
        venceEn = ahora + 30 * DIA_MS
      }
      // La audiencia (rol/carrier/cliente) se refresca SIEMPRE desde los claims,
      // para que el registro de tokens de push lleve los datos vigentes.
      await ref.set({
        pass, venceEn, uid: d.uid, tenantId: d.bulkTenant, rol: d.bulkRole || null,
        carrierId: d.bulkCarrierId || null, clienteId: d.bulkClienteId || null,
        creadoEn: prev.exists ? (prev.data().creadoEn || new Date().toISOString()) : new Date().toISOString(),
        actualizadoEn: new Date().toISOString(),
      })
      return res.status(200).json({ ok: true, pass, venceEn })
    }

    // ── 1d) PRUEBA de notificación (con sesión web): envía un push de prueba a
    // TODOS los dispositivos registrados del usuario y devuelve la respuesta
    // EXACTA de Apple/Google por cada uno — el diagnóstico definitivo sin
    // consola. Se dispara desde la web con /bulk?probar=push.
    if (accion === 'probar_push') {
      const h = req.headers.authorization || ''
      const idToken = h.startsWith('Bearer ') ? h.slice(7) : ''
      if (!idToken) return res.status(401).json({ ok: false, error: 'Falta el token de sesión.' })
      let d
      try { d = await a.getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ ok: false, error: 'Token inválido.' }) }
      if (!d.bulkTenant) return res.status(403).json({ ok: false, error: 'Cuenta sin módulo Freight.' })
      const snap = await db.collection('bulk_pushTokens')
        .where('tenantId', '==', d.bulkTenant).where('uid', '==', d.uid).get()
      const msg = a.getMessaging()
      const resultados = []
      for (const doc of snap.docs) {
        const x = doc.data()
        if (x.plataforma === 'ios_voip') { resultados.push(`${x.plataforma}: (se prueba con una llamada)`); continue }
        try {
          await msg.send({
            token: x.token,
            notification: { title: 'Prueba MilePay', body: '✅ Si lees esto, las notificaciones funcionan' },
            apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
            android: { priority: 'high' },
          })
          resultados.push(`${x.plataforma || 'web'}: ENVIADO ✓`)
        } catch (e) {
          resultados.push(`${x.plataforma || 'web'}: ERROR ${e?.errorInfo?.code || e?.code || e?.message}`)
        }
      }
      if (!resultados.length) resultados.push('SIN dispositivos registrados para tu usuario')
      return res.status(200).json({ ok: true, resultados })
    }

    // Validación del pase (compartida por 'punto' y 'token').
    const validarPase = async (uid, pass) => {
      if (!uid || !pass) return null
      const s = await db.collection('bulk_trackpass').doc(String(uid)).get()
      const tp = s.exists ? s.data() : null
      const okP = tp && typeof tp.pass === 'string' && tp.pass.length === String(pass).length &&
        crypto.timingSafeEqual(Buffer.from(tp.pass), Buffer.from(String(pass)))
      if (!okP || !(Number(tp.venceEn) > Date.now())) return null
      return tp
    }

    // ── 1b) Registrar el token de PUSH de la app nativa (autenticado por pase) ──
    // Guarda el token en bulk_pushTokens con la MISMA forma que la web (fcm.js),
    // así las Cloud Functions existentes (órdenes/geocercas/mensajes/llamadas)
    // le envían también al teléfono con la app cerrada.
    if (accion === 'token') {
      const tp = await validarPase(body.uid, body.pass)
      if (!tp) return res.status(401).json({ ok: false, error: 'Pase inválido o vencido. Abre la app para renovarlo.' })
      const token = String(body.token || '')
      if (token.length < 20 || token.length > 4096) return res.status(400).json({ ok: false, error: 'Token inválido.' })
      await db.collection('bulk_pushTokens').doc(token.replace(/\//g, '_')).set({
        token,
        tenantId: tp.tenantId, uid: tp.uid, rol: tp.rol || null,
        carrierId: tp.carrierId || null, clienteId: tp.clienteId || null,
        plataforma: String(body.plataforma || 'ios'),
        actualizadoEn: a.FieldValue.serverTimestamp(),
      }, { merge: true })
      return res.status(200).json({ ok: true })
    }

    // ── 1c) Acciones de LLAMADA desde la pantalla nativa (CallKit) ──────────
    // 'rechazar': el usuario deslizó Rechazar en la pantalla nativa; se marca la
    // llamada para que al emisor le deje de repicar.
    if (accion === 'llamada') {
      const tp = await validarPase(body.uid, body.pass)
      if (!tp) return res.status(401).json({ ok: false, error: 'Pase inválido o vencido.' })
      const callId = String(body.callId || '')
      if (!callId) return res.status(400).json({ ok: false, error: 'Falta callId.' })
      const cref = db.collection('bulk_calls').doc(callId)
      const cSnap = await cref.get()
      const c = cSnap.exists ? cSnap.data() : null
      if (!c || c.tenantId !== tp.tenantId || c.para !== tp.uid) return res.status(200).json({ ok: true, ignorado: true })
      if (body.op === 'rechazar') await cref.set({ estado: 'rechazada' }, { merge: true }).catch(() => {})
      return res.status(200).json({ ok: true })
    }

    // ── 1e) LINK PÚBLICO de seguimiento ("Negocio y roles", Bloque 4) ───────
    // 'compartir' (con sesión web): el cliente/staff genera un link SIN LOGIN
    // para el encargado de obra. El link muestra el camión en vivo y CADUCA
    // solo cuando la orden se entrega.
    if (accion === 'compartir') {
      const h = req.headers.authorization || ''
      const idToken = h.startsWith('Bearer ') ? h.slice(7) : ''
      if (!idToken) return res.status(401).json({ ok: false, error: 'Falta el token de sesión.' })
      let d
      try { d = await a.getAuth().verifyIdToken(idToken) } catch { return res.status(401).json({ ok: false, error: 'Token inválido o expirado.' }) }
      const ordenId = String(body.ordenId || '')
      if (!ordenId) return res.status(400).json({ ok: false, error: 'Falta ordenId.' })
      const oSnap2 = await db.collection('bulk_orders').doc(ordenId).get()
      const o2 = oSnap2.exists ? oSnap2.data() : null
      if (!o2 || o2.tenantId !== d.bulkTenant) return res.status(404).json({ ok: false, error: 'Orden no encontrada.' })
      // Alcance: staff, el cliente dueño, el transportista asignado o el chofer.
      const esStaffTk = d.bulkRole && !['cliente', 'transportista', 'chofer', 'supervisor_planta'].includes(d.bulkRole)
      const puedeVerla = esStaffTk
        || (d.bulkRole === 'cliente' && o2.clienteId === d.bulkClienteId)
        || (d.bulkRole === 'transportista' && o2.transportistaId === d.bulkCarrierId)
        || (d.bulkRole === 'chofer' && (o2.choferId === d.uid || o2.choferUid === d.uid))
      if (!puedeVerla) return res.status(403).json({ ok: false, error: 'No tienes acceso a esta orden.' })
      // Reutiliza el link vigente de la orden si ya existe (un link por orden).
      const prevLink = await db.collection('bulk_trackLinks').where('orderId', '==', ordenId).limit(1).get()
      let tk = prevLink.empty ? null : prevLink.docs[0].id
      if (!tk) {
        tk = crypto.randomBytes(16).toString('hex')
        await db.collection('bulk_trackLinks').doc(tk).set({
          orderId: ordenId, tenantId: o2.tenantId, numero: o2.numero || '',
          creadoPor: d.uid, rol: d.bulkRole || '', creadoEn: new Date().toISOString(),
        })
      }
      return res.status(200).json({ ok: true, url: `https://www.milepay.io/seguimiento?t=${tk}` })
    }

    // 'seguimiento' (SIN login): estado + última posición para el link público.
    // Al entregarse la orden responde { caducado: true } y no expone nada más.
    if (accion === 'seguimiento') {
      const tk = String(body.t || '')
      if (!/^[0-9a-f]{32}$/.test(tk)) return res.status(400).json({ ok: false, error: 'Link inválido.' })
      const lSnap = await db.collection('bulk_trackLinks').doc(tk).get()
      const link = lSnap.exists ? lSnap.data() : null
      if (!link) return res.status(404).json({ ok: false, error: 'Link inválido.' })
      const oSnap3 = await db.collection('bulk_orders').doc(String(link.orderId)).get()
      const o3 = oSnap3.exists ? oSnap3.data() : null
      if (!o3) return res.status(404).json({ ok: false, error: 'Orden no encontrada.' })
      if (['entregada', 'liberada', 'cerrada', 'cancelada'].includes(o3.estado)) {
        return res.status(200).json({ ok: true, caducado: true })
      }
      // Solo lo necesario para el encargado de obra (sin precios ni datos internos).
      return res.status(200).json({
        ok: true, caducado: false,
        numero: o3.numero || '', material: o3.material || '', estado: o3.estado || '',
        destino: o3.direccionEntrega || '', choferNombre: o3.choferNombre || '',
        unidad: o3.unidad || o3.placa || o3.tipoEquipo || '',
        pos: o3.ultimaPos ? { lat: o3.ultimaPos.lat, lng: o3.ultimaPos.lng, ts: o3.ultimaPos.ts } : null,
      })
    }

    // ── 2) Recibir un punto GPS de la app nativa (autenticado por pase) ─────
    const { uid, pass, ordenId } = body
    const lat = Number(body.lat), lng = Number(body.lng)
    const speed = body.speed != null && Number.isFinite(Number(body.speed)) ? Number(body.speed) : null
    if (!uid || !pass || !ordenId) return res.status(400).json({ ok: false, error: 'Faltan uid, pass u ordenId.' })
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ ok: false, error: 'Coordenadas inválidas.' })
    }
    const tp = await validarPase(uid, pass)
    if (!tp) return res.status(401).json({ ok: false, error: 'Pase inválido o vencido. Abre la app para renovarlo.' })

    const oref = db.collection('bulk_orders').doc(String(ordenId))
    const oSnap = await oref.get()
    const orden = oSnap.exists ? oSnap.data() : null
    // La orden debe ser del MISMO tenant, estar asignada a ESTE chofer y seguir
    // activa. choferId puede ser el uid de login o el id del roster; el pase solo
    // conoce el uid, así que aceptamos también órdenes cuyo choferUid coincida.
    const esSuya = orden && orden.tenantId === tp.tenantId && (orden.choferId === uid || orden.choferUid === uid)
    if (!esSuya || !ESTADOS_ACTIVOS.includes(orden.estado)) {
      return res.status(200).json({ ok: true, activo: false })
    }

    const pos = { lat, lng, speed }
    const ts = new Date().toISOString()

    // Throttle del lado servidor: si el último punto fue hace <15 s y el camión
    // se movió <30 m, no escribimos otro (la app nativa ya lanza cada ~20 s,
    // esto solo protege de duplicados web+nativo).
    const up = orden.ultimaPos
    if (up && up.ts && Date.now() - Date.parse(up.ts) < 15000 && distanciaM(up, pos) < 30) {
      return res.status(200).json({ ok: true, activo: true, omitido: true })
    }

    // Eventos de geocerca (misma histéresis de 40 m que useGpsTracker). El estado
    // "estaba dentro" vive en la orden (geoEstadosSrv) para sobrevivir entre
    // invocaciones serverless.
    const geocercas = await geocercasDe(db, tp.tenantId)
    const estados = { ...(orden.geoEstadosSrv || {}) }
    const eventos = []
    for (const gf of geocercas) {
      const r = Number(gf.radio) || 0
      if (!Number.isFinite(gf.lat) || !Number.isFinite(gf.lng) || r <= 0) continue
      const dist = distanciaM(pos, { lat: gf.lat, lng: gf.lng })
      const estaba = !!estados[gf.id]
      const dentro = estaba ? dist <= r + 40 : dist <= r
      estados[gf.id] = dentro
      if (dentro !== estaba) eventos.push({ gf, evento: dentro ? 'entrada' : 'salida' })
    }

    const punto = { orderId: String(ordenId), lat, lng, speed, ts }
    const batch = db.batch()
    batch.set(db.collection('bulk_trackpoints').doc(), { tenantId: tp.tenantId, ...punto })
    batch.update(oref, { ultimaPos: { ...punto }, geoEstadosSrv: estados })
    for (const { gf, evento } of eventos) {
      batch.update(oref, { geoEventos: a.FieldValue.arrayUnion({ geofenceId: gf.id, geocerca: gf.nombre, tipo: gf.tipo, evento, ts }) })
      // Notificación (Cloud Function bulkPushGeocerca escucha bulk_geoeventos).
      batch.set(db.collection('bulk_geoeventos').doc(), {
        tenantId: tp.tenantId,
        orderId: String(ordenId), geofenceId: gf.id, geocerca: gf.nombre || '', plantaId: gf.plantaId || null, tipoGeocerca: gf.tipo || '',
        evento,
        choferNombre: orden.choferNombre || '', choferId: orden.choferId || uid, choferCodigo: null,
        unidad: orden.unidad || orden.placa || orden.tipoEquipo || '',
        carrierId: orden.transportistaId || tp.carrierId || null,
        lat, lng, ts,
      })
    }
    await batch.commit()
    return res.status(200).json({ ok: true, activo: true, eventos: eventos.length })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
