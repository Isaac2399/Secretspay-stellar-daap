import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UserStore } from '../userStore.js'
import type { SinpeStoreData } from '../sinpe/types.js'
import { KV_IMPORTED_KEY, withDb, withDbTransaction } from './client.js'
import {
  insertCodeIssueRow,
  insertSinpeTransactionRow,
  insertUnassignedDepositRow,
} from './sinpe.js'
import { insertUserRow } from './users.js'
import type { Sql } from './sql.js'

const USERS_KEY = 'stellar-web-app:users'
const SINPE_KEY = 'stellar-web-app:sinpe'

export class MigrationStopped extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationStopped'
  }
}

export function duplicateEmails(emails: string[]): string[] {
  return duplicates(emails.map((email) => email.trim().toLowerCase()))
}

export function duplicateReferences(references: string[]): string[] {
  return duplicates(references.map((reference) => reference.trim()))
}

export function duplicateIds(ids: string[]): string[] {
  return duplicates(ids)
}

export async function migrateKvToPostgres(): Promise<{
  source: 'kv' | 'files'
  users: number
  transactions: number
  deposits: number
}> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new MigrationStopped('Falta DATABASE_URL. No se escribió nada.')
  }
  const source = await readSource()
  const emailDupes = duplicateEmails(source.users.users.map((user) => user.email))
  const transactionDupes = duplicateReferences(
    source.sinpe.sinpeTransactions.map((row) => row.referenceId),
  )
  const depositDupes = duplicateReferences(
    source.sinpe.unassignedDeposits.map((row) => row.referenceId),
  )
  const idDupes = [
    ...duplicateIds(source.users.users.map((user) => user.id)),
    ...duplicateIds((source.users.merchantApplications ?? []).map((row) => row.id)),
    ...duplicateIds(source.sinpe.sinpeTransactions.map((row) => row.id)),
    ...duplicateIds(source.sinpe.unassignedDeposits.map((row) => row.id)),
    ...duplicateIds(source.sinpe.codeIssues.map((row) => row.id)),
  ]
  const problems: string[] = []
  if (emailDupes.length > 0) {
    problems.push(`email repetido: ${emailDupes.join(', ')}`)
  }
  if (transactionDupes.length > 0) {
    problems.push(`referencia SINPE repetida en transacciones: ${transactionDupes.join(', ')}`)
  }
  if (depositDupes.length > 0) {
    problems.push(`referencia SINPE repetida en depósitos: ${depositDupes.join(', ')}`)
  }
  if (idDupes.length > 0) {
    problems.push(`id repetido: ${idDupes.join(', ')}`)
  }
  if (problems.length > 0) {
    throw new MigrationStopped(
      `El pase se detuvo sin escribir. ${problems.join(' | ')}`,
    )
  }

  const existing = await withDb((sql) => targetCounts(sql))
  if (existing.marker || existing.users > 0 || existing.transactions > 0 || existing.deposits > 0) {
    throw new MigrationStopped(
      'El pase se detuvo. Postgres ya tiene datos o el marcador del pase anterior. No se volvió a escribir.',
    )
  }

  await withDbTransaction(async (sql) => {
    for (const user of source.users.users) {
      await insertUserRow(sql, user)
      if (user.passwordReset) {
        await sql.query(
          `INSERT INTO password_resets (user_id, token_hash, expires_at, requested_at)
           VALUES ($1, $2, $3, $4)`,
          [
            user.id,
            user.passwordReset.tokenHash,
            user.passwordReset.expiresAt,
            user.passwordReset.requestedAt,
          ],
        )
      }
    }
    for (const application of source.users.merchantApplications ?? []) {
      await sql.query(
        `INSERT INTO merchant_applications (
           id, status, created_at, decided_at, reviewer_id, rejection_note, email,
           password_hash, salt, business_name, contact_name, phone, tax_id, category,
           address, description, accepts_rojos, user_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18
         )`,
        [
          application.id,
          application.status,
          application.createdAt,
          application.decidedAt ?? null,
          application.reviewerId ?? null,
          application.rejectionNote ?? null,
          application.email,
          application.passwordHash ?? null,
          application.salt ?? null,
          application.businessName,
          application.contactName,
          application.phone,
          application.taxId,
          application.category,
          application.address,
          application.description,
          application.acceptsRojos,
          application.userId ?? null,
        ],
      )
    }
    for (const row of source.sinpe.sinpeTransactions) {
      await insertSinpeTransactionRow(sql, row)
    }
    for (const row of source.sinpe.unassignedDeposits) {
      await insertUnassignedDepositRow(sql, row)
    }
    for (const row of source.sinpe.codeIssues) {
      await insertCodeIssueRow(sql, row)
    }
    await sql.query('INSERT INTO schema_meta (key, value) VALUES ($1, $2)', [
      KV_IMPORTED_KEY,
      new Date().toISOString(),
    ])
  })

  return {
    source: source.origin,
    users: source.users.users.length,
    transactions: source.sinpe.sinpeTransactions.length,
    deposits: source.sinpe.unassignedDeposits.length,
  }
}

