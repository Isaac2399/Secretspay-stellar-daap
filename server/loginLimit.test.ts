import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LOGIN_LOCK_MS,
  LOGIN_WINDOW_MS,
  exemptFromLoginLock,
  lockActive,
  loginLockEnforced,
  nextLimitState,
} from './loginLimit.js'

test('el quinto intento fallido bloquea y el anterior no', () => {
  const start = 1_000_000
  let row = nextLimitState(undefined, start).row
  for (let attempt = 2; attempt <= 4; attempt += 1) {
    const next = nextLimitState(row, start + attempt)
    assert.equal(next.locked, false)
    row = next.row
  }
  const fifth = nextLimitState(row, start + 5)
  assert.equal(fifth.locked, true)
  assert.equal(lockActive(fifth.row, start + 5), true)
  assert.equal(lockActive(fifth.row, start + 5 + LOGIN_LOCK_MS), false)
})

test('el super admin y el servidor local no se bloquean', () => {
  const previousEmail = process.env.SUPER_ADMIN_EMAIL
  const previousVercel = process.env.VERCEL
  const previousNodeEnv = process.env.NODE_ENV
  process.env.SUPER_ADMIN_EMAIL = 'dueno@stellarpay.local'
  process.env.VERCEL = '1'
  process.env.NODE_ENV = 'production'
  assert.equal(exemptFromLoginLock('Dueno@StellarPay.local'), true)
  assert.equal(loginLockEnforced('dueno@stellarpay.local'), false)
  assert.equal(loginLockEnforced('otra@correo.com'), true)
  process.env.NODE_ENV = 'development'
  assert.equal(loginLockEnforced('otra@correo.com'), false)
  delete process.env.VERCEL
  process.env.NODE_ENV = 'production'
  assert.equal(loginLockEnforced('otra@correo.com'), false)
  if (previousEmail === undefined) {
    delete process.env.SUPER_ADMIN_EMAIL
  } else {
    process.env.SUPER_ADMIN_EMAIL = previousEmail
  }
  if (previousVercel === undefined) {
    delete process.env.VERCEL
  } else {
    process.env.VERCEL = previousVercel
  }
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = previousNodeEnv
  }
})

test('la ventana vencida vuelve a empezar en un intento', () => {
  const start = 1_000_000
  const first = nextLimitState(undefined, start)
  const later = nextLimitState(first.row, start + LOGIN_WINDOW_MS)
  assert.equal(later.locked, false)
  assert.equal(later.row.failures, 1)
})
