// ---------------------------------------------------------------------------
// Cerebro del asistente "JARVIS" de MilePay.
// - Valida sesión + rol (owner/súper-admin) + companyId (en el BACKEND).
// - Mantiene un RESUMEN ligero siempre en contexto + HERRAMIENTAS de consulta
//   (tool use) para pedir SOLO el detalle que necesita (historial, chofer, ruta,
//   top, comparativas, claims, fallidos) — sin cargar los ~101k paquetes crudos.
// - Búsqueda WEB (tool de Anthropic) que el modelo decide usar por su cuenta.
// - Personalidad cálida + "mood" para la expresión del cerebro/voz.
// - Acciones seguras (navegar/filtrar/reporte) al frontend; cambios como
//   "propuesta" (requieren confirmación en /api/asistente-accion).
// LÍMITES DUROS: aquí NO existen herramientas para pagar, transferir, borrar,
// ni tocar configuración sensible. Aunque el modelo lo pida, no hay forma.
// ---------------------------------------------------------------------------
import { cargarAdmin, ensureAdmin, autorizar } from './_common.js'
import { netoClaimsPorChofer } from './_claimecon.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0)
const round = (x) => Math.round((num(x)) * 100) / 100
const fecha = (t) => { try { return t?.toDate ? t.toDate() : (t?.seconds ? new Date(t.seconds * 1000) : null) } catch { return null } }
const norm = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// ---- Herramientas ----------------------------------------------------------
// Acciones de CLIENTE (las ejecuta el navegador).
const TOOLS_ACCION = [
  { name: 'navegar', description: 'Lleva al usuario a una sección de la app. Úsalo cuando pida abrir/ir/mostrar una pantalla.', input_schema: { type: 'object', properties: { seccion: { type: 'string', enum: ['dashboard', 'pagos', 'choferes', 'rutas', 'claims', 'financiero', 'performance', 'alertas', 'reclamos', 'configuracion', 'stripe', 'backups', 'historial'] } }, required: ['seccion'] } },
  { name: 'aplicar_filtro', description: 'Aplica el filtro global de fechas y/o ciudad.', input_schema: { type: 'object', properties: { preset: { type: 'string', enum: ['ultima', 'ultimas4', 'esteMes', 'mesPasado', 'esteTrimestre', 'esteAno', 'todo'] }, desde: { type: 'string' }, hasta: { type: 'string' }, ciudad: { type: 'string' } } } },
  { name: 'generar_reporte', description: 'Genera y descarga un reporte de la sección con los datos actuales.', input_schema: { type: 'object', properties: { seccion: { type: 'string', enum: ['dashboard', 'pagos', 'choferes', 'rutas', 'performance', 'financiero'] }, formato: { type: 'string', enum: ['excel', 'pdf'] } }, required: ['seccion', 'formato'] } },
  { name: 'proponer_cambio', description: 'Propone un cambio NO sensible que el usuario debe CONFIRMAR. Solo: estatus de verificación de un chofer, o tarifa de un chofer.', input_schema: { type: 'object', properties: { tipo: { type: 'string', enum: ['verificacion_estado', 'tarifa_chofer'] }, driverNombre: { type: 'string' }, estado: { type: 'string', enum: ['pendiente', 'aprobado', 'rechazado'] }, tarifa: { type: 'number' }, resumen: { type: 'string' } }, required: ['tipo', 'driverNombre', 'resumen'] } },
]

