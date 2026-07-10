// ---------------------------------------------------------------------------
// Cerebro del asistente "JARVIS" de MilePay.
// - Valida sesión + rol (owner/súper-admin) + companyId (en el BACKEND).
// - Construye un CONTEXTO con datos reales de Firestore (empresa activa).
// - Llama a la API de Anthropic (Claude) con TOOL USE para acciones seguras.
// - Devuelve: { ok, reply, acciones[], propuesta? }.
//   * Las CONSULTAS se responden con el contexto (texto).
//   * Las ACCIONES (navegar/filtrar/reporte) se devuelven al frontend para que
//     las ejecute el navegador. Los CAMBIOS van como "propuesta" y requieren
//     confirmación explícita (se ejecutan en /api/asistente-accion).
// LÍMITES DUROS: aquí NO existen herramientas para pagar, transferir, borrar,
// ni tocar configuración sensible. Aunque el modelo lo pida, no hay forma.
// ---------------------------------------------------------------------------
import { cargarAdmin, ensureAdmin, autorizar } from './_common.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

// ---- Herramientas seguras que el modelo puede pedir (solo acciones seguras) ----
const TOOLS = [
  {
    name: 'navegar',
    description: 'Lleva al usuario a una sección de la app. Úsalo cuando pida abrir/ir/mostrar una pantalla.',
    input_schema: {
      type: 'object',
      properties: {
        seccion: { type: 'string', enum: ['dashboard', 'pagos', 'choferes', 'rutas', 'claims', 'financiero', 'performance', 'alertas', 'reclamos', 'configuracion', 'stripe', 'backups', 'historial'] },
      },
      required: ['seccion'],
    },
  },
  {
    name: 'aplicar_filtro',
    description: 'Aplica el filtro global de fechas y/o ciudad para acotar los datos que ve el usuario.',
    input_schema: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: ['ultima', 'ultimas4', 'esteMes', 'mesPasado', 'esteTrimestre', 'esteAno', 'todo'], description: 'Atajo de rango. Usa esto o desde/hasta.' },
        desde: { type: 'string', description: 'Fecha inicio YYYY-MM-DD (rango personalizado).' },
        hasta: { type: 'string', description: 'Fecha fin YYYY-MM-DD (rango personalizado).' },
        ciudad: { type: 'string', description: 'Código o nombre de ciudad; "todas" para quitar el filtro.' },
      },
    },
  },
  {
    name: 'generar_reporte',
    description: 'Exporta un reporte de la sección indicada con los datos actuales.',
    input_schema: {
      type: 'object',
      properties: {
        seccion: { type: 'string', enum: ['dashboard', 'pagos', 'choferes', 'rutas', 'performance', 'financiero'] },
        formato: { type: 'string', enum: ['excel', 'pdf'] },
      },
      required: ['seccion', 'formato'],
    },
  },
  {
    name: 'proponer_cambio',
    description: 'Propone un cambio NO sensible que el usuario debe CONFIRMAR antes de aplicarse. Nunca se aplica solo. Úsalo solo para: cambiar el estatus de verificación de un chofer, o editar la tarifa (rate) de un chofer.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['verificacion_estado', 'tarifa_chofer'] },
        driverNombre: { type: 'string', description: 'Nombre del chofer afectado.' },
        estado: { type: 'string', enum: ['pendiente', 'aprobado', 'rechazado'], description: 'Solo para verificacion_estado.' },
        tarifa: { type: 'number', description: 'Nueva tarifa por entrega. Solo para tarifa_chofer.' },
        resumen: { type: 'string', description: 'Frase corta describiendo el cambio para mostrar al usuario.' },
      },
      required: ['tipo', 'driverNombre', 'resumen'],
    },
  },
]

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0)
const fecha = (t) => { try { return t?.toDate ? t.toDate() : (t?.seconds ? new Date(t.seconds * 1000) : null) } catch { return null } }

