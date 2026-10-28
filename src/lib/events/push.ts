import { AuthApiError } from '@/lib/auth/api'

const NOTIFIED_READY_KEY = 'stellarpay:notified-ready-orders'

type VapidResponse = {
  configured: boolean
  publicKey: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const raw = await response.text()
  let body: T & { error?: string }
  try {
    body = raw ? (JSON.parse(raw) as T & { error?: string }) : ({} as T & { error?: string })
  } catch {
    throw new AuthApiError(
      `El servidor respondió ${response.status} (no JSON).`,
      response.status,
    )
  }
  if (!response.ok) {
    throw new AuthApiError(body.error ?? 'No se pudo completar', response.status)
  }
  return body
}

/** Registra el SW, pide permiso y guarda la suscripción Web Push del cliente. */
export async function enableOrderReadyPush(): Promise<'subscribed' | 'denied' | 'unsupported' | 'skipped'> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (!window.isSecureContext) {
    return 'unsupported'
  }

  const vapid = await request<VapidResponse>('/api/events/push-vapid')
  if (!vapid.configured || !vapid.publicKey) {
    return 'skipped'
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (permission !== 'granted') {
    return 'denied'
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
    }))

  await request<{ ok: boolean }>('/api/events/push-subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })

  return 'subscribed'
}

/** Aviso local al detectar `ready` por poll (útil con la pestaña abierta). */
export function notifyOrderReadyLocally(order: {
  id: string
  orderNumber: string
  pickupLabel: string
}): void {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return
  }
  if (Notification.permission !== 'granted') {
    return
  }
  if (wasNotified(order.id)) {
    return
  }
  markNotified(order.id)
  const alertOptions: NotificationOptions & {
    renotify?: boolean
    vibrate?: number[]
  } = {
    body: `#${order.orderNumber} · Retira en ${order.pickupLabel}`,
    icon: '/favicon.svg',
    tag: `order-ready-${order.id}`,
    data: { url: '/event' },
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200, 100, 280],
  }
  try {
    const registration = navigator.serviceWorker?.controller
    if (registration) {
      // Preferir SW si ya está activo (mismo look que el push remoto).
      void navigator.serviceWorker.ready.then((ready) =>
        ready.showNotification('Pedido listo', alertOptions),
      )
      return
    }
    navigator.vibrate?.([200, 100, 200, 100, 280])
    new Notification('Pedido listo', alertOptions)
  } catch {
    // silencioso: el ticket en pantalla sigue siendo la fuente de verdad
  }
}

function wasNotified(orderId: string): boolean {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_READY_KEY)
    const ids = raw ? (JSON.parse(raw) as string[]) : []
    return ids.includes(orderId)
  } catch {
    return false
  }
}

function markNotified(orderId: string): void {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_READY_KEY)
    const ids = raw ? (JSON.parse(raw) as string[]) : []
    if (!ids.includes(orderId)) {
      ids.push(orderId)
      sessionStorage.setItem(NOTIFIED_READY_KEY, JSON.stringify(ids.slice(-40)))
    }
  } catch {
    // ignore quota / private mode
  }
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}
