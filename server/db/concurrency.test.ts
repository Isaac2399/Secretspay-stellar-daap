import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { SCHEMA_SQL } from './schema.js'
import {
  insertSinpeTransactionRow,
  upsertSinpeTransactionRow,
} from './sinpe.js'
import type { Sql } from './sql.js'
import { duplicateEmails, duplicateReferences, MigrationStopped } from './migrateKv.js'
import { insertUserRow, loadUserSnapshot, saveUserSnapshot } from './users.js'
import type { StoredUser } from '../auth.js'
import type { SinpeTransaction } from '../sinpe/types.js'

test('el pase se detiene si el email o la referencia ya vienen repetidos', () => {
  assert.deepEqual(duplicateEmails(['a@x.com', 'A@x.com']), ['a@x.com'])
  assert.deepEqual(duplicateReferences([' 99 ', '99']), ['99'])
  assert.equal(duplicateEmails(['a@x.com', 'b@x.com']).length, 0)
  const stopped = new MigrationStopped('alto')
  assert.equal(stopped.name, 'MigrationStopped')
})

test('dos altas seguidas no se borran entre sí', async () => {
  const db = await openDb()
  const base = user('ana@party.test', 'ana')
  const withBeto = { users: [base, user('beto@party.test', 'beto')] }
  const withCris = { users: [base, user('cris@party.test', 'cris')] }

  await db.transaction(async (tx) => {
    await saveUserSnapshot(asSql(tx), withBeto)
  })
  await db.transaction(async (tx) => {
    await saveUserSnapshot(asSql(tx), withCris)
  })

  const loaded = await loadUserSnapshot(asSql(db))
  assert.deepEqual(
    loaded.users.map((row) => row.email).sort(),
    ['ana@party.test', 'beto@party.test', 'cris@party.test'],
  )
})

test('el mismo email no entra dos veces', async () => {
  const db = await openDb()
  await db.transaction(async (tx) => {
    await insertUserRow(asSql(tx), user('dup@party.test', 'one'))
  })
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        await insertUserRow(asSql(tx), user('dup@party.test', 'two'))
      }),
    (error: unknown) => isUnique(error),
  )
  const loaded = await loadUserSnapshot(asSql(db))
  assert.deepEqual(
    loaded.users.map((row) => row.id),
    ['one'],
  )
})

test('la misma referencia SINPE no entra dos veces y dos referencias distintas sí', async () => {
  const db = await openDb()
  await db.transaction(async (tx) => {
    await insertSinpeTransactionRow(asSql(tx), sinpe('ref-1', 'tx-1'))
  })
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        await insertSinpeTransactionRow(asSql(tx), sinpe('ref-1', 'tx-2'))
      }),
    (error: unknown) => isUnique(error),
  )
  await db.transaction(async (tx) => {
    await upsertSinpeTransactionRow(asSql(tx), sinpe('ref-2', 'tx-3'))
  })
  const rows = await db.query<{ reference_id: string }>(
    'SELECT reference_id FROM sinpe_transactions ORDER BY reference_id',
  )
  assert.deepEqual(
    rows.rows.map((row) => row.reference_id),
    ['ref-1', 'ref-2'],
  )
})

async function openDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SCHEMA_SQL)
  return db
}

function asSql(db: { query: PGlite['query'] }): Sql {
  return {
    query: async <T>(text: string, params?: unknown[]) => {
      const result = await db.query<Record<string, unknown>>(text, params)
      return { rows: result.rows as T[] }
    },
  }
}

function user(email: string, id: string): StoredUser {
  return {
    id,
    email,
    role: 'customer',
    publicKey: 'G'.padEnd(56, 'A'),
    createdAt: '2026-11-10T12:00:00.000Z',
  }
}

function sinpe(referenceId: string, id: string): SinpeTransaction {
  return {
    id,
    referenceId,
    crcAmount: 1000,
    calculatedRojos: 10,
    promoApplied: false,
    comment: '',
    sender: 'banco',
    rawMessage: referenceId,
    timestamp: 1,
    status: 'COMPLETED',
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
  }
}

function isUnique(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === '23505',
  )
}
