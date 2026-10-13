// ============================================================================
// PLAID · Conciliación bancaria AUTOMÁTICA de cheques (módulo Warehouse).
//
// Flujo: el dueño conecta su banco una vez (Plaid Link desde la app). El
// access_token se guarda en la colección `plaid_items`, que NO está expuesta
// en firestore.rules (ningún cliente puede leerla; solo estas functions con
// el SDK admin). Cada 6 horas (y a demanda con "Sincronizar ahora") se piden
// los movimientos nuevos con transactions/sync y:
//   · cheque del banco con número → se busca en wh_cheques por numeroNorm:
//     - importe coincide (±$0.01) → estado 'cobrado' + historial + fechaCobro
//     - importe distinto → se marca revisarBanco (nunca se adivina)
//     - cheque ANULADO que aparece cobrado → alerta en auditoría
//   · sin número de cheque no se marca nada (un retiro cualquiera no es un
//     cheque): la conciliación manual por archivo sigue disponible.
// El resumen de cada corrida queda en wh_pc_config/plaid (legible por el
// dueño) y en wh_audit. Idempotente: cursor de Plaid + cheques ya cobrados
// no se tocan dos veces.
//
// Secretos (Cloud Shell):
//   firebase functions:secrets:set PLAID_CLIENT_ID
//   firebase functions:secrets:set PLAID_SECRET
// ============================================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin = require('firebase-admin')

const DUENO = 'gabriele.brandonisio.o@gmail.com'
const SECRETS = ['PLAID_CLIENT_ID', 'PLAID_SECRET']

const db = () => admin.firestore()

const hostPlaid = (entorno) => `https://${entorno === 'sandbox' ? 'sandbox' : 'production'}.plaid.com`

async function plaidPost(entorno, ruta, cuerpo) {
  const r = await fetch(hostPlaid(entorno) + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...cuerpo,
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`Plaid ${ruta}: ${j.error_code || r.status} ${j.error_message || ''}`)
  return j
}

const normalizarNumero = (n) => String(n || '').replace(/\D/g, '').replace(/^0+/, '') || '0'
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

async function auditar(accion, detalle) {
  await db().collection('wh_audit').add({
    accion, detalle: String(detalle || ''), correo: 'functions/plaid',
    fecha: admin.firestore.FieldValue.serverTimestamp(),
  })
}