// Herramientas de CONSULTA de datos (se ejecutan en el servidor, solo lectura).
const TOOLS_DATOS = [
  { name: 'get_historial', description: 'Totales por semana de todo el historial (ingreso, paquetes, claims, fallidos, descuento Gofo). Para ver TENDENCIAS.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_resumen_semana', description: 'Resumen de una semana concreta (por su texto, ej. "22_06_2026" o parte de él).', input_schema: { type: 'object', properties: { semana: { type: 'string' } }, required: ['semana'] } },
  { name: 'get_chofer', description: 'Detalle de un chofer: entregas, ingreso, pago aprox, ganancia aprox, claims, fallidos, tarifa, ciudad y desglose por semana.', input_schema: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] } },
  { name: 'get_ruta', description: 'Detalle de una ruta: paquetes, ingreso, $/paquete y desglose por semana.', input_schema: { type: 'object', properties: { ruta: { type: 'string' } }, required: ['ruta'] } },
  { name: 'get_top', description: 'Ranking de choferes o rutas por una métrica.', input_schema: { type: 'object', properties: { entidad: { type: 'string', enum: ['chofer', 'ruta'] }, metrica: { type: 'string', enum: ['ingreso', 'ganancia', 'entregas', 'claims', 'fallidos', 'porPaquete'] }, orden: { type: 'string', enum: ['desc', 'asc'] }, n: { type: 'number' } }, required: ['entidad', 'metrica'] } },
  { name: 'comparar_semanas', description: 'Compara dos semanas y da las diferencias.', input_schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['a', 'b'] } },
  { name: 'get_claims', description: 'Claims por chofer (conteo) en el historial; opcional filtrar por chofer.', input_schema: { type: 'object', properties: { chofer: { type: 'string' } } } },
  { name: 'get_fallidos', description: 'Paquetes fallidos por chofer + nombres sin asociar; opcional filtrar por chofer.', input_schema: { type: 'object', properties: { chofer: { type: 'string' } } } },
]
const NOMBRES_DATOS = new Set(TOOLS_DATOS.map((t) => t.name))
const NOMBRES_ACCION = new Set(['navegar', 'aplicar_filtro', 'generar_reporte'])

function toolsHabilitadas() {
  const tools = [...TOOLS_ACCION, ...TOOLS_DATOS]
  if (process.env.ASISTENTE_WEB_SEARCH !== 'off') tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 4 })
  return tools
}

// Acota TODOS los datos a UNA ciudad (para el rol admin fijado a su ciudad):
// filtra choferes/rutas/ciudades dentro de cada factura y recalcula los totales
// de esa factura solo con lo de la ciudad. Así JARVIS nunca ve otras ciudades.
function acotarACiudad(invoices, drivers, claims, ciudad) {
  if (!ciudad) return { invoices, drivers, claims }
  const drv = drivers.filter((d) => (d.ciudad || '') === ciudad)
  const nombresCiudad = new Set(drv.map((d) => norm(d.nombre)))
  // Claim de la ciudad: por su campo ciudad; si no lo trae, por su chofer de la ciudad.
  const cl = claims.filter((c) => (c.ciudad ? c.ciudad === ciudad : nombresCiudad.has(norm(c.courier))))
  // Descuento Gofo por factura (solo claims de la ciudad).
  const gofoPorInv = {}
  for (const c of cl) { const k = c.invoiceId || ''; gofoPorInv[k] = (gofoPorInv[k] || 0) + Math.abs(Number(c.montoGofo) || 0) }
  const invs = []
  for (const inv of invoices) {
    const chof = (inv.resumenChoferes || []).filter((c) => (c.ciudad || '') === ciudad)
    const rutas = (inv.resumenRutas || []).filter((r) => (r.ciudad || '') === ciudad)
    const ciuds = (inv.resumenCiudades || []).filter((c) => c.ubicacion === ciudad)
    // Si la factura no tiene NADA de esta ciudad, se descarta por completo.
    if (chof.length === 0 && ciuds.length === 0) continue
    const ind = chof.reduce((a, c) => a + num(c.individuales), 0)
    const dob = chof.reduce((a, c) => a + num(c.dobles), 0)
    invs.push({
      ...inv,
      resumenChoferes: chof,
      resumenRutas: rutas,
      resumenCiudades: ciuds,
      ingresoTotal: round(chof.reduce((a, c) => a + num(c.ingreso), 0)),
      totalIndividuales: ind,
      totalDobles: dob,
      totalPaquetes: ind + dob,
      totalClaims: chof.reduce((a, c) => a + num(c.numClaims), 0),
      totalFallidos: chof.reduce((a, c) => a + num(c.fallidos), 0),
      totalDescuentoGofo: round(gofoPorInv[inv.id] || 0),
      fallidosSinAsociar: [], // nombres sin ciudad: no se atribuyen a una ciudad
    })
  }
  return { invoices: invs, drivers: drv, claims: cl }
}

