import { AuthError } from '../errors.js'
import { userFromCookieHeader } from '../auth.js'
import {
  cyberfuelEndpoint,
  loadInvoicingEnv,
  missingInvoicingConfig,
} from './config/env.config.js'
import {
  consultInvoiceAtHacienda,
  retryInvoice,
} from './controllers/invoice.controller.js'
import {
  handlePaymentWebhook,
  pollHorizonPayments,
} from './listeners/blockchain.listener.js'
import { findInvoiceByTxHash, listInvoices } from './store.js'
import { InvoicingError } from './types.js'

type ApiInput = {
  method: string
  path: string
  cookie?: string
  authorization?: string
  body: Record<string, unknown>
}

type ApiResult = { status: number; body: unknown; setCookie?: string }

export async function handleInvoiceRoutes(
  input: ApiInput,
): Promise<ApiResult | null> {
  const path = (input.path.split('?')[0] ?? input.path).replace(/\/$/, '') || '/'
  if (!path.startsWith('/api/invoices')) {
    return null
  }

  try {
    return await route(input, path)
  } catch (error) {
    if (error instanceof InvoicingError) {
      return {
        status: error.status,
        body: {
          error: error.message,
          retryable: error.retryable,
          details: error.details,
        },
      }
    }
    throw error
  }
}

async function route(input: ApiInput, path: string): Promise<ApiResult> {
  const method = input.method.toUpperCase()

  if (method === 'GET' && path === '/api/invoices/health') {
    const env = loadInvoicingEnv()
    const missing = missingInvoicingConfig(env)
    return {
      status: 200,
      body: {
        ok: missing.length === 0,
        sandbox: env.CYBERFUEL_ENV === 'stag',
        makeXml: cyberfuelEndpoint('makeXML', env),
        missing,
        emisor: env.EMISOR_NOMBRE || null,
      },
    }
  }

  if (method === 'POST' && path === '/api/invoices/from-payment') {
    assertWebhookAuth(input)
    const result = await handlePaymentWebhook(input.body)
    return {
      status: result.duplicate ? 200 : 201,
      body: {
        duplicate: result.duplicate,
        invoice: result.invoice,
      },
    }
  }

  if (method === 'POST' && path === '/api/invoices/horizon-poll') {
    assertWebhookAuth(input)
    const result = await pollHorizonPayments({
      cursor: optionalString(input.body.cursor),
      merchantWallet: optionalString(input.body.merchantWallet),
    })
    return { status: 200, body: result }
  }

  if (method === 'POST' && path === '/api/invoices/retry') {
    assertWebhookAuth(input)
    const txHash = String(input.body.txHash ?? '')
    const result = await retryInvoice(txHash)
    return { status: 200, body: result }
  }

  const txMatch = path.match(/^\/api\/invoices\/([A-Za-z0-9]+)(?:\/(hacienda))?$/)
  if (txMatch && method === 'GET') {
    await requireSession(input.cookie)
    const txHash = txMatch[1] ?? ''
    if (txMatch[2] === 'hacienda') {
      return { status: 200, body: await consultInvoiceAtHacienda(txHash) }
    }
    const invoice = await findInvoiceByTxHash(txHash)
    if (!invoice) {
      throw new InvoicingError(`No hay factura para ${txHash}`, 404)
    }
    return { status: 200, body: { invoice } }
  }

  if (method === 'GET' && path === '/api/invoices') {
    await requireSession(input.cookie)
    return { status: 200, body: { invoices: await listInvoices() } }
  }

  return { status: 404, body: { error: 'Ruta de facturación no encontrada' } }
}

function assertWebhookAuth(input: ApiInput): void {
  const env = loadInvoicingEnv()
  const secret = env.INVOICE_WEBHOOK_SECRET
  if (!secret) {
    if (env.NODE_ENV === 'production') {
      throw new InvoicingError(
        'INVOICE_WEBHOOK_SECRET es obligatorio en producción',
        503,
      )
    }
    return
  }
  const fromBody =
    typeof input.body.webhookSecret === 'string' ? input.body.webhookSecret : ''
  const fromHeader = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (fromBody === secret || fromHeader === secret) {
    return
  }
  throw new InvoicingError('Webhook no autorizado', 401)
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