// ── Sincronización (programada y a demanda) ────────────────────────────────
async function sincronizar() {
  const items = await db().collection('plaid_items').get()
  if (items.empty) return { items: 0, cobrados: 0, revisar: 0, alertas: 0, sinNumero: 0 }
  let cobrados = 0, revisar = 0, alertas = 0, sinNumero = 0
  for (const itemDoc of items.docs) {
    const item = itemDoc.data()
    let cursor = item.cursor || undefined
    let hasMore = true
    const transacciones = []
    while (hasMore) {
      const r = await plaidPost(item.entorno, '/transactions/sync', {
        access_token: item.access_token,
        cursor,
        count: 250,
        options: { include_original_description: true },
      })
      transacciones.push(...(r.added || []))
      cursor = r.next_cursor
      hasMore = r.has_more
    }
    for (const tx of transacciones) {
      // número de cheque: campo propio de Plaid o extraído de la descripción
      let numero = tx.check_number
      if (!numero) {
        const texto = `${tx.name || ''} ${tx.original_description || ''}`
        const m = texto.match(/check\s*#?\s*(\d{3,})/i) || texto.match(/\bcheque\s*#?\s*(\d{3,})/i)
        if (m) numero = m[1]
      }
      if (!numero) { sinNumero++; continue }
      const norm = normalizarNumero(numero)
      // en Plaid los cargos salen con monto POSITIVO
      const monto = r2(Math.abs(tx.amount))
      const q = await db().collection('wh_cheques').where('numeroNorm', '==', norm).get()
      if (q.empty) continue
      for (const chDoc of q.docs) {
        const ch = chDoc.data()
        if (ch.origen === 'historico') continue
        if (ch.estado === 'cancelado') {
          alertas++
          await auditar('plaid_alerta_cancelado_cobrado', `cheque #${numero} ANULADO aparece cobrado en el banco por $${monto} (${tx.date})`)
          await chDoc.ref.set({ revisarBanco: `anulado pero cobrado en banco $${monto} ${tx.date}` }, { merge: true })
          continue
        }
        if (ch.estado === 'cobrado') continue // idempotente
        if (Math.abs(r2(ch.importe) - monto) <= 0.01) {
          cobrados++
          await chDoc.ref.set({
            estado: 'cobrado', fechaCobro: tx.date || null,
            cobro: { via: 'plaid', txId: tx.transaction_id, importe: monto, fecha: tx.date || null },
            historial: admin.firestore.FieldValue.arrayUnion({ accion: 'cobrado', fecha: new Date().toISOString(), por: 'Plaid (automático)', nota: `banco ${tx.date} $${monto}` }),
          }, { merge: true })
        } else {
          revisar++
          await chDoc.ref.set({ revisarBanco: `banco cobró $${monto} el ${tx.date}, el cheque dice $${r2(ch.importe)}` }, { merge: true })
          await auditar('plaid_diferencia_importe', `cheque #${numero}: banco $${monto} vs emitido $${r2(ch.importe)}`)
        }
      }
    }
    await itemDoc.ref.set({ cursor, ultimoSync: new Date().toISOString() }, { merge: true })
  }
  const resumen = { items: items.size, cobrados, revisar, alertas, sinNumero, fecha: new Date().toISOString() }
  await db().collection('wh_pc_config').doc('plaid').set({ conectado: true, ultimoSync: resumen }, { merge: true })
  await auditar('plaid_sync', `cobrados ${cobrados} · a revisar ${revisar} · alertas ${alertas}`)
  return resumen
}

// Corre sola cada 6 horas.
exports.plaidSync = onSchedule({ schedule: 'every 6 hours', secrets: SECRETS, timeoutSeconds: 300 }, async () => {
  try { await sincronizar() } catch (e) { await auditar('plaid_sync_error', e.message || String(e)) }
})

// Operaciones desde la app (solo el dueño). Los errores de Plaid se devuelven
// con su mensaje real (si no, el cliente solo ve un "INTERNAL" inservible).
exports.plaidOp = onCall({ secrets: SECRETS, timeoutSeconds: 120 }, async (req) => {
  try {
    return await operar(req)
  } catch (e) {
    if (e instanceof HttpsError) throw e
    throw new HttpsError('failed-precondition', e.message || String(e))
  }
})

async function operar(req) {
  const email = String(req.auth?.token?.email || '').toLowerCase()
  if (email !== DUENO) throw new HttpsError('permission-denied', 'Solo el dueño puede operar Plaid.')
  const { op, entorno = 'production', publicToken } = req.data || {}

  if (op === 'link_token') {
    const r = await plaidPost(entorno, '/link/token/create', {
      user: { client_user_id: req.auth.uid },
      client_name: 'MilePay',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'es',
    })
    return { linkToken: r.link_token }
  }

  if (op === 'exchange') {
    if (!publicToken) throw new HttpsError('invalid-argument', 'Falta el public_token.')
    const r = await plaidPost(entorno, '/item/public_token/exchange', { public_token: publicToken })
    let institucion = ''
    try {
      const it = await plaidPost(entorno, '/item/get', { access_token: r.access_token })
      if (it.item?.institution_id) {
        const inst = await plaidPost(entorno, '/institutions/get_by_id', { institution_id: it.item.institution_id, country_codes: ['US'] })
        institucion = inst.institution?.name || ''
      }
    } catch { /* el nombre es cosmético */ }
    await db().collection('plaid_items').doc(r.item_id).set({
      access_token: r.access_token, entorno, institucion,
      cursor: null, creadoEn: new Date().toISOString(), creadoPor: email,
    })
    await db().collection('wh_pc_config').doc('plaid').set({ conectado: true, entorno, institucion, conectadoEn: new Date().toISOString() }, { merge: true })
    await auditar('plaid_conectado', `${institucion || 'banco'} (${entorno})`)
    return { ok: true, institucion }
  }

  if (op === 'sync_now') {
    return await sincronizar()
  }

  if (op === 'desconectar') {
    const items = await db().collection('plaid_items').get()
    for (const d of items.docs) {
      try { await plaidPost(d.data().entorno, '/item/remove', { access_token: d.data().access_token }) } catch { /* ya removido */ }
      await d.ref.delete()
    }
    await db().collection('wh_pc_config').doc('plaid').set({ conectado: false, desconectadoEn: new Date().toISOString() }, { merge: true })
    await auditar('plaid_desconectado', `${items.size} conexión(es) eliminadas`)
    return { ok: true }
  }

  throw new HttpsError('invalid-argument', 'Operación desconocida.')
}