function duplicates(values: string[]): string[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value)
}

async function targetCounts(sql: Sql): Promise<{
  marker: boolean
  users: number
  transactions: number
  deposits: number
}> {
  const result = await sql.query<{
    marker: number
    users: number
    transactions: number
    deposits: number
  }>(
    `SELECT
       (SELECT count(*)::int FROM schema_meta WHERE key = $1) AS marker,
       (SELECT count(*)::int FROM users) AS users,
       (SELECT count(*)::int FROM sinpe_transactions) AS transactions,
       (SELECT count(*)::int FROM sinpe_deposits) AS deposits`,
    [KV_IMPORTED_KEY],
  )
  const row = result.rows[0]
  return {
    marker: (row?.marker ?? 0) > 0,
    users: row?.users ?? 0,
    transactions: row?.transactions ?? 0,
    deposits: row?.deposits ?? 0,
  }
}

async function readSource(): Promise<{
  origin: 'kv' | 'files'
  users: UserStore
  sinpe: SinpeStoreData
}> {
  if (kvConfigured()) {
    const users = normalizeUsers(await readKv(USERS_KEY))
    const sinpe = normalizeSinpe(await readKv(SINPE_KEY))
    return { origin: 'kv', users, sinpe }
  }
  return {
    origin: 'files',
    users: normalizeUsers(readJsonFile(join('data', 'users.json'))),
    sinpe: normalizeSinpe(readJsonFile(join('data', 'sinpe.json'))),
  }
}

function normalizeUsers(value: unknown): UserStore {
  if (!value || typeof value !== 'object') {
    return { users: [] }
  }
  const record = value as UserStore
  return {
    users: Array.isArray(record.users) ? record.users : [],
    merchantApplications: Array.isArray(record.merchantApplications)
      ? record.merchantApplications
      : [],
  }
}

function normalizeSinpe(value: unknown): SinpeStoreData {
  if (!value || typeof value !== 'object') {
    return { sinpeTransactions: [], unassignedDeposits: [], codeIssues: [] }
  }
  const record = value as SinpeStoreData
  return {
    sinpeTransactions: Array.isArray(record.sinpeTransactions) ? record.sinpeTransactions : [],
    unassignedDeposits: Array.isArray(record.unassignedDeposits) ? record.unassignedDeposits : [],
    codeIssues: Array.isArray(record.codeIssues) ? record.codeIssues : [],
  }
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    return null
  }
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

function kvConfigured(): boolean {
  return Boolean(kvUrl() && kvToken())
}

function kvUrl(): string {
  return stripQuotes(process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '')
}

function kvToken(): string {
  return stripQuotes(
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  )
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}

async function readKv(key: string): Promise<unknown> {
  const response = await fetch(kvUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['GET', key]),
  })
  if (!response.ok) {
    throw new MigrationStopped('No se pudo leer Vercel KV. El pase no escribió nada.')
  }
  const payload = (await response.json()) as { result: unknown }
  const raw = payload.result
  if (raw == null) {
    return null
  }
  if (typeof raw === 'string') {
    return JSON.parse(raw) as unknown
  }
  return raw
}
