import { userFromCookieHeader } from '../auth.js'
import { requireCashier } from '../superAdmin.js'
import { creditCashAtEvent, listRecentCashCredits } from './service.js'

type ApiInput = {
  method: string
  path: string
  cookie?: string
  body: Record<string, unknown>
}

type ApiResult = { status: number; body: unknown; setCookie?: string }

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
