import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicErrorMessage, scrubSecrets } from './safeText.js'

const SECRET = `S${'A'.repeat(55)}`

test('un error no devuelve la clave ni el token de reset', () => {
  assert.equal(publicErrorMessage(`falló ${SECRET}`), 'No se pudo completar la operación.')
  assert.equal(
    publicErrorMessage('abre https://app.test/reset-password?token=abc123'),
    'No se pudo completar la operación.',
  )
  assert.equal(scrubSecrets(`clave ${SECRET}`).includes(SECRET), false)
  assert.equal(publicErrorMessage('Email o contraseña incorrectos'), 'Email o contraseña incorrectos')
})