// Construye un resumen compacto (datos reales) para alimentar al modelo.
async function construirContexto(db, companyId, empresaNombre) {
  const invSnap = await db.collection('invoices').where('companyId', '==', companyId).get()
  const invoices = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .map((i) => ({ ...i, _fi: fecha(i.fechaInicio) }))
    .sort((a, b) => (b._fi?.getTime() || 0) - (a._fi?.getTime() || 0))

  const drvSnap = await db.collection('drivers').where('companyId', '==', companyId).get()
  const drivers = drvSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  let ajustes = {}
  try { const s = await db.collection('settings').doc(companyId).get(); ajustes = s.exists ? s.data() : {} } catch { /* noop */ }

  const semanas = invoices.slice(0, 8).map((i) => ({
    semana: i.semana, ingreso: num(i.ingresoTotal), paquetes: num(i.totalPaquetes),
    individuales: num(i.totalIndividuales), dobles: num(i.totalDobles),
    claims: num(i.totalClaims), fallidos: num(i.totalFallidos), descuentoGofo: num(i.totalDescuentoGofo),
  }))

  // Rutas agregadas de las últimas 4 semanas → rentabilidad por paquete.
  const rutaAgg = {}
  for (const inv of invoices.slice(0, 4)) {
    for (const r of inv.resumenRutas || []) {
      const t = (rutaAgg[r.ruta] = rutaAgg[r.ruta] || { ruta: r.ruta, ciudad: r.nombreCiudad || r.ciudad, ingreso: 0, paquetes: 0, pesoLb: 0 })
      t.ingreso += num(r.ingreso); t.paquetes += num(r.paquetes); t.pesoLb += num(r.pesoTotalLb)
    }
  }
  const rutas = Object.values(rutaAgg).map((r) => ({ ...r, porPaquete: r.paquetes ? +(r.ingreso / r.paquetes).toFixed(2) : 0 }))
    .filter((r) => r.paquetes > 0).sort((a, b) => b.porPaquete - a.porPaquete)
  const rutasTop = rutas.slice(0, 5)
  const rutasBottom = rutas.slice(-5).reverse()

  // Fallidos por chofer (última semana) y nombres sin asociar.
  const ultima = invoices[0] || {}
  const fallidosUltima = Object.entries(ultima.fallidosPorChofer || {}).map(([nombre, n]) => ({ nombre, fallidos: n }))
    .sort((a, b) => b.fallidos - a.fallidos).slice(0, 8)
  const sinAsociar = (ultima.fallidosSinAsociar || []).map((s) => s.nombre || s).slice(0, 20)

  // Choferes: verificación / Stripe / tarifa.
  const choferes = {
    total: drivers.length,
    conStripeVerificado: drivers.filter((d) => d.stripeEstado === 'verificado').length,
    sinStripe: drivers.filter((d) => !d.stripeAccountId).length,
    verificacionAprobada: drivers.filter((d) => d.verificacion?.estado === 'aprobado').length,
    conTarifa: drivers.filter((d) => num(d.tarifa) > 0 || num(d.rate) > 0).length,
    lista: drivers.slice(0, 60).map((d) => ({ nombre: d.nombre, tarifa: num(d.tarifa) || num(d.rate) || null, stripe: d.stripeEstado || 'sin_registrar', verificacion: d.verificacion?.estado || 'pendiente' })),
  }

  const ub = fecha(ajustes.ultimoBackupAuto)
  return {
    empresa: empresaNombre || companyId,
    hoy: new Date().toISOString().slice(0, 10),
    totales: {
      semanasRegistradas: invoices.length,
      ingresoUltimas8: +semanas.reduce((a, s) => a + s.ingreso, 0).toFixed(2),
      paquetesUltimas8: semanas.reduce((a, s) => a + s.paquetes, 0),
      claimsUltimas8: semanas.reduce((a, s) => a + s.claims, 0),
      fallidosUltimas8: semanas.reduce((a, s) => a + s.fallidos, 0),
    },
    semanas,
    rutasMasRentables: rutasTop,
    rutasMenosRentables: rutasBottom,
    ultimaSemana: { semana: ultima.semana || null, fallidosPorChofer: fallidosUltima, nombresSinAsociar: sinAsociar },
    choferes,
    backups: { ultimoBackupAuto: ub ? ub.toISOString() : null },
  }
}