// ---- Carga de datos (una sola vez) + resumen ligero -------------------------
async function cargarDatos(db, companyId, ciudadFiltro = null) {
  const invSnap = await db.collection('invoices').where('companyId', '==', companyId).get()
  let invoices = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .map((i) => ({ ...i, _fi: fecha(i.fechaInicio) }))
    .sort((a, b) => (b._fi?.getTime() || 0) - (a._fi?.getTime() || 0))
  const drvSnap = await db.collection('drivers').where('companyId', '==', companyId).get()
  let drivers = drvSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  let ajustes = {}
  try { const s = await db.collection('settings').doc(companyId).get(); ajustes = s.exists ? s.data() : {} } catch { /* noop */ }
  // Claims (para la ganancia NETA por chofer, igual que la app). Mucho menos que paquetes.
  let claims = []
  try { const cs = await db.collection('claims').where('companyId', '==', companyId).get(); claims = cs.docs.map((d) => ({ id: d.id, ...d.data() })) } catch { /* noop */ }
  // Acota a la ciudad del admin (si aplica) ANTES de agregar/resumir.
  if (ciudadFiltro) {
    const r = acotarACiudad(invoices, drivers, claims, ciudadFiltro)
    invoices = r.invoices; drivers = r.drivers; claims = r.claims
  }
  const invById = {}; for (const i of invoices) invById[i.id] = i
  const claimNet = netoClaimsPorChofer(claims, invById)
  return { invoices, drivers, ajustes, claimNet }
}

function resumenLigero({ invoices, drivers, ajustes }, empresaNombre) {
  const semanas = invoices.slice(0, 6).map((i) => ({ semana: i.semana, ingreso: round(i.ingresoTotal), paquetes: num(i.totalPaquetes), claims: num(i.totalClaims), fallidos: num(i.totalFallidos) }))
  const ub = fecha(ajustes.ultimoBackupAuto)
  return {
    empresa: empresaNombre,
    hoy: new Date().toISOString().slice(0, 10),
    totales: {
      semanasRegistradas: invoices.length,
      choferes: drivers.length,
      ingresoUltimas6: round(semanas.reduce((a, s) => a + s.ingreso, 0)),
      paquetesUltimas6: semanas.reduce((a, s) => a + s.paquetes, 0),
    },
    ultimasSemanas: semanas,
    stripe: { choferesVerificados: drivers.filter((d) => d.stripeEstado === 'verificado').length, sinBanco: drivers.filter((d) => d.stripeEstado !== 'verificado').length },
    backups: { ultimoBackupAuto: ub ? ub.toISOString() : null },
    nota: 'Para historial, tendencias, detalle por chofer/ruta/claim/fallidos o comparativas, usa las herramientas get_*. No tienes los paquetes crudos: usa los agregados.',
  }
}

