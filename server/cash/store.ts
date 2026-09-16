import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AuthError } from '../errors.js'
import type { CashCredit, CashStoreData } from './types.js'

const CASH_FILE = join('data', 'cash-credits.json')
const KV_KEY = 'stellar-web-app:cash-credits'

export async function listCashCredits(limit = 40): Promise<CashCredit[]> {
  const store = await loadCashStore()
  return store.credits.slice(0, Math.min(Math.max(limit, 1), 100))
}

export async function insertCashCredit(record: CashCredit): Promise<CashCredit> {
  const store = await loadCashStore()
  store.credits.unshift(record)
  await saveCashStore(store)
  return record
}

async function loadCashStore(): Promise<CashStoreData> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | CashStoreData | null>(['GET', KV_KEY])
    if (!raw) {
      return { credits: [] }
    }
    if (typeof raw === 'string') {
      return parseStore(raw)
    }
    return { credits: Array.isArray(raw.credits) ? raw.credits : [] }
  }

  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta Vercel KV para guardar recargas en efectivo.',
      503,
    )
  }

  if (!existsSync(CASH_FILE)) {
    return { credits: [] }
  }
  return parseStore(readFileSync(CASH_FILE, 'utf8'))
}

async function saveCashStore(store: CashStoreData): Promise<void> {
  if (kvConfigured()) {
    await kvCommand(['SET', KV_KEY, JSON.stringify(store)])
    return
  }

  if (process.env.VERCEL) {
    throw new AuthError('En Vercel hace falta Vercel KV para guardar recargas en efectivo.', 503)
  }

  mkdirSync(dirname(CASH_FILE), { recursive: true })
  writeFileSync(CASH_FILE, JSON.stringify(store, null, 2), 'utf8')
}

function parseStore(raw: string): CashStoreData {
  try {
    const parsed = JSON.parse(raw) as CashStoreData
    return { credits: Array.isArray(parsed.credits) ? parsed.credits : [] }
  } catch {
    return { credits: [] }
  }
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
    throw new AuthError('No se pudo acceder al almacén KV de caja', 500)
  }
  const payload = (await response.json()) as { result: T }
  return payload.result
}
