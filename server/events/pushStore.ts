import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AuthError } from '../errors.js'

export type PushSubscriptionJson = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

type PushStoreData = {
  /** userId → suscripciones Web Push del cliente */
  byUser: Record<string, PushSubscriptionJson[]>
}

const PUSH_FILE = join('data', 'push-subscriptions.json')
const KV_KEY = 'stellar-web-app:push-subscriptions'

export async function listSubscriptionsForUser(
  userId: string,
): Promise<PushSubscriptionJson[]> {
  const store = await loadPushStore()
  return store.byUser[userId] ?? []
}

export async function saveSubscription(
  userId: string,
  subscription: PushSubscriptionJson,
): Promise<void> {
  const endpoint = subscription.endpoint?.trim()
  if (!endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new AuthError('Suscripción push inválida', 400)
  }
  const store = await loadPushStore()
  const current = store.byUser[userId] ?? []
  const next = current.filter((row) => row.endpoint !== endpoint)
  next.push({
    endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  })
  store.byUser[userId] = next
  await savePushStore(store)
}

export async function removeSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  const trimmed = endpoint.trim()
  if (!trimmed) {
    return
  }
  const store = await loadPushStore()
  const current = store.byUser[userId] ?? []
  store.byUser[userId] = current.filter((row) => row.endpoint !== trimmed)
  if (store.byUser[userId].length === 0) {
    delete store.byUser[userId]
  }
  await savePushStore(store)
}

export async function removeEndpointEverywhere(endpoint: string): Promise<void> {
  const trimmed = endpoint.trim()
  if (!trimmed) {
    return
  }
  const store = await loadPushStore()
  let changed = false
  for (const userId of Object.keys(store.byUser)) {
    const before = store.byUser[userId]
    const after = before.filter((row) => row.endpoint !== trimmed)
    if (after.length !== before.length) {
      changed = true
      if (after.length === 0) {
        delete store.byUser[userId]
      } else {
        store.byUser[userId] = after
      }
    }
  }
  if (changed) {
    await savePushStore(store)
  }
}

async function loadPushStore(): Promise<PushStoreData> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | PushStoreData | null>(['GET', KV_KEY])
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
      'En Vercel hace falta Vercel KV para guardar suscripciones push.',
      503,
    )
  }

  if (!existsSync(PUSH_FILE)) {
    return emptyStore()
  }
  return parseStore(readFileSync(PUSH_FILE, 'utf8'))
}

async function savePushStore(store: PushStoreData): Promise<void> {
  if (kvConfigured()) {
    await kvCommand(['SET', KV_KEY, JSON.stringify(store)])
    return
  }

  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta Vercel KV para guardar suscripciones push.',
      503,
    )
  }

  mkdirSync(dirname(PUSH_FILE), { recursive: true })
  writeFileSync(PUSH_FILE, JSON.stringify(store, null, 2), 'utf8')
}

function emptyStore(): PushStoreData {
  return { byUser: {} }
}

function parseStore(raw: string): PushStoreData {
  try {
    return normalizeStore(JSON.parse(raw) as PushStoreData)
  } catch {
    return emptyStore()
  }
}

function normalizeStore(raw: Partial<PushStoreData> | null): PushStoreData {
  const byUser =
    raw?.byUser && typeof raw.byUser === 'object' && !Array.isArray(raw.byUser)
      ? raw.byUser
      : {}
  const cleaned: Record<string, PushSubscriptionJson[]> = {}
  for (const [userId, rows] of Object.entries(byUser)) {
    if (!Array.isArray(rows)) {
      continue
    }
    cleaned[userId] = rows.filter(
      (row) =>
        row &&
        typeof row.endpoint === 'string' &&
        row.keys &&
        typeof row.keys.p256dh === 'string' &&
        typeof row.keys.auth === 'string',
    )
  }
  return { byUser: cleaned }
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
    throw new AuthError('No se pudo acceder al almacén KV de push', 500)
  }
  const payload = (await response.json()) as { result: T }
  return payload.result
}
