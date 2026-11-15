// Pruebas del núcleo de roles/permisos de Walmart (módulo puro, sin Firebase).
//   node --test test/walmart-perms.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarPermisos, permisosConcedibles, warehousesAsignables, validarCambioPermisos,
  tienePermisoWal, enAlcanceAlmacen, PLANTILLA_ROL, TODOS_PERMISOS,
} from '../src/walmart/wmperms.js'

test('dependencias: un permiso sin su dependencia se apaga al normalizar', () => {
  const n = normalizarPermisos({ rutas_crear: true }) // falta rutas_ver
  assert.equal(n.rutas_crear, undefined)
  const ok = normalizarPermisos({ rutas_ver: true, rutas_crear: true })
  assert.equal(ok.rutas_crear, true)
})

test('cadena de dependencias (A→B→C): usuarios_roles necesita editar y crear', () => {
  assert.deepEqual(normalizarPermisos({ usuarios_roles: true }), {}) // sin crear/editar
  assert.deepEqual(
    normalizarPermisos({ usuarios_crear: true, usuarios_editar: true, usuarios_roles: true }),
    { usuarios_crear: true, usuarios_editar: true, usuarios_roles: true },
  )
})

test('plantilla admin NO otorga acceso total (finanzas y admin de usuarios OFF)', () => {
  const p = PLANTILLA_ROL.admin
  assert.ok(!p.fin_dashboard_ver && !p.fin_ingresos_ver)
  assert.ok(!p.usuarios_crear && !p.usuarios_roles)
  assert.ok(!p.pagos_ejecutar && !p.fp_ejecutar && !p.pagos_anular)
  // pero sí puede operar y ver pagos/FP
  assert.ok(p.rutas_ver && p.pagos_ver && p.fp_ver)
})

test('plantilla manager: sin finanzas ni pagos por defecto', () => {
  const p = PLANTILLA_ROL.manager
  assert.ok(p.rutas_ver && p.drivers_ver)
  assert.ok(!p.pagos_ver && !p.fp_ver && !p.fin_dashboard_ver)
})

test('tienePermisoWal: inactivo no tiene nada; dueño tiene todo', () => {
  assert.equal(tienePermisoWal({ rol: 'owner' }, 'fin_ingresos_ver'), true)
  assert.equal(tienePermisoWal({ owner: true }, 'usuarios_roles'), true)
  assert.equal(tienePermisoWal({ rol: 'manager', activo: false, permisos: { rutas_ver: true } }, 'rutas_ver'), false)
  assert.equal(tienePermisoWal({ rol: 'manager', permisos: { rutas_ver: true } }, 'rutas_ver'), true)
})

test('alcance por almacén: con warehouses asignados, fuera de alcance = sin permiso', () => {
  const perfil = { rol: 'manager', warehouses: ['alm1'], permisos: { rutas_ver: true } }
  assert.equal(tienePermisoWal(perfil, 'rutas_ver', { almacenId: 'alm1' }), true)
  assert.equal(tienePermisoWal(perfil, 'rutas_ver', { almacenId: 'alm2' }), false)
  assert.equal(enAlcanceAlmacen(perfil, 'alm2'), false)
  // sin warehouses = todos
  assert.equal(enAlcanceAlmacen({ rol: 'manager', warehouses: [] }, 'cualquiera'), true)
})

test('no se puede conceder un permiso que el editor no posee', () => {
  const editor = { rol: 'admin', permisos: { rutas_ver: true, usuarios_crear: true, usuarios_editar: true, usuarios_roles: true } }
  // intenta dar fin_ingresos_ver que el editor NO tiene
  const r = validarCambioPermisos(editor, { uid: 'otro' }, { permisos: { fin_dashboard_ver: true, fin_ingresos_ver: true }, warehouses: [] }, ['alm1'])
  assert.equal(r.ok, false)
  // dar solo rutas_ver (que sí tiene) → ok
  const r2 = validarCambioPermisos(editor, { uid: 'otro' }, { permisos: { rutas_ver: true }, warehouses: [] }, ['alm1'])
  assert.equal(r2.ok, true)
})

test('anti auto-elevación: no puedes editar tus propios permisos (salvo dueño)', () => {
  const editor = { uid: 'u1', email: 'a@b.com', rol: 'admin', permisos: { usuarios_crear: true, usuarios_editar: true, usuarios_roles: true } }
  const r = validarCambioPermisos(editor, { uid: 'u1', email: 'a@b.com' }, { permisos: { usuarios_crear: true }, warehouses: [] }, ['alm1'])
  assert.equal(r.ok, false)
  // el dueño sí puede editarse
  const dueno = { uid: 'own', rol: 'owner', owner: true }
  assert.equal(validarCambioPermisos(dueno, { uid: 'own' }, { permisos: { fin_ingresos_ver: true }, warehouses: [] }, ['alm1']).ok, true)
})

test('no se puede asignar un almacén que el editor no administra', () => {
  const editor = { rol: 'admin', warehouses: ['alm1'], permisos: { rutas_ver: true, usuarios_crear: true, usuarios_editar: true, usuarios_warehouses: true, usuarios_roles: true } }
  const r = validarCambioPermisos(editor, { uid: 'x' }, { permisos: { rutas_ver: true }, warehouses: ['alm2'] }, ['alm1', 'alm2'])
  assert.equal(r.ok, false)
  const r2 = validarCambioPermisos(editor, { uid: 'x' }, { permisos: { rutas_ver: true }, warehouses: ['alm1'] }, ['alm1', 'alm2'])
  assert.equal(r2.ok, true)
})

test('permisosConcedibles / warehousesAsignables: dueño todo, otro solo lo suyo', () => {
  assert.equal(permisosConcedibles({ owner: true }).length, TODOS_PERMISOS.length)
  assert.deepEqual(permisosConcedibles({ rol: 'manager', permisos: { rutas_ver: true } }), ['rutas_ver'])
  assert.deepEqual(warehousesAsignables({ owner: true }, ['a', 'b']), ['a', 'b'])
  assert.deepEqual(warehousesAsignables({ rol: 'admin', warehouses: ['a'] }, ['a', 'b']), ['a'])
})
