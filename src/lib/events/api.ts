import { AuthApiError } from '@/lib/auth/api'
import type {
  EventBoardOrder,
  EventOrder,
  EventProduct,
  EventProductPromo,
  EventSettings,
  EventVenue,
} from '@/types/event'

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

export async function fetchEventVenues() {
  return request<{ venues: EventVenue[] }>('/api/events/venues')
}

export async function fetchEventCatalog(merchantId: string) {
  return request<{ venue: EventVenue; products: EventProduct[] }>(
    `/api/events/catalog?merchantId=${encodeURIComponent(merchantId)}`,
  )
}

export async function fetchEventBoard(merchantId: string) {
  return request<{
    venue: EventVenue
    preparing: EventBoardOrder[]
    ready: EventBoardOrder[]
  }>(`/api/events/board?merchantId=${encodeURIComponent(merchantId)}`)
}

export async function fetchMerchantProducts() {
  return request<{ products: EventProduct[] }>('/api/events/products')
}

export async function createEventProduct(input: {
  name: string
  price: string
  stock: number
  asset?: string
  pickupLabel?: string
  active?: boolean
  promo?: EventProductPromo | null
}) {
  return request<{ product: EventProduct }>('/api/events/products', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateEventProduct(input: {
  id: string
  name?: string
  price?: string
  stock?: number
  asset?: string
  pickupLabel?: string
  active?: boolean
  promo?: EventProductPromo | null
}) {
  return request<{ product: EventProduct }>('/api/events/products', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteEventProduct(id: string) {
  return request<{ ok: boolean }>('/api/events/products', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}

export async function fetchEventSettings() {
  return request<{ settings: EventSettings }>('/api/events/settings')
}

export async function saveEventSettings(input: { title: string; pickupLabel: string }) {
  return request<{ settings: EventSettings }>('/api/events/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function placeEventOrder(input: {
  merchantId: string
  items: Array<{ productId: string; qty: number }>
}) {
  return request<{ order: EventOrder; hash: string }>('/api/events/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchMyEventOrders() {
  return request<{ orders: EventOrder[] }>('/api/events/my-orders')
}

export async function fetchMerchantOrders() {
  return request<{ orders: EventOrder[] }>('/api/events/orders')
}

export async function markEventOrderReady(orderId: string) {
  return request<{ order: EventOrder }>('/api/events/ready', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  })
}

export async function completeEventOrderByQr(qr: string) {
  return request<{ order: EventOrder }>('/api/events/complete', {
    method: 'POST',
    body: JSON.stringify({ qr }),
  })
}