// ---- Agregadores para las tools de datos -----------------------------------
function aggChoferes(invoices, drivers, claimNet = {}) {
  const info = (nombre) => { const d = drivers.find((x) => norm(x.nombre) === norm(nombre)); return { ind: num(d?.tarifa ?? d?.rate ?? 0), dob: num(d?.tarifaDoble ?? d?.tarifa ?? d?.rate ?? 0), ciudad: d?.ciudad || null } }
  const map = {}
  for (const inv of invoices) for (const c of inv.resumenChoferes || []) {
    const t = (map[c.nombre] = map[c.nombre] || { nombre: c.nombre, individuales: 0, dobles: 0, entregas: 0, ingreso: 0, claims: 0, fallidos: 0, semanas: {} })
    t.individuales += num(c.individuales); t.dobles += num(c.dobles); t.entregas += num(c.individuales) + num(c.dobles)
    t.ingreso += num(c.ingreso); t.claims += num(c.numClaims); t.fallidos += num(c.fallidos)
    t.semanas[inv.semana] = { entregas: num(c.individuales) + num(c.dobles), ingreso: round(c.ingreso), claims: num(c.numClaims), fallidos: num(c.fallidos) }
  }
  return Object.values(map).map((t) => {
    const f = info(t.nombre)
    const pago = t.individuales * f.ind + t.dobles * f.dob
    // gananciaClaims neto = lo que cobras al chofer − lo que Gofo te descontó.
    const cn = claimNet[t.nombre] || { gananciaClaims: 0, descontadoGofo: 0 }
    // Ganancia NETA = ingreso bruto − pago + gananciaClaims (igual que la app).
    return { ...t, ingreso: round(t.ingreso), ciudad: f.ciudad, tarifa: f.ind, pagoAprox: round(pago), descontadoGofo: round(cn.descontadoGofo), gananciaAprox: round(t.ingreso - pago + cn.gananciaClaims) }
  })
}
function aggRutas(invoices) {
  const map = {}
  for (const inv of invoices) for (const r of inv.resumenRutas || []) {
    const t = (map[r.ruta] = map[r.ruta] || { ruta: r.ruta, ciudad: r.nombreCiudad || r.ciudad, paquetes: 0, ingreso: 0, semanas: {} })
    t.paquetes += num(r.paquetes); t.ingreso += num(r.ingreso); t.semanas[inv.semana] = { paquetes: num(r.paquetes), ingreso: round(r.ingreso) }
  }
  return Object.values(map).map((t) => ({ ...t, ingreso: round(t.ingreso), porPaquete: t.paquetes ? round(t.ingreso / t.paquetes) : 0 }))
}
function buscarSemana(invoices, txt) {
  const q = norm(txt)
  return invoices.find((i) => norm(i.semana).includes(q)) || null
}

