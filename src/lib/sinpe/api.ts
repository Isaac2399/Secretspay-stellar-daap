import { AuthApiError } from '@/lib/auth/api'

export type UnassignedDeposit = {
  id: string
  referenceId: string
  crcAmount: number
  calculatedRojos: number
  promoApplied: boolean
  comment: string
  sender: string
  rawMessage: string
  timestamp: number
  status: 'PENDING_MANUAL_MATCH' | 'RESOLVED' | 'RESOLVED_BY_USER_CLAIM'
  lastError?: string
  assignedUserId?: string
  assignedPublicKey?: string
  stellarHash?: string
  createdAt: string
  updatedAt: string
}

export type AssignableUser = {
  id: string
  email: string
  publicKey: string
  sinpeCode?: string
  role: string
}

export type SinpeLookup = {
  deposit?: UnassignedDeposit
  transaction?: {
    referenceId: string
    status: string
    calculatedRojos: number
    stellarHash?: string
    publicKey?: string
    error?: string
  }
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

export async function fetchUnassignedDeposits(query = '') {
  const qs = query.trim()
    ? `?q=${encodeURIComponent(query.trim())}`
    : ''
  return request<{ deposits: UnassignedDeposit[] }>(
    `/api/admin/unassigned-deposits${qs}`,
  )
}

export async function searchAdminUsers(query: string) {
  const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
  return request<{ users: AssignableUser[] }>(`/api/admin/users${qs}`)
}

export async function assignDeposit(input: {
  referenceId: string
  userId: string
}) {
  return request<{ deposit: UnassignedDeposit }>(
    '/api/admin/assign-deposit',
    {
      method: 'POST',
      body: JSON.stringify({
        reference_id: input.referenceId,
        user_id: input.userId,
      }),
    },
  )
}

export async function lookupSinpeClaim(referenceId: string) {
  return request<SinpeLookup>(
    `/api/admin/claim-lookup?reference_id=${encodeURIComponent(referenceId)}`,
  )
}

export async function claimSinpe(referenceId: string) {
  return request<{ message: string; rojos: number; stellarHash?: string }>(
    '/api/payments/claim-sinpe',
    {
      method: 'POST',
      body: JSON.stringify({ reference_id: referenceId }),
    },
  )
}

export async function retryMySinpe() {
  return request<{
    results: Array<{ referenceId: string; ok: boolean; error?: string; hash?: string }>
  }>('/api/payments/sinpe-retry', { method: 'POST', body: '{}' })
}

export async function fetchMySinpe() {
  return request<{
    deposits: UnassignedDeposit[]
    transactions: Array<{
      referenceId: string
      status: string
      calculatedRojos: number
      crcAmount: number
      stellarHash?: string
    }>
  }>('/api/payments/sinpe-mine')
}
