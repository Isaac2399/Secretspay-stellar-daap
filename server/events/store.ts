import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AuthError } from '../errors.js'
import type { EventStoreData } from './types.js'

const EVENT_FILE = join('data', 'event-bar.json')
const KV_KEY = 'stellar-web-app:event-bar'

export async function loadEventStore(): Promise<EventStoreData> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | EventStoreData | null>(['GET', KV_KEY])
    if (!raw) {
      return emptyStore()
    }
    if (typeof raw === 'string') {
      return parseStore(raw)
    }
    return normalizeStore(raw)
  }

  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta Vercel KV para guardar el bar del evento.',
      503,
    )
  }

  if (!existsSync(EVENT_FILE)) {
    return emptyStore()
  }
  return parseStore(readFileSync(EVENT_FILE, 'utf8'))
}

export async function saveEventStore(store: EventStoreData): Promise<void> {
  if (kvConfigured()) {
    await kvCommand(['SET', KV_KEY, JSON.stringify(store)])
    return
  }

  if (process.env.VERCEL) {
    throw new AuthError('En Vercel hace falta Vercel KV para guardar el bar del evento.', 503)
  }

  mkdirSync(dirname(EVENT_FILE), { recursive: true })
  writeFileSync(EVENT_FILE, JSON.stringify(store, null, 2), 'utf8')
}

function emptyStore(): EventStoreData {
  return { products: [], orders: [], counters: {}, settings: {} }
}

function parseStore(raw: string): EventStoreData {
  try {
    return normalizeStore(JSON.parse(raw) as EventStoreData)
  } catch {
    return emptyStore()
  }
}

function normalizeStore(raw: Partial<EventStoreData> | null): EventStoreData {
  return {
    products: Array.isArray(raw?.products) ? raw.products : [],
    orders: Array.isArray(raw?.orders) ? raw.orders : [],
    counters: raw?.counters && typeof raw.counters === 'object' ? raw.counters : {},
    settings: raw?.settings && typeof raw.settings === 'object' ? raw.settings : {},
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
    throw new AuthError('No se pudo acceder al almacén KV del evento', 500)
  }
  const payload = (await response.json()) as { result: T }
  return payload.result
}
