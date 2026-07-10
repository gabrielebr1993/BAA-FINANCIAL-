// ---------------------------------------------------------------------------
// Recomendaciones de negocio de JARVIS (asesor). Analiza señales reales de la
// empresa (chofer/ruta/claims/fallidos/tendencia) y devuelve 2-4 sugerencias
// PRIORIZADAS, con el dato que las respalda. Solo owner/súper-admin, por companyId.
// SOLO ANÁLISIS: no ejecuta acciones, no mueve dinero, no borra, no toca config.
// ---------------------------------------------------------------------------
import { cargarAdmin, ensureAdmin, autorizar } from './_common.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0)
const round = (x) => Math.round(num(x) * 100) / 100
const fecha = (t) => { try { return t?.toDate ? t.toDate() : (t?.seconds ? new Date(t.seconds * 1000) : null) } catch { return null } }
const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Señales analíticas de una semana (con tendencia vs la anterior).
function calcularSenales(invoices, drivers, semanaTxt) {
  const orden = [...invoices].map((i) => ({ ...i, _fi: fecha(i.fechaInicio) })).sort((a, b) => (b._fi?.getTime() || 0) - (a._fi?.getTime() || 0))
  const inv = semanaTxt ? (orden.find((i) => norm(i.semana).includes(norm(semanaTxt))) || orden[0]) : orden[0]
  if (!inv) return null
  const idx = orden.findIndex((i) => i.id === inv.id)
  const prev = orden[idx + 1] || null

  const tarifaDe = (nombre) => { const d = drivers.find((x) => norm(x.nombre) === norm(nombre)); return { ind: num(d?.tarifa ?? d?.rate ?? 0), dob: num(d?.tarifaDoble ?? d?.tarifa ?? d?.rate ?? 0) } }
  const choferes = (inv.resumenChoferes || []).map((c) => {
    const t = tarifaDe(c.nombre)
    const entregas = num(c.individuales) + num(c.dobles)
    const pago = num(c.individuales) * t.ind + num(c.dobles) * t.dob
    const ganancia = num(c.ingreso) - pago
    return { nombre: c.nombre, ciudad: c.nombreCiudad || c.ciudad, entregas, ingreso: round(c.ingreso), pago: round(pago), ganancia: round(ganancia), margen: c.ingreso ? round((ganancia / c.ingreso) * 100) : 0, claims: num(c.numClaims), fallidos: num(c.fallidos), tarifa: t.ind }
  })
  const conVolumen = choferes.filter((c) => c.entregas >= 20)
  const peorMargen = [...conVolumen].sort((a, b) => a.margen - b.margen).slice(0, 3)
  const masClaims = [...choferes].filter((c) => c.claims > 0).sort((a, b) => b.claims - a.claims).slice(0, 3)
  const masFallidos = [...choferes].filter((c) => c.fallidos > 0).sort((a, b) => b.fallidos - a.fallidos).slice(0, 3)
  const mejores = [...choferes].sort((a, b) => b.ganancia - a.ganancia).slice(0, 3)

  const rutas = (inv.resumenRutas || []).map((r) => ({ ruta: r.ruta, ciudad: r.nombreCiudad || r.ciudad, paquetes: num(r.paquetes), ingreso: round(r.ingreso), porPaquete: r.paquetes ? round(r.ingreso / r.paquetes) : 0 }))
  const rutasOrd = [...rutas].sort((a, b) => b.porPaquete - a.porPaquete)
  const ingresoRutas = rutas.reduce((a, r) => a + r.ingreso, 0)
  const top3 = [...rutas].sort((a, b) => b.ingreso - a.ingreso).slice(0, 3)
  const concentracion = ingresoRutas ? round((top3.reduce((a, r) => a + r.ingreso, 0) / ingresoRutas) * 100) : 0

  const tendencia = prev ? {
    ingreso: round(num(inv.ingresoTotal) - num(prev.ingresoTotal)),
    claims: num(inv.totalClaims) - num(prev.totalClaims),
    fallidos: num(inv.totalFallidos) - num(prev.totalFallidos),
    semanaPrev: prev.semana,
  } : null

  return {
    semana: inv.semana,
    totales: { ingreso: round(inv.ingresoTotal), paquetes: num(inv.totalPaquetes), claims: num(inv.totalClaims), fallidos: num(inv.totalFallidos), descuentoGofo: round(inv.totalDescuentoGofo) },
    choferes: { peorMargen, masClaims, masFallidos, mejores },
    rutas: { masRentables: rutasOrd.slice(0, 3), menosRentables: rutasOrd.slice(-3).reverse(), concentracionTop3Pct: concentracion },
    tendencia,
  }
}