function systemPrompt(ctx, nombre) {
  const n = nombre || 'Gabriele'
  return [
    `Eres JARVIS, el asistente de MilePay y SOCIO de confianza de ${n} (negocio de reparto).`,
    'PERSONALIDAD: cálido, cercano y natural, con algo de complicidad — como un socio, no un robot frío ni un mayordomo formal.',
    `Dirígete a la persona por su nombre (${n}) de vez en cuando, sin abusar.`,
    'Celebra los logros ("¡Buena semana, subiste el margen!") y sé empático con los problemas ("Ojo, tenemos un tema con unos claims"). Tono humano, no acartonado.',
    'Sé BREVE y conversacional: respuestas pensadas para escucharse en voz, no textos largos. Claro y directo con los números.',
    'Detecta el idioma (español o inglés) y responde en el mismo, con la misma calidez.',
    'PRECISIÓN ANTE TODO: usa SOLO los datos reales del CONTEXTO. Nunca inventes cifras; si no tienes el dato, dilo con naturalidad y ofrece buscarlo. La calidez no justifica exagerar ni inventar.',
    'Cuando pida abrir/mostrar una pantalla, usa "navegar". Para acotar por fecha/ciudad usa "aplicar_filtro". Para exportar usa "generar_reporte".',
    'Para cambiar el estatus de verificación de un chofer o su tarifa, usa "proponer_cambio": NUNCA se aplica sin confirmación.',
    'LÍMITES: no puedes pagar, transferir dinero, borrar nada, ni tocar configuración sensible (claves, Stripe, permisos, datos bancarios). No tienes herramientas para eso. Si te lo piden, explícalo con amabilidad.',
    'ÁNIMO: al FINAL de tu respuesta añade en una línea aparte una etiqueta oculta con el ánimo de la noticia, EXACTAMENTE así: [[mood:positivo]] o [[mood:neutro]] o [[mood:alerta]]. positivo = buenas noticias; alerta = problemas/preocupación; neutro = información normal. Esta etiqueta es para el sistema (se ocultará al usuario).',
    'CONTEXTO (datos reales de la empresa activa):',
    JSON.stringify(ctx),
  ].join('\n')
}

// Extrae y quita la etiqueta [[mood:...]] del texto. Si falta, infiere por palabras.
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
    // Rol: solo owner de esa empresa o súper-admin.
    const esOwner = auth.caller && auth.caller.role === 'owner' && auth.caller.companyId === companyId
    if (!auth.esSuper && !esOwner) return res.status(403).json({ ok: false, error: 'Solo el dueño o súper-admin pueden usar el asistente.' })
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ ok: false, error: 'Faltan mensajes.' })

    // Nombre de empresa (para el contexto).
    let empresaNombre = companyId
    try { const c = await auth.db.collection('companies').doc(companyId).get(); if (c.exists) empresaNombre = c.data().nombre || companyId } catch { /* noop */ }

    const ctx = await construirContexto(auth.db, companyId, empresaNombre)
    // Nombre para el trato personal (cae a "Gabriele" si no hay perfil).
    const nombreUsuario = (auth.caller && auth.caller.nombre) || auth.decoded.name || 'Gabriele'

    // Normaliza mensajes del cliente a formato Anthropic (solo role/content string).
    const convo = messages.slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }))

    const acciones = []
    let propuesta = null
    let reply = ''

    // Bucle de tool use (máx 3 vueltas). Nuestras tools son acciones de cliente:
    // se acusan recibo y se recolectan; no ejecutan nada peligroso en el servidor.
    let convoMsgs = convo
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      const data = await llamarAnthropic(apiKey, {
        model: MODELO, max_tokens: 1024, system: systemPrompt(ctx, nombreUsuario), tools: TOOLS, messages: convoMsgs,
      })
      const bloques = data.content || []
      reply = bloques.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || reply
      const toolUses = bloques.filter((b) => b.type === 'tool_use')
      if (data.stop_reason !== 'tool_use' || toolUses.length === 0) break

      const toolResults = []
      for (const tu of toolUses) {
        if (tu.name === 'proponer_cambio') {
          if (!propuesta) propuesta = { ...tu.input }
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Propuesta mostrada al usuario para confirmación. No apliques nada más.' })
        } else {
          acciones.push({ tipo: tu.name, ...tu.input })
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Acción encolada; la app la ejecutará en el navegador.' })
        }
      }
      convoMsgs = [...convoMsgs, { role: 'assistant', content: bloques }, { role: 'user', content: toolResults }]
    }

    if (!reply) reply = propuesta ? (propuesta.resumen || 'Propongo un cambio, confírmalo abajo.') : 'Listo.'
    const { reply: replyLimpio, mood } = extraerMood(reply)
    return res.status(200).json({ ok: true, reply: replyLimpio, mood, acciones, propuesta })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'Error del asistente: ' + (e?.message || 'desconocido') })
  }
}
