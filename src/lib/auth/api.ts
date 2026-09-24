import type { AppUser } from '@/types/user'

export class AuthApiError extends Error {
  status: number
  code?: string
  constructor(message: unknown, status: number, code?: string) {
    super(errorMessage(message))
    this.name = 'AuthApiError'
    this.status = status
    this.code = code
  }
}

export async function registerUser(input: {
  email: string
  password: string
  role: AppUser['role']
}): Promise<AppUser> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function loginUser(input: {
  email: string
  password: string
}): Promise<AppUser> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchGoogleAuthConfig(): Promise<{
  enabled: boolean
  clientId: string | null
}> {
  const response = await fetch('/api/auth/google-config', { credentials: 'include' })
  if (!response.ok) {
    return { enabled: false, clientId: null }
  }
  return (await response.json()) as { enabled: boolean; clientId: string | null }
}

export async function googleAuthUser(input: {
  accessToken: string
  mode: 'login' | 'register'
  role?: AppUser['role']
}): Promise<AppUser> {
  return request('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function logoutUser(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

export async function fetchSession(): Promise<AppUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' })
  if (response.status === 401) {
    return null
  }
  if (!response.ok) {
    throw new AuthApiError('No se pudo leer la sesión', response.status)
  }
  return (await response.json()) as AppUser
}

export async function updateStoredPublicKey(publicKey: string): Promise<AppUser> {
  return request('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({ publicKey }),
  })
}

async function request(path: string, init: RequestInit): Promise<AppUser> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const raw = await response.text()
  let body: AppUser & { error?: string }
  try {
    body = raw ? (JSON.parse(raw) as AppUser & { error?: string }) : ({} as AppUser)
  } catch {
    throw new AuthApiError(
      `El servidor respondió ${response.status} (no JSON). Revisa las funciones de Vercel.`,
      response.status,
    )
  }
  if (!response.ok) {
    throw new AuthApiError(errorMessage(body.error ?? body), response.status)
  }
  return body
}

function errorMessage(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  if (value && typeof value === 'object') {
    const record = value as { error?: unknown; message?: unknown }
    if (typeof record.error === 'string') {
      return record.error
    }
    if (typeof record.message === 'string') {
      return record.message
    }
    try {
      return JSON.stringify(value)
    } catch {
      return 'Error de autenticación'
    }
  }
  return 'Error de autenticación'
}