function ejecutarToolDatos(name, input, invoices, drivers, claimNet) {
  try {
    if (name === 'get_historial') {
      const rows = [...invoices].sort((a, b) => (a._fi?.getTime() || 0) - (b._fi?.getTime() || 0))
        .map((i) => ({ semana: i.semana, ingreso: round(i.ingresoTotal), paquetes: num(i.totalPaquetes), individuales: num(i.totalIndividuales), dobles: num(i.totalDobles), claims: num(i.totalClaims), fallidos: num(i.totalFallidos), descuentoGofo: round(i.totalDescuentoGofo) }))
      return { semanas: rows }
    }
    if (name === 'get_resumen_semana') {
      const inv = buscarSemana(invoices, input.semana)
      if (!inv) return { error: 'No encontré esa semana.' }
      const chof = [...(inv.resumenChoferes || [])].sort((a, b) => num(b.ingreso) - num(a.ingreso)).slice(0, 8).map((c) => ({ nombre: c.nombre, entregas: num(c.individuales) + num(c.dobles), ingreso: round(c.ingreso), claims: num(c.numClaims), fallidos: num(c.fallidos) }))
      const rutas = [...(inv.resumenRutas || [])].sort((a, b) => num(b.ingreso) - num(a.ingreso)).slice(0, 8).map((r) => ({ ruta: r.ruta, paquetes: num(r.paquetes), ingreso: round(r.ingreso) }))
      return { semana: inv.semana, ingreso: round(inv.ingresoTotal), paquetes: num(inv.totalPaquetes), claims: num(inv.totalClaims), fallidos: num(inv.totalFallidos), descuentoGofo: round(inv.totalDescuentoGofo), topChoferes: chof, topRutas: rutas }
    }
    if (name === 'get_chofer') {
      const list = aggChoferes(invoices, drivers, claimNet)
      const c = list.find((x) => norm(x.nombre) === norm(input.nombre)) || list.find((x) => norm(x.nombre).includes(norm(input.nombre)))
      if (!c) return { error: 'No encontré ese chofer.' }
      return c
    }
    if (name === 'get_ruta') {
      const list = aggRutas(invoices)
      const r = list.find((x) => norm(x.ruta) === norm(input.ruta)) || list.find((x) => norm(x.ruta).includes(norm(input.ruta)))
      if (!r) return { error: 'No encontré esa ruta.' }
      return r
    }
    if (name === 'get_top') {
      const n = Math.min(15, Math.max(1, num(input.n) || 5))
      const metrica = input.metrica || 'ingreso'
      const orden = input.orden === 'asc' ? 1 : -1
      const list = input.entidad === 'ruta' ? aggRutas(invoices) : aggChoferes(invoices, drivers, claimNet)
      const ordenado = list.filter((x) => (metrica in x)).sort((a, b) => (num(a[metrica]) - num(b[metrica])) * orden).slice(0, n)
      return { entidad: input.entidad, metrica, orden: input.orden || 'desc', resultados: ordenado }
    }
    if (name === 'comparar_semanas') {
      const A = buscarSemana(invoices, input.a), B = buscarSemana(invoices, input.b)
      if (!A || !B) return { error: 'No encontré una de las semanas.' }
      const campos = ['ingresoTotal', 'totalPaquetes', 'totalClaims', 'totalFallidos', 'totalDescuentoGofo']
      const dif = {}
      for (const k of campos) dif[k] = round(num(B[k]) - num(A[k]))
      return { a: { semana: A.semana, ingreso: round(A.ingresoTotal), paquetes: num(A.totalPaquetes), claims: num(A.totalClaims), fallidos: num(A.totalFallidos) }, b: { semana: B.semana, ingreso: round(B.ingresoTotal), paquetes: num(B.totalPaquetes), claims: num(B.totalClaims), fallidos: num(B.totalFallidos) }, diferencias: dif }
    }
    if (name === 'get_claims') {
      let list = aggChoferes(invoices, drivers, claimNet).map((c) => ({ nombre: c.nombre, claims: c.claims })).filter((c) => c.claims > 0).sort((a, b) => b.claims - a.claims)
      if (input.chofer) list = list.filter((c) => norm(c.nombre).includes(norm(input.chofer)))
      return { total: list.reduce((a, c) => a + c.claims, 0), porChofer: list.slice(0, 30) }
    }
    if (name === 'get_fallidos') {
      let list = aggChoferes(invoices, drivers, claimNet).map((c) => ({ nombre: c.nombre, fallidos: c.fallidos })).filter((c) => c.fallidos > 0).sort((a, b) => b.fallidos - a.fallidos)
      if (input.chofer) list = list.filter((c) => norm(c.nombre).includes(norm(input.chofer)))
      const sinAsociar = (invoices[0]?.fallidosSinAsociar || []).map((s) => s.nombre || s).slice(0, 20)
      return { total: list.reduce((a, c) => a + c.fallidos, 0), porChofer: list.slice(0, 30), nombresSinAsociar: sinAsociar }
    }
    return { error: 'Herramienta desconocida.' }
  } catch (e) { return { error: 'Error consultando datos: ' + (e?.message || '') } }
}

