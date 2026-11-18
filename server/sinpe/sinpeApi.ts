import { AuthError } from '../errors.js'
import { searchAssignableUsers, userFromCookieHeader } from '../auth.js'
import { requireSinpeOps, requireUserSearch } from '../superAdmin.js'
import {
  activateSinpeCode,
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
import { handleInboundSinpeEmail, syncRecentSinpeEmails } from './inboundEmail.js'
import { createHash, timingSafeEqual } from 'node:crypto'
import { extractSinpeWebhookFields, webhookSecretsFromBody } from './webhookPayload.js'
import { scrubSecrets } from '../safeText.js'

type ApiInput = {
  method: string
  path: string
  cookie?: string
  authorization?: string
  apiKey?: string
  body: Record<string, unknown>
  rawBody?: string
  webhookId?: string
  webhookTimestamp?: string
  webhookSignature?: string
}

type ApiResult = { status: number; body: unknown; setCookie?: string }

export async function handleSinpeRoutes(
  input: ApiInput,
): Promise<ApiResult | null> {
  const path = canonicalPath(input.path)
  const method = input.method.toUpperCase()

  if (method === 'GET' && path === '/api/payments/sinpe-sms-webhook') {
    const fields = extractSinpeWebhookFields(input.body)
    if (!fields.message.trim()) {
      return {
        status: 200,
        body: {
          ok: true,
          method: 'GET',
          hint: 'Este endpoint está vivo. Para recargar usa POST con JSON sender, message y timestamp.',
        },
      }
    }
    return handleSinpeWebhook(input, fields)
  }

  if (method === 'POST' && path === '/api/payments/sinpe-sms-webhook') {
    return handleSinpeWebhook(input, extractSinpeWebhookFields(input.body))
  }

  if (method === 'POST' && path === '/api/payments/sinpe-email-webhook') {
    const result = await handleInboundSinpeEmail(input)
    return { status: 200, body: result }
  }

  if (method === 'POST' && path === '/api/payments/sinpe-email-sweep') {
    assertSinpeWebhookAuth(input)
    const result = await syncRecentSinpeEmails()
    return { status: 200, body: { ok: true, results: result } }
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

  // POST en la misma ruta (1 segmento): Vercel ya enruta /sinpe-intent.
  // Alias /sinpe-activate y la ruta anidada por compatibilidad.
  if (
    method === 'POST' &&
    (path === '/api/payments/sinpe-intent' ||
      path === '/api/payments/sinpe-activate' ||
      path === '/api/payments/sinpe-intent/activate')
  ) {
    const session = await requireSession(input.cookie)
    return { status: 200, body: await activateSinpeCode(session) }
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
    const rojosRaw = input.body.rojos_amount ?? input.body.rojosAmount
    const result = await assignUnassignedDeposit({
      referenceId: String(input.body.reference_id ?? input.body.referenceId ?? ''),
      userId: String(input.body.user_id ?? input.body.userId ?? ''),
      adminId: admin.id,
      crcAmount:
        crcRaw === undefined || crcRaw === null || crcRaw === ''
          ? undefined
          : Number(crcRaw),
      rojosAmount:
        rojosRaw === undefined || rojosRaw === null || rojosRaw === ''
          ? undefined
          : Number(rojosRaw),
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

async function handleSinpeWebhook(
  input: ApiInput,
  fields: { sender: string; message: string; timestamp: number },
): Promise<ApiResult> {
  assertSinpeWebhookAuth(input)
  const result = await processSinpeSmsWebhook(fields)
  console.info('[sinpe-webhook]', {
    sender: fields.sender,
    preview: scrubSecrets(fields.message.slice(0, 180)),
    keys: Object.keys(input.body),
    status: (result as { status?: string }).status,
  })
  return { status: 200, body: result }
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
  const fromBody = webhookSecretsFromBody(input.body)
  if ([headerKey, bearer, ...fromBody].some((value) => sameSecret(value, secret))) {
    return
  }
  // SMS Forwarder en el evento manda from/text y no puede poner el header.
  // Una clave distinta sigue rechazada. Sin clave, el SMS del banco entra.
  if (!headerKey && !bearer && fromBody.length === 0 && hasForwardedSms(input.body)) {
    console.info('[sinpe-webhook-auth]', { accepted: 'sms-without-key', bodyKeys: Object.keys(input.body) })
    return
  }
  console.info('[sinpe-webhook-auth]', {
    bodyKeys: Object.keys(input.body),
    hasApiKeyHeader: headerKey.length > 0,
    hasAuthorization: Boolean((input.authorization ?? '').trim()),
    credentialLengths: [headerKey, bearer, ...fromBody]
      .filter((value) => value.length > 0)
      .map((value) => value.length),
    fingerprints: [headerKey, bearer, ...fromBody]
      .filter((value) => value.length > 0)
      .map((value) => createHash('sha256').update(value).digest('hex').slice(0, 12)),
  })
  throw new AuthError('Webhook SINPE no autorizado', 401)
}

function hasForwardedSms(body: Record<string, unknown>): boolean {
  const text = [body.text, body.message, body.content, body.sms, body.body]
    .find((value) => typeof value === 'string' && value.trim().length > 12)
  return typeof text === 'string'
}

function sameSecret(presented: string, secret: string): boolean {
  if (!presented) {
    return false
  }
  const left = Buffer.from(presented)
  const right = Buffer.from(secret)
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
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
