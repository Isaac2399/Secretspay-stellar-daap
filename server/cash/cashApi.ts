import { userFromCookieHeader, type PublicUser } from '../auth.js'
import { AuthError } from '../errors.js'
import { requireCashier } from '../superAdmin.js'
import {
  creditCashAtEvent,
  listRecentCashCredits,
  listRecentCashRefunds,
  refundCustomerBalance,
  settleCashRefund,
} from './service.js'

type ApiInput = {
  method: string
  path: string
  cookie?: string
  body: Record<string, unknown>
}

type ApiResult = { status: number; body: unknown; setCookie?: string }

async function requireRefundStaff(cookie: string | undefined): Promise<PublicUser> {
  const session = await userFromCookieHeader(cookie)
  if (!session) {
    throw new AuthError('No hay sesión', 401)
  }
  if (
    session.role !== 'admin' &&
    session.role !== 'cashier' &&
    session.role !== 'sinpe_ops'
  ) {
    throw new AuthError('No puedes ver los reembolsos SINPE', 403)
  }
  return session
}

export async function handleCashRoutes(
  input: ApiInput,
): Promise<ApiResult | null> {
  const path = (input.path.split('?')[0] ?? input.path).replace(/\/$/, '') || '/'
  const method = input.method.toUpperCase()

  if (method === 'GET' && path === '/api/admin/cash-credits') {
    const session = await userFromCookieHeader(input.cookie)
    await requireCashier(session)
    return { status: 200, body: { credits: await listRecentCashCredits() } }
  }

  if (method === 'GET' && path === '/api/admin/cash-refunds') {
    await requireRefundStaff(input.cookie)
    return { status: 200, body: { refunds: await listRecentCashRefunds() } }
  }

  if (method === 'POST' && path === '/api/admin/cash-refund-paid') {
    const cashier = await requireRefundStaff(input.cookie)
    const refund = await settleCashRefund({
      id: String(input.body.id ?? ''),
      cashier,
    })
    return { status: 200, body: { refund } }
  }

  if (method === 'POST' && path === '/api/payments/refund') {
    const session = await userFromCookieHeader(input.cookie)
    if (!session) {
      return { status: 401, body: { error: 'No hay sesión' } }
    }
    const result = await refundCustomerBalance(
      session,
      String(input.body.phone ?? ''),
    )
    return { status: 200, body: result }
  }

  if (method === 'POST' && path === '/api/admin/cash-credit') {
    const session = await userFromCookieHeader(input.cookie)
    const cashier = await requireCashier(session)
    const crcRaw = input.body.crc_amount ?? input.body.crcAmount
    const result = await creditCashAtEvent({
      userId: String(input.body.user_id ?? input.body.userId ?? ''),
      crcAmount: typeof crcRaw === 'number' ? crcRaw : Number(crcRaw),
      cashier,
    })
    return { status: 200, body: result }
  }

  return null
}
