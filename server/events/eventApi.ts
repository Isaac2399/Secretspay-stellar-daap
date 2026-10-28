import { userFromCookieHeader, type PublicUser } from '../auth.js'
import { AuthError } from '../errors.js'
import { getVapidPublicKey, isPushConfigured } from './push.js'
import {
  removeSubscription,
  saveSubscription,
  type PushSubscriptionJson,
} from './pushStore.js'
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
  createProductForMerchant,
  getEventDetailForAdmin,
  listEventsForAdmin,
  listVenues,
  markOrderReady,
  placeOrder,
  saveEventForMerchant,
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

  if (method === 'GET' && path === '/api/events/admin') {
    requirePlatformAdmin(session)
    return { status: 200, body: { events: await listEventsForAdmin() } }
  }

  // Vercel solo enruta un segmento bajo /api/events/[action].
  if (method === 'GET' && path === '/api/events/admin-detail') {
    requirePlatformAdmin(session)
    const merchantId = String(input.body.merchantId ?? '').trim()
    if (!merchantId) {
      throw new AuthError('Elige la empresa del evento', 400)
    }
    return { status: 200, body: await getEventDetailForAdmin(merchantId) }
  }

  if (method === 'PUT' && path === '/api/events/admin') {
    requirePlatformAdmin(session)
    const merchantId = String(input.body.merchantId ?? '').trim()
    if (!merchantId) {
      throw new AuthError('Elige la empresa del evento', 400)
    }
    return {
      status: 200,
      body: { settings: await saveEventForMerchant(merchantId, input.body) },
    }
  }

  if (
    method === 'POST' &&
    (path === '/api/events/admin-products' || path === '/api/events/admin/products')
  ) {
    requirePlatformAdmin(session)
    const merchantId = String(input.body.merchantId ?? '').trim()
    if (!merchantId) {
      throw new AuthError('Elige la empresa del evento', 400)
    }
    return {
      status: 201,
      body: { product: await createProductForMerchant(merchantId, input.body) },
    }
  }

  if (
    method === 'PATCH' &&
    (path === '/api/events/admin-products' || path === '/api/events/admin/products')
  ) {
    requirePlatformAdmin(session)
    const merchantId = String(input.body.merchantId ?? '').trim()
    if (!merchantId) {
      throw new AuthError('Elige la empresa del evento', 400)
    }
    return {
      status: 200,
      body: { product: await updateProduct(merchantId, input.body) },
    }
  }

  if (
    method === 'DELETE' &&
    (path === '/api/events/admin-products' || path === '/api/events/admin/products')
  ) {
    requirePlatformAdmin(session)
    const merchantId = String(input.body.merchantId ?? '').trim()
    if (!merchantId) {
      throw new AuthError('Elige la empresa del evento', 400)
    }
    await deleteProduct(
      merchantId,
      String(input.body.id ?? input.body.productId ?? ''),
    )
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

  if (method === 'GET' && path === '/api/events/push-vapid') {
    const publicKey = getVapidPublicKey()
    return {
      status: 200,
      body: {
        configured: isPushConfigured() && Boolean(publicKey),
        publicKey,
      },
    }
  }

  if (method === 'POST' && path === '/api/events/push-subscribe') {
    if (session.role !== 'customer') {
      throw new AuthError('Solo el cliente puede suscribirse a avisos de pedido', 403)
    }
    if (!isPushConfigured()) {
      throw new AuthError('Las notificaciones push no están configuradas', 503)
    }
    const subscription = parseSubscriptionBody(input.body)
    await saveSubscription(session.id, subscription)
    return { status: 200, body: { ok: true } }
  }

  if (method === 'POST' && path === '/api/events/push-unsubscribe') {
    const endpoint = String(input.body.endpoint ?? '').trim()
    if (!endpoint) {
      throw new AuthError('Falta el endpoint de la suscripción', 400)
    }
    await removeSubscription(session.id, endpoint)
    return { status: 200, body: { ok: true } }
  }

  if (method === 'GET' && path === '/api/events/orders') {
    const merchantId = resolveBarMerchantId(session, input.body.merchantId)
    return { status: 200, body: { orders: await listMerchantOrders(merchantId) } }
  }

  if (
    method === 'POST' &&
    (path === '/api/events/ready' || path === '/api/events/orders/ready')
  ) {
    const merchantId = resolveBarMerchantId(session, input.body.merchantId)
    return {
      status: 200,
      body: {
        order: await markOrderReady(merchantId, String(input.body.orderId ?? '')),
      },
    }
  }

  if (
    method === 'POST' &&
    (path === '/api/events/complete' || path === '/api/events/orders/complete')
  ) {
    const merchantId = resolveBarMerchantId(session, input.body.merchantId)
    const qr = String(input.body.qr ?? input.body.pickupQr ?? '')
    return {
      status: 200,
      body: { order: await completeOrderByQr(merchantId, qr) },
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

function requirePlatformAdmin(session: PublicUser): PublicUser {
  if (session.role !== 'admin') {
    throw new AuthError('Solo el super admin puede revisar todos los eventos', 403)
  }
  return session
}

/** Merchant acts as self; super admin must pass merchantId of the bar. */
function resolveBarMerchantId(
  session: PublicUser,
  merchantIdRaw: unknown,
): string {
  if (session.role === 'merchant') {
    return session.id
  }
  if (session.role === 'admin') {
    const merchantId = String(merchantIdRaw ?? '').trim()
    if (!merchantId) {
      throw new AuthError('Elige la empresa de la barra', 400)
    }
    return merchantId
  }
  throw new AuthError('Solo la empresa o el super admin pueden entregar pedidos', 403)
}

function parseSubscriptionBody(body: Record<string, unknown>): PushSubscriptionJson {
  const raw =
    body.subscription && typeof body.subscription === 'object'
      ? (body.subscription as Record<string, unknown>)
      : body
  const endpoint = String(raw.endpoint ?? '').trim()
  const keysRaw =
    raw.keys && typeof raw.keys === 'object'
      ? (raw.keys as Record<string, unknown>)
      : {}
  const p256dh = String(keysRaw.p256dh ?? '').trim()
  const auth = String(keysRaw.auth ?? '').trim()
  if (!endpoint || !p256dh || !auth) {
    throw new AuthError('Suscripción push incompleta', 400)
  }
  return {
    endpoint,
    expirationTime:
      typeof raw.expirationTime === 'number' ? raw.expirationTime : null,
    keys: { p256dh, auth },
  }
}
