import assert from 'node:assert/strict'
import { test } from 'node:test'
import { StrKey } from '@stellar/stellar-sdk'
import { AuthError } from './errors.js'
import { resolveTopUpTarget, type TopUpAccount } from './adminTopUp.js'

const customerKey = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1))
const otherKey = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2))

const customer: TopUpAccount = {
  id: 'user-1',
  email: 'ana@correo.com',
  publicKey: customerKey,
  superAdmin: false,
}

test('el email resuelve la public key de esa cuenta', () => {
  const target = resolveTopUpTarget({
    email: 'Ana@Correo.com',
    byEmail: customer,
  })
  assert.equal(target.destination, customerKey)
  assert.equal(target.userId, 'user-1')
  assert.equal(target.email, 'ana@correo.com')
})

test('email y public key tienen que ser la misma cuenta', () => {
  const matched = resolveTopUpTarget({
    email: 'ana@correo.com',
    publicKey: customerKey,
    byEmail: customer,
    byPublicKey: customer,
  })
  assert.equal(matched.destination, customerKey)

  assert.throws(
    () =>
      resolveTopUpTarget({
        email: 'ana@correo.com',
        publicKey: otherKey,
        byEmail: customer,
      }),
    (error: unknown) =>
      error instanceof AuthError &&
      error.status === 400 &&
      error.message.includes('misma cuenta'),
  )
})

test('una public key sin cuenta registrada igual se puede recargar', () => {
  const target = resolveTopUpTarget({ publicKey: otherKey })
  assert.equal(target.destination, otherKey)
  assert.equal(target.userId, undefined)
})

test('no recarga la cuenta del super admin', () => {
  assert.throws(
    () =>
      resolveTopUpTarget({
        email: 'admin@stellarpay.local',
        byEmail: { ...customer, superAdmin: true },
      }),
    (error: unknown) => error instanceof AuthError && error.status === 400,
  )
})