// Fallback determinista (sin IA) por si falta la API key o no se puede parsear.
function recsDeterministas(s) {
  const out = []
  const pm = s.choferes.peorMargen[0]
  if (pm && pm.margen < 15) out.push({ titulo: `Revisar tarifa de ${pm.nombre}`, detalle: `Dejó poco margen esta semana; quizá valga revisar su tarifa o su mezcla de entregas.`, dato: `${pm.nombre}: margen ${pm.margen}% sobre $${pm.ingreso} (${pm.entregas} entregas).`, prioridad: 1, seccion: 'pagos' })
  const fc = s.choferes.masFallidos[0]
  if (fc && fc.fallidos >= 3) out.push({ titulo: `Atención a fallidos de ${fc.nombre}`, detalle: `Acumuló varios paquetes fallidos; podría necesitar seguimiento.`, dato: `${fc.nombre}: ${fc.fallidos} fallidos.`, prioridad: 2, seccion: 'performance' })
  if (s.rutas.concentracionTop3Pct >= 40) out.push({ titulo: 'Ingreso concentrado en pocas rutas', detalle: 'Buena parte del ingreso viene de pocas rutas; conviene cuidarlas y diversificar.', dato: `Top 3 rutas = ${s.rutas.concentracionTop3Pct}% del ingreso.`, prioridad: 2, seccion: 'rutas' })
  const mejor = s.choferes.mejores[0]
  if (mejor) out.push({ titulo: `Cuida a ${mejor.nombre}`, detalle: 'Es de los que más ganancia deja; vale la pena retenerlo.', dato: `${mejor.nombre}: $${mejor.ganancia} de ganancia (${mejor.entregas} entregas).`, prioridad: 3, seccion: 'choferes' })
  return out.slice(0, 4)
}

function systemAsesor() {
  return [
    'Eres JARVIS, asesor de negocio de MilePay y socio de confianza de Gabriele (reparto).',
    'Analiza las SEÑALES (datos reales) y devuelve recomendaciones accionables.',
    'Reglas: prioriza por impacto en dinero; cada recomendación incluye el DATO que la respalda; tono cálido de socio; sugerencias, NO órdenes (nada drástico); nunca inventes (usa solo las señales).',
    'Responde SOLO con un JSON válido: un array de 2 a 4 objetos con las claves exactas {"titulo","detalle","dato","prioridad","seccion"}. prioridad es 1..4 (1 = mayor impacto). seccion ∈ ["pagos","choferes","rutas","performance","financiero","claims"]. Sin texto fuera del JSON.',
  ].join('\n')
}

function parseJSON(txt) {
  try { return JSON.parse(txt) } catch { /* try slice */ }
  const a = txt.indexOf('['), b = txt.lastIndexOf(']')
  if (a >= 0 && b > a) { try { return JSON.parse(txt.slice(a, b + 1)) } catch { /* noop */ } }
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
    const { companyId, semana } = req.body || {}
    if (!companyId) return res.status(400).json({ ok: false, error: 'Falta companyId.' })
    const esOwner = auth.caller && auth.caller.role === 'owner' && auth.caller.companyId === companyId
    if (!auth.esSuper && !esOwner) return res.status(403).json({ ok: false, error: 'Solo el dueño o súper-admin.' })

    const invSnap = await auth.db.collection('invoices').where('companyId', '==', companyId).get()
    const invoices = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    const drvSnap = await auth.db.collection('drivers').where('companyId', '==', companyId).get()
    const drivers = drvSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

    const senales = calcularSenales(invoices, drivers, semana)
    if (!senales) return res.status(200).json({ ok: true, semana: null, recomendaciones: [] })

    // Con IA si hay clave; si no (o si falla), fallback determinista.
    const apiKey = process.env.ANTHROPIC_API_KEY
    let recomendaciones = null
    if (apiKey) {
      try {
        const resp = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: MODELO, max_tokens: 900, system: systemAsesor(), messages: [{ role: 'user', content: 'SEÑALES:\n' + JSON.stringify(senales) }] }),
        })
        const data = await resp.json().catch(() => null)
        const txt = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        const arr = parseJSON(txt)
        if (Array.isArray(arr) && arr.length) recomendaciones = arr.slice(0, 4).map((r) => ({ titulo: String(r.titulo || ''), detalle: String(r.detalle || ''), dato: String(r.dato || ''), prioridad: num(r.prioridad) || 3, seccion: r.seccion || null }))
      } catch { /* cae al fallback */ }
    }
    if (!recomendaciones) recomendaciones = recsDeterministas(senales)

    recomendaciones.sort((x, y) => (x.prioridad || 3) - (y.prioridad || 3))
    return res.status(200).json({ ok: true, semana: senales.semana, recomendaciones })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Error: ' + (e?.message || 'desconocido') })
  }
}
