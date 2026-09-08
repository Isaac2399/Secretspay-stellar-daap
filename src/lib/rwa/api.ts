import { AuthApiError } from '@/lib/auth/api'
import type {
  MarketplaceListing,
  RwaHolding,
  TokenizationRequest,
  TokenizationWizardPayload,
} from '@/types/rwa'

export async function fetchRwaListings(): Promise<MarketplaceListing[]> {
  const body = await request<{ listings?: MarketplaceListing[] }>('/api/rwa/listings')
  return body.listings ?? []
}

export async function fetchRwaRequests(): Promise<TokenizationRequest[]> {
  const body = await request<{ requests?: TokenizationRequest[] }>('/api/rwa/requests')
  return body.requests ?? []
}

export async function submitTokenization(
  payload: TokenizationWizardPayload,
): Promise<TokenizationRequest> {
  const body = await request<{ request: TokenizationRequest }>('/api/rwa/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return body.request
}

export async function updateRwaRequest(input: {
  id: string
  status?: TokenizationRequest['status']
  rugmRegistration?: string
  legalContractHash?: string
  generateSpec?: boolean
  published?: boolean
  rejectionReason?: string
}): Promise<TokenizationRequest> {
  const body = await request<{ request: TokenizationRequest }>('/api/rwa/requests', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return body.request
}

export async function fetchRwaPortfolio(): Promise<RwaHolding[]> {
  const body = await request<{ holdings?: RwaHolding[] }>('/api/rwa/portfolio')
  return body.holdings ?? []
}

export async function investInRwa(input: {
  listingId: string
  amount: string
}): Promise<{
  listing: MarketplaceListing
  holding: RwaHolding
  txHash?: string
}> {
  return request('/api/rwa/invest', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function claimRwaDividends(): Promise<RwaHolding[]> {
  const body = await request<{ holdings?: RwaHolding[] }>('/api/rwa/claim', {
    method: 'POST',
  })
  return body.holdings ?? []
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    body = raw
      ? (JSON.parse(raw) as T & { error?: string })
      : ({} as T & { error?: string })
  } catch {
    throw new AuthApiError(
      `El servidor respondió ${response.status} (no JSON).`,
      response.status,
    )
  }
  if (!response.ok) {
    throw new AuthApiError(body.error ?? 'Error de tokenización RWA', response.status)
  }
  return body
}
