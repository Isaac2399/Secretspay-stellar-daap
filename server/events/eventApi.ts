import { userFromCookieHeader, type PublicUser } from '../auth.js'
import { AuthError } from '../errors.js'
import {
  completeOrderByQr,
  createProduct,
  deleteProduct,
  getBoard,
  getCatalog,
  getMerchantSettings,
  listMerchantOrders,
  listMerchantProducts,
  listMyOrders,
  listVenues,
  markOrderReady,
  placeOrder,
  saveMerchantSettings,
  updateProduct,
} from './service.js'

type ApiInput = {
  method: string
  path: string
  cookie?: string
  body: Record<string, unknown>
}

type ApiResult = { status: number; body: unknown; setCookie?: string }

export async function handleEventRoutes(
  input: ApiInput,
): Promise<ApiResult | null> {
  const path = (input.path.split('?')[0] ?? input.path).replace(/\/$/, '') || '/'
  const method = input.method.toUpperCase()
  if (!path.startsWith('/api/events')) {
    return null
  }

  if (method === 'GET' && path === '/api/events/venues') {
    return { status: 200, body: { venues: await listVenues() } }
  }

  if (method === 'GET' && path === '/api/events/catalog') {
    const merchantId = String(input.body.merchantId ?? '').trim()
    if (!merchantId) {
      throw new AuthError('Falta la empresa de la barra', 400)
    }
    return { status: 200, body: await getCatalog(merchantId) }
  }

  if (method === 'GET' && path === '/api/events/board') {
    const merchantId = String(input.body.merchantId ?? '').trim()
    if (!merchantId) {
      throw new AuthError('Falta la empresa de la barra', 400)
    }
    return { status: 200, body: await getBoard(merchantId) }
  }

  const session = await userFromCookieHeader(input.cookie)
  if (!session) {
    throw new AuthError('No hay sesión', 401)
  }

  if (method === 'GET' && path === '/api/events/products') {
    const merchant = requireMerchant(session)
    return { status: 200, body: { products: await listMerchantProducts(merchant.id) } }
  }

  if (method === 'POST' && path === '/api/events/products') {
    const merchant = requireMerchant(session)
    return { status: 201, body: { product: await createProduct(merchant, input.body) } }
  }

  if (method === 'PATCH' && path === '/api/events/products') {
    const merchant = requireMerchant(session)
    return { status: 200, body: { product: await updateProduct(merchant.id, input.body) } }
  }

  if (method === 'DELETE' && path === '/api/events/products') {
    const merchant = requireMerchant(session)
    await deleteProduct(merchant.id, String(input.body.id ?? input.body.productId ?? ''))
    return { status: 200, body: { ok: true } }
  }

  if (method === 'GET' && path === '/api/events/settings') {
    const merchant = requireMerchant(session)
    return { status: 200, body: { settings: await getMerchantSettings(merchant) } }
  }

  if (method === 'PUT' && path === '/api/events/settings') {
    const merchant = requireMerchant(session)
    return {
      status: 200,
      body: { settings: await saveMerchantSettings(merchant, input.body) },
    }
  }

  if (method === 'POST' && path === '/api/events/orders') {
    return { status: 201, body: await placeOrder(session, input.body) }
  }

  if (method === 'GET' && path === '/api/events/my-orders') {
    return { status: 200, body: { orders: await listMyOrders(session.id) } }
  }

  if (method === 'GET' && path === '/api/events/orders') {
    const merchant = requireMerchant(session)
    return { status: 200, body: { orders: await listMerchantOrders(merchant.id) } }
  }

  if (
    method === 'POST' &&
    (path === '/api/events/ready' || path === '/api/events/orders/ready')
  ) {
    const merchant = requireMerchant(session)
    return {
      status: 200,
      body: {
        order: await markOrderReady(merchant.id, String(input.body.orderId ?? '')),
      },
    }
  }

  if (
    method === 'POST' &&
    (path === '/api/events/complete' || path === '/api/events/orders/complete')
  ) {
    const merchant = requireMerchant(session)
    const qr = String(input.body.qr ?? input.body.pickupQr ?? '')
    return {
      status: 200,
      body: { order: await completeOrderByQr(merchant.id, qr) },
    }
  }

  return { status: 404, body: { error: 'Ruta de evento no encontrada' } }
}

function requireMerchant(session: PublicUser): PublicUser {
  if (session.role !== 'merchant') {
    throw new AuthError('Solo la empresa puede administrar la barra', 403)
  }
  return session
}
