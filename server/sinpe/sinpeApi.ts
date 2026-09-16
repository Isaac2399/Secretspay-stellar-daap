import { AuthError } from '../errors.js'
import { searchAssignableUsers, userFromCookieHeader } from '../auth.js'
import { requireSinpeOps, requireUserSearch } from '../superAdmin.js'
import {
  assignUnassignedDeposit,
  claimSinpeDeposit,
  getSinpeIntent,
  listPendingDeposits,
  lookupSinpeClaim,
  processSinpeSmsWebhook,
  retryMySinpeCredits,
  withParsedAmounts,
} from './service.js'
import { listSinpeForUser } from './store.js'
import { extractSinpeWebhookFields } from './webhookPayload.js'

type ApiInput = {
  method: string
  path: string
  cookie?: string
  authorization?: string
  apiKey?: string
  body: Record<string, unknown>
}

type ApiResult = { status: number; body: unknown; setCookie?: string }

export async function handleSinpeRoutes(
  input: ApiInput,
): Promise<ApiResult | null> {
  const path = canonicalPath(input.path)
  const method = input.method.toUpperCase()

  if (method === 'GET' && path === '/api/payments/sinpe-sms-webhook') {
    return {
      status: 200,
      body: {
        ok: true,
        method: 'GET',
        hint: 'Este endpoint está vivo. Para recargar usa POST con JSON sender, message y timestamp.',
      },
    }
  }

  if (method === 'POST' && path === '/api/payments/sinpe-sms-webhook') {
    assertSinpeWebhookAuth(input)
    const fields = extractSinpeWebhookFields(input.body)
    const result = await processSinpeSmsWebhook(fields)
    console.info('[sinpe-webhook]', {
      sender: fields.sender,
      preview: fields.message.slice(0, 180),
      status: (result as { status?: string }).status,
    })
    return { status: 200, body: result }
  }

  if (method === 'POST' && path === '/api/payments/sinpe-retry') {
    const session = await requireSession(input.cookie)
    const result = await retryMySinpeCredits(session.id)
    return { status: 200, body: result }
  }

  if (method === 'GET' && path === '/api/payments/sinpe-mine') {
    const session = await requireSession(input.cookie)
    const mine = await listSinpeForUser(session.id)
    return {
      status: 200,
      body: {
        ...mine,
        deposits: mine.deposits.map(withParsedAmounts),
      },
    }
  }

  if (method === 'GET' && path === '/api/payments/sinpe-intent') {
    const session = await requireSession(input.cookie)
    return { status: 200, body: await getSinpeIntent(session) }
  }

  if (method === 'POST' && path === '/api/payments/claim-sinpe') {
    const session = await requireSession(input.cookie)
    const result = await claimSinpeDeposit({
      referenceId: String(input.body.reference_id ?? input.body.referenceId ?? ''),
      user: session,
    })
    return { status: 200, body: result }
  }

  if (method === 'GET' && path === '/api/admin/unassigned-deposits') {
    const session = await userFromCookieHeader(input.cookie)
    await requireSinpeOps(session)
    const deposits = await listPendingDeposits(
      optionalString(input.body.reference_id ?? input.body.q),
    )
    return { status: 200, body: { deposits } }
  }

  if (method === 'POST' && path === '/api/admin/assign-deposit') {
    const session = await userFromCookieHeader(input.cookie)
    const admin = await requireSinpeOps(session)
    const crcRaw = input.body.crc_amount ?? input.body.crcAmount
    const result = await assignUnassignedDeposit({
      referenceId: String(input.body.reference_id ?? input.body.referenceId ?? ''),
      userId: String(input.body.user_id ?? input.body.userId ?? ''),
      adminId: admin.id,
      crcAmount:
        crcRaw === undefined || crcRaw === null || crcRaw === ''
          ? undefined
          : Number(crcRaw),
    })
    return { status: 200, body: result }
  }

  if (method === 'GET' && path === '/api/admin/claim-lookup') {
    const session = await userFromCookieHeader(input.cookie)
    await requireSinpeOps(session)
    const referenceId = optionalString(
      input.body.reference_id ?? input.body.q ?? input.body.referenceId,
    )
    if (!referenceId) {
      throw new AuthError('Indica el número de comprobante', 400)
    }
    const result = await lookupSinpeClaim(referenceId)
    return { status: 200, body: result }
  }

  if (method === 'GET' && path === '/api/admin/users') {
    const session = await userFromCookieHeader(input.cookie)
    await requireUserSearch(session)
    const users = await searchAssignableUsers(String(input.body.q ?? ''))
    return { status: 200, body: { users } }
  }

  return null
}

function canonicalPath(raw: string): string {
  const path = (raw.split('?')[0] ?? raw).replace(/\/$/, '') || '/'
  return path.replace(/^\/api\/v1\//, '/api/')
}

function assertSinpeWebhookAuth(input: ApiInput): void {
  const secret = (process.env.SINPE_SMS_API_KEY ?? '').trim()
  if (!secret) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      throw new AuthError('SINPE_SMS_API_KEY es obligatorio', 503)
    }
    return
  }
  const headerKey = (input.apiKey ?? '').trim()
  const bearer = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (headerKey === secret || bearer === secret) {
    return
  }
  throw new AuthError('Webhook SINPE no autorizado', 401)
}

async function requireSession(cookie?: string) {
  const session = await userFromCookieHeader(cookie)
  if (!session?.id) {
    throw new AuthError('No hay sesión', 401)
  }
  return session
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined
  }
  return value.trim()
}
