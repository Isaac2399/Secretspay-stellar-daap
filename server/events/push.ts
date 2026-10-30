import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import webpush from 'web-push'
import type { EventOrder } from './types.js'
import {
  listSubscriptionsForUser,
  removeEndpointEverywhere,
  type PushSubscriptionJson,
} from './pushStore.js'

const VAPID_FILE = join('data', 'vapid-keys.json')

type VapidKeys = {
  publicKey: string
  privateKey: string
}

let configured = false

export function getVapidPublicKey(): string | null {
  const keys = resolveVapidKeys()
  return keys?.publicKey ?? null
}

export function isPushConfigured(): boolean {
  return resolveVapidKeys() !== null
}

export async function notifyOrderReady(order: EventOrder): Promise<void> {
  const keys = resolveVapidKeys()
  if (!keys) {
    return
  }
  ensureWebPush(keys)

  const subscriptions = await listSubscriptionsForUser(order.customerId)
  if (subscriptions.length === 0) {
    return
  }

  const payload = JSON.stringify({
    title: 'Orden lista',
    body: `Ve a ${order.pickupLabel} a retirar tu pedido.`,
    url: `/event?merchant=${encodeURIComponent(order.merchantId)}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: 'ready',
  })

  await Promise.all(
    subscriptions.map((subscription) =>
      sendOne(subscription, payload).catch((error) => {
        console.warn('[push] fallo al enviar', order.id, error)
      }),
    ),
  )
}

async function sendOne(
  subscription: PushSubscriptionJson,
  payload: string,
): Promise<void> {
  try {
    await webpush.sendNotification(subscription, payload, {
      TTL: 60 * 30,
      urgency: 'high',
    })
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0
    // 404/410 = suscripción muerta o revocada
    if (statusCode === 404 || statusCode === 410) {
      await removeEndpointEverywhere(subscription.endpoint)
      return
    }
    throw error
  }
}

function ensureWebPush(keys: VapidKeys): void {
  if (configured) {
    return
  }
  const subject =
    stripQuotes(process.env.VAPID_SUBJECT ?? '') ||
    'mailto:noreply@stellarpay.local'
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey)
  configured = true
}

function resolveVapidKeys(): VapidKeys | null {
  const fromEnv = readEnvKeys()
  if (fromEnv) {
    return fromEnv
  }
  // En Vercel no persistimos a disco: hay que configurar env.
  if (process.env.VERCEL) {
    return null
  }
  return readOrCreateLocalKeys()
}

function readEnvKeys(): VapidKeys | null {
  const publicKey = stripQuotes(process.env.VAPID_PUBLIC_KEY ?? '')
  const privateKey = stripQuotes(process.env.VAPID_PRIVATE_KEY ?? '')
  if (!publicKey || !privateKey) {
    return null
  }
  return { publicKey, privateKey }
}

function readOrCreateLocalKeys(): VapidKeys | null {
  if (existsSync(VAPID_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(VAPID_FILE, 'utf8')) as Partial<VapidKeys>
      if (parsed.publicKey && parsed.privateKey) {
        return { publicKey: parsed.publicKey, privateKey: parsed.privateKey }
      }
    } catch {
      // regenerar abajo
    }
  }
  try {
    const generated = webpush.generateVAPIDKeys()
    const keys: VapidKeys = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
    }
    mkdirSync(dirname(VAPID_FILE), { recursive: true })
    writeFileSync(VAPID_FILE, JSON.stringify(keys, null, 2), 'utf8')
    console.info(
      '[push] Claves VAPID locales en data/vapid-keys.json. En producción usa VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.',
    )
    return keys
  } catch (error) {
    console.warn('[push] No se pudieron generar claves VAPID', error)
    return null
  }
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}
