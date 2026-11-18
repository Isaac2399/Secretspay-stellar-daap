import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webhookSecretsFromBody } from './webhookPayload.js'

test('la clave del forwarder sale del cuerpo aunque el nombre cambie de mayúsculas', () => {
  const secrets = webhookSecretsFromBody({
    from: '2272',
    content: 'Ha recibido 1000 colones',
    sign: '  clave-real  ',
    'X-API-KEY': 'otra',
  })
  assert.deepEqual(secrets, ['clave-real', 'otra'])
})

test('un placeholder no cuenta como clave', () => {
  assert.deepEqual(
    webhookSecretsFromBody({ secret: '%secret%', headers: { token: 'abc' } }),
    ['abc'],
  )
})
