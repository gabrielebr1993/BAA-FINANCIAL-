// ============================================================================
// PRUEBAS DE INTEGRACIÓN / BYPASS — Regla crítica de entregas.
// Verifican, contra el EMULADOR de Firestore con las reglas reales
// (firestore.rules), que NINGÚN cliente puede poner una orden en 'entregada'
// escribiendo directo a la base (equivale a llamar la API de Firestore a mano
// o manipular la app): la única vía es la Cloud Function bulkEntregarOrden.
//
// Ejecutar (requiere firebase-tools + Java, p. ej. en Cloud Shell):
//   npx firebase-tools emulators:exec --only firestore --project demo-seguridad \
//     "node --test test/"
// ============================================================================
import { test, before, after } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore'

const TENANT = 't_test'
let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-seguridad',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})
after(async () => { await env.cleanup() })

// Contextos autenticados con los MISMOS custom claims que usa la app real.
const ctx = (uid, claims) => env.authenticatedContext(uid, { bulkTenant: TENANT, ...claims }).firestore()
const admin = () => ctx('admin1', { bulkRole: 'admin', email: 'admin@test' })
const dispatcher = () => ctx('disp1', { bulkRole: 'dispatcher' })
const chofer = () => ctx('chofer1', { bulkRole: 'chofer', bulkCarrierId: 'carrier1' })
const supervisor = () => ctx('sup1', { bulkRole: 'supervisor_planta' })

// Siembra datos saltándose las reglas (equivale al Admin SDK del backend).
async function sembrar(id, orden) {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'bulk_orders', id), {
      tenantId: TENANT, numero: `T-${id}`, estado: 'en_destino',
      choferId: 'chofer1', transportistaId: 'carrier1', jobId: 'jobA', plantaId: 'plantaA',
      ...orden,
    })
  })
}
async function sembrarSupervisor() {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'bulk_users', 'sup1'), { tenantId: TENANT, rol: 'supervisor_planta', jobIds: ['jobA'] })
  })
}

// ── BYPASS: nadie escribe 'entregada' desde el cliente ──────────────────────
test('BYPASS: el CHOFER no puede marcar su orden como entregada por API directa', async () => {
  await sembrar('o1')
  await assertFails(updateDoc(doc(chofer(), 'bulk_orders', 'o1'), { estado: 'entregada' }))
})

test('BYPASS: ni siquiera el ADMIN puede escribir estado=entregada directo', async () => {
  await sembrar('o2')
  await assertFails(updateDoc(doc(admin(), 'bulk_orders', 'o2'), { estado: 'entregada' }))
  await assertFails(updateDoc(doc(dispatcher(), 'bulk_orders', 'o2'), { estado: 'entregada' }))
})

test('BYPASS: no se puede saltar directo a liberada sin pasar por entregada', async () => {
  await sembrar('o3')
  await sembrarSupervisor()
  await assertFails(updateDoc(doc(chofer(), 'bulk_orders', 'o3'), { estado: 'liberada' }))
  await assertFails(updateDoc(doc(admin(), 'bulk_orders', 'o3'), { estado: 'liberada' }))
  await assertFails(updateDoc(doc(supervisor(), 'bulk_orders', 'o3'), { estado: 'liberada' }))
})

test('BYPASS: una orden no puede NACER entregada/liberada (create manipulado)', async () => {
  await assertFails(setDoc(doc(dispatcher(), 'bulk_orders', 'nueva1'), { tenantId: TENANT, estado: 'entregada' }))
  await assertFails(setDoc(doc(admin(), 'bulk_orders', 'nueva2'), { tenantId: TENANT, estado: 'liberada' }))
  // Excepción documentada: datos de DEMO sembrados por un admin (demo:true).
  await assertSucceeds(setDoc(doc(admin(), 'bulk_orders', 'demo1'), { tenantId: TENANT, estado: 'entregada', demo: true }))
})

test('BYPASS: el secreto TOTP del supervisor es ilegible e inescribible', async () => {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'bulk_supervisorTotp', 'sup1'), { tenantId: TENANT, secreto: 'x' })
  })
  await assertFails(getDoc(doc(admin(), 'bulk_supervisorTotp', 'sup1')))
  await assertFails(getDoc(doc(supervisor(), 'bulk_supervisorTotp', 'sup1')))
  await assertFails(setDoc(doc(supervisor(), 'bulk_supervisorTotp', 'sup1'), { secreto: 'forjado' }))
})

test('BYPASS: nadie fabrica autorizaciones (bulk_liberaciones solo backend)', async () => {
  await assertFails(setDoc(doc(chofer(), 'bulk_liberaciones', 'o9'), { tenantId: TENANT, orderId: 'o9', resultado: 'valida' }))
  await assertFails(setDoc(doc(admin(), 'bulk_liberaciones', 'o9'), { tenantId: TENANT, orderId: 'o9', resultado: 'valida' }))
})

// ── Lo LEGÍTIMO sigue funcionando ───────────────────────────────────────────
test('el flujo operativo normal no se rompe (avances previos a la entrega)', async () => {
  await sembrar('o4', { estado: 'en_ruta' })
  await assertSucceeds(updateDoc(doc(chofer(), 'bulk_orders', 'o4'), { estado: 'en_destino' }))
})

test('LEGADO: una orden que YA estaba entregada sí puede liberarse (supervisor en alcance)', async () => {
  await sembrar('o5', { estado: 'entregada' })
  await sembrarSupervisor()
  await assertSucceeds(updateDoc(doc(supervisor(), 'bulk_orders', 'o5'), { estado: 'liberada' }))
})

test('el backend (Admin SDK, reglas apagadas) sí entrega — es la única puerta', async () => {
  await sembrar('o6')
  await env.withSecurityRulesDisabled(async (c) => {
    await updateDoc(doc(c.firestore(), 'bulk_orders', 'o6'), { estado: 'liberada' })
  })
  await env.withSecurityRulesDisabled(async (c) => {
    const s = await getDoc(doc(c.firestore(), 'bulk_orders', 'o6'))
    assert.strictEqual(s.data().estado, 'liberada')
  })
})
