import assert from 'node:assert/strict'
import { test } from 'node:test'
import { amountFromBankText, autoCreditDecision, bankAmountReplaces, claimCreditDecision } from './creditRules.js'
import { parseCrcNumber, parseSinpeSms } from './parseSms.js'

const BANK = 'Ha recibido 5000 colones por SINPE Movil, sc23456789ts referencia 123456789'

test('el monto sale del texto del banco, no de un número inventado', () => {
  const priced = amountFromBankText(BANK)
  assert.equal(priced?.crcAmount, 5000)
  assert.equal(priced?.rojos, 5)
  assert.equal(amountFromBankText('sin monto'), undefined)
})

test('el crédito automático no sale si el reclamo no es del dueño del código', () => {
  assert.equal(autoCreditDecision({ ownerId: 'ana' }), 'credit')
  assert.equal(autoCreditDecision({ ownerId: 'ana', claimedId: 'ana' }), 'credit')
  assert.equal(autoCreditDecision({ ownerId: 'ana', claimedId: 'beto' }), 'hold')
  assert.equal(autoCreditDecision({ claimedId: 'beto' }), 'hold')
})

test('4,500.00 y 4.500 son cuatro mil quinientos colones', () => {
  assert.equal(parseCrcNumber('4,500.00'), 4500)
  assert.equal(parseCrcNumber('4.500'), 4500)
  assert.equal(parseCrcNumber('4.50'), 4.5)
  const parsed = parseSinpeSms(
    'Ha recibido 4,500.00 Colones por SINPE Movil, scDR3VF6TDts Referencia 2026111481483001022258905.',
  )
  assert.equal(parsed?.crcAmount, 4500)
  assert.equal(bankAmountReplaces(4.5, 4500), true)
  assert.equal(bankAmountReplaces(4500, 4500), false)
})

test('el reclamo con sesión acredita solo al dueño y solo con monto del banco', () => {
  assert.equal(claimCreditDecision({ ownerId: 'ana', userId: 'ana', bankRojos: 5 }), 'credit')
  assert.equal(claimCreditDecision({ ownerId: 'ana', userId: 'beto', bankRojos: 5 }), 'mismatch')
  assert.equal(claimCreditDecision({ userId: 'ana', bankRojos: 5 }), 'queue')
  assert.equal(claimCreditDecision({ ownerId: 'ana', userId: 'ana' }), 'queue')
})
