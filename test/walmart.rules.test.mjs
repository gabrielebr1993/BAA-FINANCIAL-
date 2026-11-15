// ============================================================================
// PRUEBAS DE REGLAS — Permisos del submódulo WALMART (wal_*).
// Contra el EMULADOR con firestore.rules reales. Verifican que:
//   · el DUEÑO nunca queda bloqueado;
//   · un usuario sin doc wal_usuarios no accede a nada;
//   · el alcance por almacén se respeta en lectura/escritura;
//   · se separan ver / crear / ejecutar / anular;
//   · nadie edita su propio doc de permisos (anti auto-elevación).
//
// Ejecutar (requiere firebase-tools + Java):
//   npx firebase-tools emulators:exec --only firestore --project demo-seguridad \
//     "node --test test/walmart.rules.test.mjs"
// ============================================================================
import { test, before, after } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'

const OWNER_EMAIL = 'gabriele.brandonisio.o@gmail.com'
let env
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-seguridad',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})
after(async () => { await env.cleanup() })

const ctx = (uid, email) => env.authenticatedContext(uid, email ? { email } : {}).firestore()
const owner = () => ctx('owner', OWNER_EMAIL)
const manager = () => ctx('mgr', 'mgr@test.com')
const forastero = () => ctx('nadie', 'nadie@test.com')

async function sembrar(path, id, data) {
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), path, id), data) })
}
async function seedBase() {
  // Manager: ve/crea rutas solo en alm1; sin finanzas.
  await sembrar('wal_usuarios', 'mgr@test.com', {
    email: 'mgr@test.com', rol: 'manager', activo: true,
    permisos: { rutas_ver: true, rutas_crear: true, drivers_ver: true },
    warehouses: ['alm1'],
  })
  await sembrar('wal_rutas', 'r_alm1', { almacenId: 'alm1', driverId: 'd1', estado: 'completada', fecha: '2026-11-16' })
  await sembrar('wal_rutas', 'r_alm2', { almacenId: 'alm2', driverId: 'd2', estado: 'completada', fecha: '2026-11-16' })
  await sembrar('wal_cobros', 'c1', { almacenId: 'alm1', monto: 100 })
}

test('DUEÑO: acceso total a cualquier colección wal_*', async () => {
  await seedBase()
  await assertSucceeds(getDoc(doc(owner(), 'wal_rutas', 'r_alm2')))
  await assertSucceeds(setDoc(doc(owner(), 'wal_config', 'tarifas'), { ingresoWalmart: 340 }))
  await assertSucceeds(getDoc(doc(owner(), 'wal_cobros', 'c1')))
})

test('SIN doc wal_usuarios: no accede a nada', async () => {
  await seedBase()
  await assertFails(getDoc(doc(forastero(), 'wal_rutas', 'r_alm1')))
  await assertFails(setDoc(doc(forastero(), 'wal_rutas', 'x'), { almacenId: 'alm1' }))
  await assertFails(getDoc(doc(forastero(), 'wal_cobros', 'c1')))
})

test('ALCANCE: manager de alm1 lee su almacén, NO el de alm2', async () => {
  await seedBase()
  await assertSucceeds(getDoc(doc(manager(), 'wal_rutas', 'r_alm1')))
  await assertFails(getDoc(doc(manager(), 'wal_rutas', 'r_alm2')))
})

test('ALCANCE: manager crea ruta en alm1 pero NO en alm2', async () => {
  await seedBase()
  await assertSucceeds(setDoc(doc(manager(), 'wal_rutas', 'nueva1'), { almacenId: 'alm1', estado: 'pendiente', fecha: '2026-11-16' }))
  await assertFails(setDoc(doc(manager(), 'wal_rutas', 'nueva2'), { almacenId: 'alm2', estado: 'pendiente', fecha: '2026-11-16' }))
})

test('SEPARACIÓN: manager sin pagos_ver no lee pagos; sin fin_ingresos_ver no lee cobros', async () => {
  await seedBase()
  await sembrar('wal_pagos', 'p1', { tipo: 'fastpay', driverId: 'd1', estado: 'confirmado', bruto: 100 })
  await assertFails(getDoc(doc(manager(), 'wal_pagos', 'p1')))
  await assertFails(getDoc(doc(manager(), 'wal_cobros', 'c1')))
})

test('SEPARACIÓN: sin fp_ejecutar no puede crear Fast Pay; con permiso sí', async () => {
  await seedBase()
  // manager base no tiene fp_*
  await assertFails(setDoc(doc(manager(), 'wal_pagos', 'fp_x'), { tipo: 'fastpay', bruto: 100, estado: 'confirmado' }))
  // concede fp_preparar
  await sembrar('wal_usuarios', 'mgr@test.com', {
    email: 'mgr@test.com', rol: 'manager', activo: true,
    permisos: { rutas_ver: true, fp_ver: true, fp_preparar: true }, warehouses: ['alm1'],
  })
  await assertSucceeds(setDoc(doc(manager(), 'wal_pagos', 'fp_y'), { tipo: 'fastpay', bruto: 100, estado: 'pendiente' }))
})

test('ANTI AUTO-ELEVACIÓN: ni con usuarios_roles puede editar su PROPIO doc', async () => {
  await seedBase()
  // admin con usuarios_roles
  await sembrar('wal_usuarios', 'adm@test.com', {
    email: 'adm@test.com', rol: 'admin', activo: true,
    permisos: { usuarios_crear: true, usuarios_editar: true, usuarios_roles: true }, warehouses: [],
  })
  const adm = ctx('adm', 'adm@test.com')
  // editar su PROPIO doc → falla
  await assertFails(updateDoc(doc(adm, 'wal_usuarios', 'adm@test.com'), { permisos: { usuarios_crear: true, fin_ingresos_ver: true } }))
  // crear OTRO usuario → ok
  await assertSucceeds(setDoc(doc(adm, 'wal_usuarios', 'otro@test.com'), { email: 'otro@test.com', rol: 'manager', activo: true, permisos: { rutas_ver: true }, warehouses: ['alm1'] }))
})

test('wal_usuarios: cada quien LEE su propio doc; no el de otro (si no administra)', async () => {
  await seedBase()
  await assertSucceeds(getDoc(doc(manager(), 'wal_usuarios', 'mgr@test.com')))
  await sembrar('wal_usuarios', 'otro@test.com', { email: 'otro@test.com', rol: 'manager', activo: true, permisos: {}, warehouses: [] })
  await assertFails(getDoc(doc(manager(), 'wal_usuarios', 'otro@test.com')))
})

test('INACTIVO: un usuario desactivado pierde el acceso', async () => {
  await seedBase()
  await sembrar('wal_usuarios', 'mgr@test.com', {
    email: 'mgr@test.com', rol: 'manager', activo: false,
    permisos: { rutas_ver: true }, warehouses: ['alm1'],
  })
  await assertFails(getDoc(doc(manager(), 'wal_rutas', 'r_alm1')))
})