function systemPrompt(resumen, nombre) {
  const n = nombre || 'Gabriele'
  return [
    `Eres JARVIS, el asistente de MilePay y SOCIO de confianza de ${n} (negocio de reparto).`,
    'PERSONALIDAD: cálido, cercano y natural, con algo de complicidad — como un socio, no un robot frío ni un mayordomo formal.',
    `Dirígete a la persona por su nombre (${n}) de vez en cuando, sin abusar. Celebra los logros y sé empático con los problemas. Tono humano.`,
    'Sé BREVE y conversacional (pensado para escucharse en voz). Claro y directo con los números.',
    'Detecta el idioma (español o inglés) y responde en el mismo, con la misma calidez.',
    'DATOS: tienes un RESUMEN ligero abajo. Para historial, tendencias, comparativas o detalle por chofer/ruta/claim/fallidos, USA las herramientas get_* (traen agregados reales; no tienes los paquetes crudos). Pide solo lo que necesites.',
    'BÚSQUEDA WEB: si la pregunta necesita información externa o actualizada del mundo real (precio de gasolina hoy, clima, noticias de logística, tipos de cambio, etc.), usa la herramienta de búsqueda web y DECIDE tú solo cuándo. Cuando uses info de internet, indícalo brevemente (ej. "según datos de hoy…"). Si se responde con mis datos, usa mis datos.',
    'ASESOR: además de informar, eres un asesor de negocio. Si te piden RECOMENDACIONES (o preguntan qué mejorar/dónde enfocarse), analiza con las tools (choferes, rutas, claims, fallidos, tendencias) y da 2-4 sugerencias PRIORIZADAS por impacto en dinero, cada una con el DATO que la respalda y una acción concreta. Son SUGERENCIAS para pensar, no órdenes: preséntalas como opciones a considerar, sin consejos drásticos (no "despide a X", sí "X viene con bajo rendimiento, quizá valga revisar su caso"). La decisión es de Gabriele. Si te pregunta "¿por qué?" o "¿cómo?", profundiza con datos.',
    'PRECISIÓN ANTE TODO: con MIS datos, exacto; con la web, aclara que es de internet. Nunca inventes; si no tienes el dato, dilo y ofrece buscarlo.',
    'Para abrir pantallas usa "navegar"; para acotar por fecha/ciudad "aplicar_filtro"; para exportar "generar_reporte". Para cambiar verificación o tarifa de un chofer usa "proponer_cambio" (NUNCA sin confirmación).',
    'LÍMITES: no puedes pagar, transferir, borrar, ni tocar configuración sensible. Consultar datos y buscar en internet es SOLO lectura/informativo.',
    'ÁNIMO: al FINAL añade en una línea aparte, EXACTAMENTE, [[mood:positivo]] | [[mood:neutro]] | [[mood:alerta]] (positivo=buenas noticias, alerta=problemas, neutro=normal). Es para el sistema; se ocultará.',
    'RESUMEN (datos reales de la empresa activa):',
    JSON.stringify(resumen),
  ].join('\n')
}

function extraerMood(texto) {
  let reply = texto || ''
  let mood = null
  const m = reply.match(/\[\[\s*mood\s*:\s*(positivo|neutro|alerta)\s*\]\]/i)
  if (m) { mood = m[1].toLowerCase(); reply = reply.replace(m[0], '').trim() }
  if (!mood) {
    const t = reply.toLowerCase()
    if (/(problema|ojo|cuidado|alerta|sin pagar|sin asociar|riesgo|preocup|cay[oó]|bajó|perd)/.test(t)) mood = 'alerta'
    else if (/(buena|excelente|subi[oó]|mejor|genial|creci[oó]|récord|record|felicidad)/.test(t)) mood = 'positivo'
    else mood = 'neutro'
  }
  return { reply, mood }
}

