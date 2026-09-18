import { loadLocalEnv } from './loadLocalEnv.js'
import { submitCustodialPayment } from './submitPayment.js'
import {
  AuthError,
  authenticate,
  clearSessionCookie,
  createSessionCookie,
  createUser,
  ensureUserLoyaltyTrustline,
  updateUserPlace,
  updateUserPublicKey,
  userFromCookieHeader,
  listPublicPlaces,
  type UserRole,
  ensureDevSuperAdmin,
  ensureDevEventStaff,
} from './auth.js'
import { getAdminOverview, requireSuperAdmin } from './superAdmin.js'
import {
  handleSep24Deposit,
  handleSep24Info,
  handleSep24Transaction,
  handleSep24Trustline,
} from './sep24Api.js'
import { parsePlaceBody, reverseNominatim, searchNominatim } from './places.js'
import { handleCardRoutes } from './cardApi.js'
import { handleRwaRoutes } from './rwaApi.js'
import { handleInvoiceRoutes } from './invoicing/invoiceApi.js'
import { handleSinpeRoutes } from './sinpe/sinpeApi.js'
import { handleCashRoutes } from './cash/cashApi.js'
import { handleEventRoutes } from './events/eventApi.js'

loadLocalEnv()

function isAuthError(error: unknown): error is AuthError {
  if (error instanceof AuthError) {
    return true
  }
  return (
    error instanceof Error &&
    error.name === 'AuthError' &&
    'status' in error &&
    typeof (error as AuthError).status === 'number'
  )
}

export async function dispatchApi(input: {
  method: string
  path: string
  cookie?: string
  authorization?: string
  apiKey?: string
  body: Record<string, unknown>
}): Promise<{ status: number; body: unknown; setCookie?: string }> {
  try {
    return await route(input)
  } catch (error) {
    if (isAuthError(error)) {
      return {
        status: error.status,
        body: error.code
          ? { error: error.message, code: error.code }
          : { error: error.message },
      }
    }
    console.error('[api]', error)
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : 'Error interno'
    return { status: 500, body: { error: message } }
  }
}

async function route(input: {
  method: string
  path: string
  cookie?: string
  authorization?: string
  apiKey?: string
  body: Record<string, unknown>
}): Promise<{ status: number; body: unknown; setCookie?: string }> {
  await ensureDevSuperAdmin()
  await ensureDevEventStaff()
  const path = (input.path.split('?')[0] ?? input.path).replace(/\/$/, '') || '/'
  const method = input.method.toUpperCase()

  const sinpeResult = await handleSinpeRoutes({ ...input, path, method })
  if (sinpeResult) {
    return sinpeResult
  }

  const cashResult = await handleCashRoutes({ ...input, path, method })
  if (cashResult) {
    return cashResult
  }

  const eventResult = await handleEventRoutes({ ...input, path, method })
  if (eventResult) {
    return eventResult
  }

  const rwaResult = await handleRwaRoutes({ ...input, path, method })
  if (rwaResult) {
    return rwaResult
  }

  const cardResult = await handleCardRoutes({ ...input, path, method })
  if (cardResult) {
    return cardResult
  }

  const invoiceResult = await handleInvoiceRoutes({ ...input, path, method })
  if (invoiceResult) {
    return invoiceResult
  }

  if (method === 'POST' && path === '/api/payments') {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    const result = await submitCustodialPayment({
      userId: session.id,
      destination: String(input.body.destination ?? ''),
      amount: String(input.body.amount ?? ''),
      asset: String(input.body.asset ?? ''),
      memo: String(input.body.memo ?? ''),
      reward: String(input.body.reward ?? ''),
    })
    return { status: 200, body: result }
  }

  if (
    method === 'GET' &&
    (path === '/api/admin/overview' || path === '/api/admin')
  ) {
    const session = await userFromCookieHeader(input.cookie)
    await requireSuperAdmin(session)
    return { status: 200, body: await getAdminOverview() }
  }

  if (method === 'POST' && path === '/api/auth/register') {
    const user = await createUser({
      email: String(input.body.email ?? ''),
      password: String(input.body.password ?? ''),
      role: input.body.role as UserRole,
    })
    return { status: 201, body: user, setCookie: createSessionCookie(user.id) }
  }

  if (method === 'POST' && path === '/api/auth/login') {
    const user = await authenticate(
      String(input.body.email ?? ''),
      String(input.body.password ?? ''),
    )
    return { status: 200, body: user, setCookie: createSessionCookie(user.id) }
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    return { status: 200, body: { ok: true }, setCookie: clearSessionCookie() }
  }

  if (method === 'GET' && path === '/api/auth/me') {
    const user = await userFromCookieHeader(input.cookie)
    if (!user) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    try {
      await ensureUserLoyaltyTrustline(user.id)
    } catch {
      // Keep the session even if Horizon is slow; register/login still require the trustline.
    }
    return { status: 200, body: user }
  }

  if (method === 'PATCH' && path === '/api/auth/me') {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    const user = await updateUserPublicKey(
      session.id,
      String(input.body.publicKey ?? ''),
    )
    return { status: 200, body: user }
  }

  if (method === 'GET' && path === '/api/places') {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    return { status: 200, body: { places: await listPublicPlaces() } }
  }

  if (method === 'GET' && path === '/api/places/search') {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    if (session.role !== 'merchant') {
      return { status: 403, body: { error: 'Solo empresas pueden buscar direcciones' } }
    }
    const hits = await searchNominatim(String(input.body.q ?? ''))
    return { status: 200, body: { hits } }
  }

  if (method === 'POST' && path === '/api/places/reverse') {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    if (session.role !== 'merchant') {
      return { status: 403, body: { error: 'Solo empresas pueden fijar el pin' } }
    }
    const lat = Number(input.body.lat)
    const lng = Number(input.body.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { status: 400, body: { error: 'Coordenadas no válidas' } }
    }
    const address = await reverseNominatim(lat, lng)
    return { status: 200, body: { address, lat, lng } }
  }

  if (method === 'PUT' && path === '/api/places') {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    const user = await updateUserPlace(session.id, parsePlaceBody(input.body))
    return { status: 200, body: user }
  }

  if (method === 'DELETE' && path === '/api/places') {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    const user = await updateUserPlace(session.id, null)
    return { status: 200, body: user }
  }

  if (path.startsWith('/api/sep24/')) {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return {
        status: 401,
        body: { error: 'No hay sesión', code: 'expired_session' },
      }
    }
    if (method === 'GET' && path === '/api/sep24/info') {
      return { status: 200, body: await handleSep24Info() }
    }
    if (method === 'POST' && path === '/api/sep24/deposit') {
      return { status: 200, body: await handleSep24Deposit(session, input.body) }
    }
    if (method === 'POST' && path === '/api/sep24/transaction') {
      return {
        status: 200,
        body: await handleSep24Transaction(session, input.body),
      }
    }
    if (method === 'POST' && path === '/api/sep24/trustline') {
      return { status: 200, body: await handleSep24Trustline(session) }
    }
  }

  return { status: 404, body: { error: 'Ruta no encontrada' } }
}
