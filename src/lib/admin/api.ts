import { AuthApiError } from '@/lib/auth/api'
import type { AdminOverview } from '@/types/admin'

export type StaffSendSource = {
  publicKey: string
  label: string
}

export type StaffSendResult = {
  hash: string
  status: string
  asset: string
  source: string
}

export async function fetchStaffSendSource(): Promise<StaffSendSource> {
  const response = await fetch('/api/admin/send-source', { credentials: 'include' })
  const body = await readJson<StaffSendSource>(response)
  if (!response.ok) {
    throw new AuthApiError(body.error ?? 'No se pudo leer la cuenta de envío', response.status)
  }
  return body
}

export async function sendStaffTransfer(input: {
  destination: string
  amount: string
  asset: string
  memo: string
}): Promise<StaffSendResult> {
  const response = await fetch('/api/admin/send', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await readJson<StaffSendResult>(response)
  if (!response.ok) {
    throw new AuthApiError(body.error ?? 'No se pudo enviar', response.status)
  }
  return body
}

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  const raw = await response.text()
  try {
    return raw
      ? (JSON.parse(raw) as T & { error?: string })
      : ({} as T & { error?: string })
  } catch {
    throw new AuthApiError(
      `El servidor respondió ${response.status} (no JSON).`,
      response.status,
    )
  }
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const response = await fetch('/api/admin/overview', { credentials: 'include' })
  const raw = await response.text()
  let body: AdminOverview & { error?: string }
  try {
    body = raw ? (JSON.parse(raw) as AdminOverview & { error?: string }) : ({} as AdminOverview)
  } catch {
    throw new AuthApiError(
      `El servidor respondió ${response.status} (no JSON). Revisa /api/admin/overview en Vercel.`,
      response.status,
    )
  }
  if (!response.ok) {
    throw new AuthApiError(body.error ?? 'No se pudo cargar el panel', response.status)
  }
  return body
}
