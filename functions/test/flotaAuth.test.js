const { test } = require('node:test')
const assert = require('node:assert/strict')
const { puedeVerFlota } = require('../flotaAuth')

test('puedeVerFlota permite superadmin por correo aunque no tenga perfil', () => {
  assert.equal(puedeVerFlota(null, 'gabriele.brandonisio.o@gmail.com'), true)
})

test('puedeVerFlota permite owner, superAdmin y usuarios con verDashboard', () => {
  assert.equal(puedeVerFlota({ role: 'owner' }, 'owner@test.com'), true)
  assert.equal(puedeVerFlota({ superAdmin: true, role: 'manager' }, 'admin@test.com'), true)
  assert.equal(puedeVerFlota({ role: 'manager', permissions: { verDashboard: true } }, 'mgr@test.com'), true)
})

test('puedeVerFlota rechaza choferes y usuarios sin permiso de dashboard', () => {
  assert.equal(puedeVerFlota({ role: 'driver', permissions: { verDashboard: true } }, 'drv@test.com'), false)
  assert.equal(puedeVerFlota({ role: 'manager', permissions: { verPagos: true } }, 'mgr@test.com'), false)
  assert.equal(puedeVerFlota(null, 'unknown@test.com'), false)
})
