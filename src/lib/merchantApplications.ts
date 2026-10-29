import { AuthApiError } from '@/lib/auth/api'
import type {
  MerchantApplicationInput,
  MerchantApplicationView,
} from '@/types/merchantApplication'

export async function submitMerchantApplication(
  input: MerchantApplicationInput,
): Promise<{ businessName: string }> {
  const body = await request<{ ok: true; businessName: string }>(
    '/api/auth/merchant-application',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  return { businessName: body.businessName }
}

export async function fetchMerchantApplications(): Promise<MerchantApplicationView[]> {
  const body = await request<{ applications: MerchantApplicationView[] }>(
    '/api/admin/merchant-applications',
    { method: 'GET' },
  )
  return body.applications ?? []
}

export async function decideMerchantApplication(input: {
  id: string
  action: 'approve' | 'reject'
  note?: string
}): Promise<MerchantApplicationView> {
  const body = await request<{ application: MerchantApplicationView }>(
    '/api/admin/merchant-applications',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  return body.application
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
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
