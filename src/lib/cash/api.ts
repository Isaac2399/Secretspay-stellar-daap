import { AuthApiError } from '@/lib/auth/api'

export type CashCredit = {
  id: string
  crcAmount: number
  calculatedRojos: number
  promoApplied: boolean
  userId: string
  publicKey: string
  email: string
  cashierId: string
  cashierEmail: string
  stellarHash?: string
  createdAt: string
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

export async function fetchCashCredits() {
  return request<{ credits: CashCredit[] }>('/api/admin/cash-credits')
}

export type CashRefund = {
  id: string
  userId: string
  email: string
  publicKey: string
  rojos: string
  crcAmount: number
  phone?: string
  phoneDisplay?: string
  stellarHash: string
  status: 'pending_cash' | 'paid'
  createdAt: string
  paidAt?: string
  cashierEmail?: string
}

export async function fetchCashRefunds() {
  return request<{ refunds: CashRefund[] }>('/api/admin/cash-refunds')
}

export async function requestBalanceRefund(phone: string) {
  return request<{ refund: CashRefund; message: string }>('/api/payments/refund', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export async function markRefundPaid(id: string) {
  return request<{ refund: CashRefund }>('/api/admin/cash-refund-paid', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
}

export async function creditCash(input: { userId: string; crcAmount: number }) {
  return request<{ credit: CashCredit; message: string }>(
    '/api/admin/cash-credit',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: input.userId,
        crc_amount: input.crcAmount,
      }),
    },
  )
}

export function previewRojos(crcAmount: number): {
  rojos: number
  promoApplied: boolean
} {
  if (!Number.isFinite(crcAmount) || crcAmount <= 0) {
    return { rojos: 0, promoApplied: false }
  }
  return {
    rojos: Number((crcAmount / 1000).toFixed(7)),
    promoApplied: false,
  }
}
