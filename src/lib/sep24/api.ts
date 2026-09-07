import type {
  Sep24AmountLimits,
  Sep24ErrorCode,
  Sep24InteractiveResponse,
  Sep24Rail,
  Sep24Transaction,
} from './types'

export class Sep24ApiError extends Error {
  status: number
  code?: Sep24ErrorCode
  constructor(message: string, status: number, code?: Sep24ErrorCode) {
    super(message)
    this.name = 'Sep24ApiError'
    this.status = status
    this.code = code
  }
}

export async function fetchSep24DepositLimits(): Promise<Sep24AmountLimits> {
  const response = await fetch('/api/sep24/info', { credentials: 'include' })
  const raw = await response.text()
  type Envelope = Sep24AmountLimits & { error?: string; code?: string }
  let parsed: Envelope
  try {
    parsed = raw ? (JSON.parse(raw) as Envelope) : ({} as Envelope)
  } catch {
    throw new Sep24ApiError(`El servidor respondió ${response.status}`, response.status)
  }
  if (!response.ok) {
    throw new Sep24ApiError(
      parsed.error || 'No se pudieron leer los límites del ancla',
      response.status,
      parsed.code,
    )
  }
  return {
    minAmount: typeof parsed.minAmount === 'number' ? parsed.minAmount : null,
    maxAmount: typeof parsed.maxAmount === 'number' ? parsed.maxAmount : null,
    homeDomain: typeof parsed.homeDomain === 'string' ? parsed.homeDomain : null,
  }
}

export async function startSep24Deposit(input: {
  amount?: string
  rail: Sep24Rail
}): Promise<Sep24InteractiveResponse> {
  return request<Sep24InteractiveResponse>('/api/sep24/deposit', {
    amount: input.amount || undefined,
    rail: input.rail,
  })
}

export async function fetchSep24Transaction(
  id: string,
): Promise<Sep24Transaction> {
  const body = await request<{ transaction: Sep24Transaction }>(
    '/api/sep24/transaction',
    { id },
  )
  return body.transaction
}

export async function ensureUsdcTrustline(): Promise<void> {
  await request('/api/sep24/trustline', {})
}

async function request<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = await response.text()
  type Envelope = T & { error?: string; code?: string }
  let parsed: Envelope
  try {
    parsed = raw ? (JSON.parse(raw) as Envelope) : ({} as Envelope)
  } catch {
    throw new Sep24ApiError(`El servidor respondió ${response.status}`, response.status)
  }
  if (!response.ok) {
    throw new Sep24ApiError(
      parsed.error || 'No se pudo completar la operación SEP-24',
      response.status,
      parsed.code,
    )
  }
  return parsed
}