async function llamarAnthropic(apiKey, body) {
  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  const data = await resp.json().catch(() => null)
  if (!resp.ok) throw new Error(data?.error?.message || ('Anthropic ' + resp.status))
  return data
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' })
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(503).json({ ok: false, error: 'Falta ANTHROPIC_API_KEY en Vercel.' })

    let a
    try { a = await cargarAdmin(); ensureAdmin(a) } catch (e) {
      return res.status(503).json({ ok: false, error: e?.message === 'SIN_SERVICE_ACCOUNT' ? 'Falta FIREBASE_SERVICE_ACCOUNT_BASE64 en Vercel.' : 'No se pudo inicializar: ' + (e?.message || '') })
    }
    const auth = await autorizar(req, a)
    if (auth.error) return res.status(auth.code).json({ ok: false, error: auth.error })

    const { companyId, messages } = req.body || {}
    if (!companyId) return res.status(400).json({ ok: false, error: 'Falta companyId.' })
    const mismaEmpresa = auth.caller && auth.caller.companyId === companyId
    const esOwner = mismaEmpresa && auth.caller.role === 'owner'
    const esAdmin = mismaEmpresa && auth.caller.role === 'admin'
    if (!auth.esSuper && !esOwner && !esAdmin) return res.status(403).json({ ok: false, error: 'No tienes permiso para usar el asistente.' })
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ ok: false, error: 'Faltan mensajes.' })

    // El admin queda ACOTADO a su ciudad: JARVIS solo ve/analiza datos de esa ciudad.
    const ciudadFiltro = (esAdmin && auth.caller.ciudad) ? auth.caller.ciudad : null

    let empresaNombre = companyId
    try { const c = await auth.db.collection('companies').doc(companyId).get(); if (c.exists) empresaNombre = c.data().nombre || companyId } catch { /* noop */ }
    if (ciudadFiltro) empresaNombre = `${empresaNombre} · ciudad ${ciudadFiltro}`

    const datos = await cargarDatos(auth.db, companyId, ciudadFiltro)
    const resumen = resumenLigero(datos, empresaNombre)
    const nombreUsuario = (auth.caller && auth.caller.nombre) || auth.decoded.name || 'Gabriele'

    const convo = messages.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))
    const tools = toolsHabilitadas()

    const acciones = []
    let propuesta = null
    let reply = ''
    let usoWeb = false

    let convoMsgs = convo
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      const data = await llamarAnthropic(apiKey, { model: MODELO, max_tokens: 1500, system: systemPrompt(resumen, nombreUsuario), tools, messages: convoMsgs })
      const bloques = data.content || []
      const textos = bloques.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
      if (textos) reply = textos
      if (bloques.some((b) => b.type === 'server_tool_use' || b.type === 'web_search_tool_result')) usoWeb = true

      // La búsqueda web la ejecuta Anthropic sola; puede pedir continuar (pause_turn).
      if (data.stop_reason === 'pause_turn') { convoMsgs = [...convoMsgs, { role: 'assistant', content: bloques }]; continue }

      const toolUses = bloques.filter((b) => b.type === 'tool_use')
      if (data.stop_reason !== 'tool_use' || toolUses.length === 0) break

      const toolResults = []
      for (const tu of toolUses) {
        if (NOMBRES_DATOS.has(tu.name)) {
          const r = ejecutarToolDatos(tu.name, tu.input || {}, datos.invoices, datos.drivers, datos.claimNet)
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(r).slice(0, 12000) })
        } else if (tu.name === 'proponer_cambio') {
          if (!propuesta) propuesta = { ...tu.input }
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Propuesta mostrada al usuario para confirmación. No apliques nada más.' })
        } else if (NOMBRES_ACCION.has(tu.name)) {
          acciones.push({ tipo: tu.name, ...tu.input })
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Acción encolada; la app la ejecutará en el navegador.' })
        } else {
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'No disponible.' })
        }
      }
      convoMsgs = [...convoMsgs, { role: 'assistant', content: bloques }, { role: 'user', content: toolResults }]
    }

    if (!reply) reply = propuesta ? (propuesta.resumen || 'Propongo un cambio, confírmalo abajo.') : 'Listo.'
    const { reply: replyLimpio, mood } = extraerMood(reply)
    return res.status(200).json({ ok: true, reply: replyLimpio, mood, acciones, propuesta, usoWeb })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Error del asistente: ' + (e?.message || 'desconocido') })
  }
}
