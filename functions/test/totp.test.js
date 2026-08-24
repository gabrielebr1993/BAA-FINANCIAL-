// Pruebas unitarias del TOTP de liberación (node --test, sin dependencias).
// Ejecutar:  cd functions && npm test
const { test } = require('node:test')
const assert = require('node:assert')
const { generarSecreto, hotp, codigoTotp, validarTotp, segundosRestantes, timestep, periodoValido } = require('../totp')

// Vector RFC 4226 (HOTP, secreto "12345678901234567890" en hex, contadores 0..5).
const RFC_SECRET = Buffer.from('12345678901234567890').toString('hex')
const RFC_HOTP = ['755224', '287082', '359152', '969429', '338314', '254676']

test('HOTP cumple los vectores oficiales del RFC 4226', () => {
  RFC_HOTP.forEach((esperado, contador) => {
    assert.strictEqual(hotp(RFC_SECRET, contador), esperado)
  })
})

test('el secreto es aleatorio, hex y de 160 bits', () => {
  const a = generarSecreto(), b = generarSecreto()
  assert.match(a, /^[0-9a-f]{40}$/)
  assert.notStrictEqual(a, b)
})

test('el código es determinista dentro del periodo y cambia al siguiente', () => {
  const s = generarSecreto()
  const t0 = 1_700_000_040_000 // instante fijo ALINEADO al inicio de un paso de 60 s
  const c1 = codigoTotp(s, 60, t0)
  const c2 = codigoTotp(s, 60, t0 + 59_000) // mismo paso de 60 s
  const c3 = codigoTotp(s, 60, t0 + 61_000) // paso siguiente
  assert.strictEqual(c1, c2)
  assert.match(c1, /^\d{6}$/)
  assert.notStrictEqual(c1, c3)
})

test('valida el código vigente y acepta ±1 paso (desfase de reloj)', () => {
  const s = generarSecreto()
  const t0 = 1_700_000_000_000
  const previo = codigoTotp(s, 60, t0 - 60_000)
  const actual = codigoTotp(s, 60, t0)
  const siguiente = codigoTotp(s, 60, t0 + 60_000)
  const viejo = codigoTotp(s, 60, t0 - 3 * 60_000)
  assert.ok(validarTotp(s, actual, { periodo: 60, ahoraMs: t0 }).ok)
  assert.ok(validarTotp(s, previo, { periodo: 60, ahoraMs: t0 }).ok)
  assert.ok(validarTotp(s, siguiente, { periodo: 60, ahoraMs: t0 }).ok)
  assert.strictEqual(validarTotp(s, viejo, { periodo: 60, ahoraMs: t0 }).ok, false)
})

test('rechaza tokens malformados, vacíos o de otro secreto (rotación)', () => {
  const s1 = generarSecreto(), s2 = generarSecreto()
  const t0 = 1_700_000_000_000
  const deS1 = codigoTotp(s1, 60, t0)
  assert.strictEqual(validarTotp(s2, deS1, { periodo: 60, ahoraMs: t0 }).ok, false, 'rotar el secreto invalida el código anterior')
  assert.strictEqual(validarTotp(s1, '', { periodo: 60, ahoraMs: t0 }).ok, false)
  assert.strictEqual(validarTotp(s1, '12345', { periodo: 60, ahoraMs: t0 }).ok, false)
  assert.strictEqual(validarTotp(s1, 'abcdef', { periodo: 60, ahoraMs: t0 }).ok, false)
  assert.strictEqual(validarTotp('', deS1, { periodo: 60, ahoraMs: t0 }).ok, false)
})

test('el timestep aceptado se reporta (para auditoría/anti-replay)', () => {
  const s = generarSecreto()
  const t0 = 1_700_000_000_000
  const r = validarTotp(s, codigoTotp(s, 30, t0), { periodo: 30, ahoraMs: t0 })
  assert.strictEqual(r.timestep, timestep(30, t0))
})

test('segundosRestantes cuenta hacia el cambio de código', () => {
  const p = 60
  const enInicio = segundosRestantes(p, 1_700_000_040_000) // :00 de un paso → 60 s (múltiplo exacto)
  assert.ok(enInicio >= 1 && enInicio <= 60)
  const casiFin = segundosRestantes(p, 1_700_000_099_000)
  assert.ok(casiFin >= 1 && casiFin <= 60)
})

test('periodoValido solo admite 30/60/120 (default 60)', () => {
  assert.strictEqual(periodoValido(30), 30)
  assert.strictEqual(periodoValido('120'), 120)
  assert.strictEqual(periodoValido(45), 60)
  assert.strictEqual(periodoValido(undefined), 60)
})
