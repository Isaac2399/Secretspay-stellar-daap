import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AuthError } from '../errors.js'
import type {
  SinpeStoreData,
  SinpeTransaction,
  UnassignedDeposit,
} from './types.js'

const SINPE_FILE = join('data', 'sinpe.json')
const KV_KEY = 'stellar-web-app:sinpe'

export async function findByReference(referenceId: string): Promise<{
  transaction?: SinpeTransaction
  deposit?: UnassignedDeposit
}> {
  const store = await loadSinpeStore()
  const key = normalizeReference(referenceId)
  return {
    transaction: store.sinpeTransactions.find(
      (row) => normalizeReference(row.referenceId) === key,
    ),
    deposit: store.unassignedDeposits.find(
      (row) => normalizeReference(row.referenceId) === key,
    ),
  }
}

export async function upsertSinpeTransaction(
  record: SinpeTransaction,
): Promise<SinpeTransaction> {
  const store = await loadSinpeStore()
  const key = normalizeReference(record.referenceId)
  const index = store.sinpeTransactions.findIndex(
    (row) => normalizeReference(row.referenceId) === key,
  )
  const next = { ...record, updatedAt: new Date().toISOString() }
  if (index >= 0) {
    store.sinpeTransactions[index] = next
  } else {
    store.sinpeTransactions.unshift(next)
  }
  await saveSinpeStore(store)
  return next
}

export async function upsertUnassignedDeposit(
  record: UnassignedDeposit,
): Promise<UnassignedDeposit> {
  const store = await loadSinpeStore()
  const key = normalizeReference(record.referenceId)
  const index = store.unassignedDeposits.findIndex(
    (row) => normalizeReference(row.referenceId) === key,
  )
  const next = { ...record, updatedAt: new Date().toISOString() }
  if (index >= 0) {
    store.unassignedDeposits[index] = next
  } else {
    store.unassignedDeposits.unshift(next)
  }
  await saveSinpeStore(store)
  return next
}

export async function listUnassignedDeposits(input?: {
  referenceId?: string
  status?: string
}): Promise<UnassignedDeposit[]> {
  const store = await loadSinpeStore()
  const reference = input?.referenceId
    ? normalizeReference(input.referenceId)
    : ''
  const status = input?.status?.trim().toUpperCase()
  return store.unassignedDeposits.filter((row) => {
    if (reference && normalizeReference(row.referenceId) !== reference) {
      return false
    }
    if (status && status !== 'ALL' && row.status !== status) {
      return false
    }
    if (!status) {
      return row.status === 'PENDING_MANUAL_MATCH'
    }
    return true
  })
}

export async function listSinpeForUser(userId: string): Promise<{
  deposits: UnassignedDeposit[]
  transactions: SinpeTransaction[]
}> {
  const store = await loadSinpeStore()
  return {
    deposits: store.unassignedDeposits.filter((row) => row.assignedUserId === userId),
    transactions: store.sinpeTransactions.filter((row) => row.userId === userId),
  }
}

async function loadSinpeStore(): Promise<SinpeStoreData> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | SinpeStoreData | null>(['GET', KV_KEY])
    if (!raw) {
      return emptyStore()
    }
    if (typeof raw === 'string') {
      return normalizeStore(JSON.parse(raw) as SinpeStoreData)
    }
    return normalizeStore(raw)
  }

  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta Vercel KV para persistir recargas SINPE.',
      503,
    )
  }

  if (!existsSync(SINPE_FILE)) {
    return emptyStore()
  }
  return normalizeStore(JSON.parse(readFileSync(SINPE_FILE, 'utf8')) as SinpeStoreData)
}

async function saveSinpeStore(store: SinpeStoreData): Promise<void> {
  const next = normalizeStore(store)
  if (kvConfigured()) {
    await kvCommand(['SET', KV_KEY, JSON.stringify(next)])
    return
  }

  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta Vercel KV para persistir recargas SINPE.',
      503,
    )
  }

  mkdirSync(dirname(SINPE_FILE), { recursive: true })
  writeFileSync(SINPE_FILE, JSON.stringify(next, null, 2), 'utf8')
}

function emptyStore(): SinpeStoreData {
  return { sinpeTransactions: [], unassignedDeposits: [] }
}

function normalizeStore(store: SinpeStoreData): SinpeStoreData {
  return {
    sinpeTransactions: Array.isArray(store.sinpeTransactions)
      ? store.sinpeTransactions
      : [],
    unassignedDeposits: Array.isArray(store.unassignedDeposits)
      ? store.unassignedDeposits
      : [],
  }
}

function normalizeReference(value: string): string {
  return value.trim()
}

function kvConfigured(): boolean {
  return Boolean(kvUrl() && kvToken())
}

function kvUrl(): string {
  return stripQuotes(
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '',
  )
}

function kvToken(): string {
  return stripQuotes(
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  )
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}

async function kvCommand<T>(command: unknown[]): Promise<T> {
  const response = await fetch(kvUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) {
    throw new AuthError('No se pudo acceder al almacén KV de SINPE', 500)
  }
  const payload = (await response.json()) as { result: T }
  return payload.result
}
