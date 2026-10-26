import { randomBytes, randomUUID } from 'node:crypto'
import { StrKey } from '@stellar/stellar-sdk'
import { findUserById, secretKeyForUser } from '../auth.js'
import {
  catalogProductExists,
  checkoutSale,
  publishEventFee,
  registerCatalogProduct,
  setCatalogStock,
  updateCatalogOffer,
  withMerchantLock,
} from '../escrowContract.js'
import { AuthError } from '../errors.js'
import { loyaltyAssetFromEnv } from '../provisionAccount.js'
import { loadStore } from '../userStore.js'
import { parsePickupQr, serializePickupQr } from './qr.js'
import { loadEventStore, saveEventStore } from './store.js'
import type {
  EventBoardOrder,
  EventOrder,
  EventOrderItem,
  EventProduct,
  EventProductPromo,
  EventAdminRow,
  EventFeeReceipt,
  EventSettings,
  EventVenue,
} from './types.js'

type PublicUserLike = {
  id: string
  email: string
  role: string
  publicKey: string
  place?: { name?: string }
}

export function publicOrder(order: EventOrder, includeSecret: boolean) {
  return {
    id: order.id,
    merchantId: order.merchantId,
    merchantName: order.merchantName,
    orderNumber: order.orderNumber,
    pickupLabel: order.pickupLabel,
    pickupQr: includeSecret ? serializePickupQr(order.id, order.pickupToken) : undefined,
    items: order.items,
    total: order.total,
    asset: order.asset,
    status: order.status,
    stellarHash: order.stellarHash,
    fee: order.fee ?? '0',
    net: order.net ?? order.total,
    feeAccount: order.feeAccount ?? '',
    feeBps: order.feeBps ?? 0,
    createdAt: order.createdAt,
    readyAt: order.readyAt,
    completedAt: order.completedAt,
  }
}

export async function listVenues(): Promise<EventVenue[]> {
  const [store, users] = await Promise.all([loadEventStore(), loadStore()])
  const counts = new Map<string, number>()
  for (const product of store.products) {
    if (!product.active) {
      continue
    }
    counts.set(product.merchantId, (counts.get(product.merchantId) ?? 0) + 1)
  }
  return [...counts.entries()].map(([merchantId, productCount]) => {
    const user = users.users.find((row) => row.id === merchantId)
    const settings = store.settings[merchantId]
    return {
      merchantId,
      title: venueTitle(settings, user),
      pickupLabel: settings?.pickupLabel || 'Barra',
      productCount,
    }
  })
}

export async function getCatalog(merchantId: string) {
  const store = await loadEventStore()
  const users = await loadStore()
  const user = users.users.find((row) => row.id === merchantId)
  if (!user || user.role !== 'merchant') {
    throw new AuthError('No hay barra para esa empresa', 404)
  }
  const settings = store.settings[merchantId]
  return {
    venue: {
      merchantId,
      title: venueTitle(settings, user),
      pickupLabel: settings?.pickupLabel || 'Barra',
      productCount: store.products.filter((p) => p.merchantId === merchantId && p.active)
        .length,
    },
    products: store.products.filter((p) => p.merchantId === merchantId && p.active),
  }
}

export async function getBoard(merchantId: string): Promise<{
  venue: EventVenue
  preparing: EventBoardOrder[]
  ready: EventBoardOrder[]
}> {
  const catalog = await getCatalog(merchantId)
  const store = await loadEventStore()
  const open = store.orders
    .filter(
      (order) =>
        order.merchantId === merchantId &&
        (order.status === 'preparing' || order.status === 'ready'),
    )
    .map(toBoardOrder)
  return {
    venue: catalog.venue,
    preparing: open.filter((order) => order.status === 'preparing'),
    ready: open.filter((order) => order.status === 'ready'),
  }
}

export async function listMerchantProducts(merchantId: string) {
  const store = await loadEventStore()
  return store.products.filter((product) => product.merchantId === merchantId)
}

export async function getMerchantSettings(merchant: PublicUserLike): Promise<EventSettings> {
  const store = await loadEventStore()
  return (
    normalizeSettings(
      store.settings[merchant.id] ?? {
        merchantId: merchant.id,
        title: venueTitle(undefined, merchant),
        pickupLabel: 'Barra',
        feeBps: 0,
        feeAccount: '',
      },
    )
  )
}

export async function saveMerchantSettings(
  merchant: PublicUserLike,
  input: Record<string, unknown>,
): Promise<EventSettings> {
  const title = String(input.title ?? '').trim()
  const pickupLabel = String(input.pickupLabel ?? '').trim() || 'Barra'
  if (!title) {
    throw new AuthError('Indica el nombre del evento o barra', 400)
  }
  const feeBps = parseFeeBps(input.feePercent ?? input.feeBps)
  const feeAccount = parseFeeAccount(input.feeAccount, feeBps)
  const settings: EventSettings = {
    merchantId: merchant.id,
    title: title.slice(0, 80),
    pickupLabel: pickupLabel.slice(0, 40),
    feeBps,
    feeAccount,
  }
  const treasury = feeBps > 0 ? feeAccount : merchant.publicKey
  const hash = await publishEventFee({
    merchant: merchant.publicKey,
    feeBps,
    treasury,
  })
  const store = await loadEventStore()
  if (hash) {
    settings.chainHash = hash
  } else if (store.settings[merchant.id]?.chainHash) {
    settings.chainHash = store.settings[merchant.id].chainHash
  }
  store.settings[merchant.id] = settings
  await saveEventStore(store)
  return settings
}

export async function createProduct(
  merchant: PublicUserLike,
  input: Record<string, unknown>,
): Promise<EventProduct> {
  const now = new Date().toISOString()
  const product: EventProduct = {
    id: randomUUID(),
    merchantId: merchant.id,
    name: requireName(input.name),
    price: requirePrice(input.price),
    asset: resolveAsset(input.asset),
    stock: requireStock(input.stock),
    active: input.active === false ? false : true,
    pickupLabel: String(input.pickupLabel ?? '').trim() || 'Barra',
    promo: parsePromo(input.promo),
    createdAt: now,
    updatedAt: now,
  }
  product.chainHash = await registerCatalogProduct({
    merchant: merchant.publicKey,
    productId: product.id,
    price: product.price,
    stock: product.stock,
    active: product.active,
    promo: product.promo,
  })
  const store = await loadEventStore()
  store.products.unshift(product)
  await saveEventStore(store)
  return product
}

export async function updateProduct(
  merchantId: string,
  input: Record<string, unknown>,
): Promise<EventProduct> {
  const id = String(input.id ?? '').trim()
  if (!id) {
    throw new AuthError('Falta el producto', 400)
  }
  const store = await loadEventStore()
  const product = store.products.find((row) => row.id === id && row.merchantId === merchantId)
  if (!product) {
    throw new AuthError('Producto no encontrado', 404)
  }
  if (input.name !== undefined) {
    product.name = requireName(input.name)
  }
  if (input.price !== undefined) {
    product.price = requirePrice(input.price)
  }
  if (input.asset !== undefined) {
    product.asset = resolveAsset(input.asset)
  }
  if (input.stock !== undefined) {
    product.stock = requireStock(input.stock)
  }
  if (input.active !== undefined) {
    product.active = Boolean(input.active)
  }
  if (input.pickupLabel !== undefined) {
    product.pickupLabel = String(input.pickupLabel).trim() || 'Barra'
  }
  if (input.promo !== undefined) {
    product.promo = parsePromo(input.promo)
  }
  product.updatedAt = new Date().toISOString()
  const merchant = await findUserById(merchantId)
  if (!merchant?.publicKey) {
    throw new AuthError('La barra no tiene cuenta en Stellar', 404)
  }
  product.chainHash = await syncCatalogProduct(merchant.publicKey, product)
  await saveEventStore(store)
  return product
}

export async function deleteProduct(merchantId: string, productId: string): Promise<void> {
  const store = await loadEventStore()
  const index = store.products.findIndex(
    (row) => row.id === productId && row.merchantId === merchantId,
  )
  if (index === -1) {
    throw new AuthError('Producto no encontrado', 404)
  }
  const product = store.products[index]
  const merchant = await findUserById(merchantId)
  if (merchant?.publicKey && (await catalogProductExists(merchant.publicKey, product.id))) {
    product.chainHash = await updateCatalogOffer({
      merchant: merchant.publicKey,
      productId: product.id,
      price: product.price,
      stock: product.stock,
      active: false,
      promo: product.promo,
    })
  }
  store.products.splice(index, 1)
  await saveEventStore(store)
}

export async function placeOrder(
  customer: PublicUserLike,
  input: Record<string, unknown>,
) {
  if (customer.role !== 'customer') {
    throw new AuthError('Solo el cliente puede ordenar desde la app', 403)
  }
  const merchantId = String(input.merchantId ?? '').trim()
  const rawItems = Array.isArray(input.items) ? input.items : []
  if (!merchantId || rawItems.length === 0) {
    throw new AuthError('Elige productos para ordenar', 400)
  }

  const merchant = await findUserById(merchantId)
  if (!merchant || merchant.role !== 'merchant') {
    throw new AuthError('La barra no está disponible', 404)
  }

  const reserved = await reserveStock(merchantId, rawItems)
  const stored = (await loadEventStore()).settings[merchantId]
  const settings = stored ? normalizeSettings(stored) : undefined
  const split = splitPurchase(reserved.total, settings)
  if (split.feeAccount && split.feeAccount === customer.publicKey) {
    await restoreStock(reserved.stockDelta)
    throw new AuthError('La cuenta de comisión no puede ser la del cliente', 400)
  }
  try {
    const paid = await withMerchantLock(merchant.publicKey, async () => {
      const treasury = split.feeBps > 0 && split.feeAccount ? split.feeAccount : merchant.publicKey
      await publishEventFee({
        merchant: merchant.publicKey,
        feeBps: split.feeBps,
        treasury,
      })
      const fresh = await loadEventStore()
      for (const line of reserved.stockDelta) {
        const product = fresh.products.find((row) => row.id === line.productId)
        if (!product) {
          throw new AuthError('Un producto ya no está disponible', 400)
        }
        if (await catalogProductExists(merchant.publicKey, product.id)) {
          continue
        }
        product.chainHash = await registerCatalogProduct({
          merchant: merchant.publicKey,
          productId: product.id,
          price: product.price,
          stock: product.stock + line.qty,
          active: true,
          promo: product.promo,
        })
        await saveEventStore(fresh)
      }
      return checkoutSale({
        customerSecret: await secretKeyForUser(customer.id),
        merchant: merchant.publicKey,
        asset: reserved.asset,
        lines: reserved.stockDelta.map((line) => ({
          productId: line.productId,
          qty: line.qty,
        })),
      })
    })
    const total = stroopsToAmount(paid.gross)
    const settled = splitPurchase(total === '0' ? '0' : total, settings)
    const order = await commitOrder({
      reserved: { ...reserved, total },
      merchant,
      customer,
      stellarHash: paid.hash,
      fee: settled.fee,
      net: settled.net,
      feeAccount: settled.feeAccount,
      feeBps: settled.feeBps,
    })
    return { order: publicOrder(order, true), hash: paid.hash }
  } catch (error) {
    await restoreStock(reserved.stockDelta)
    throw error
  }
}

export async function listMyOrders(customerId: string) {
  const store = await loadEventStore()
  return store.orders
    .filter((order) => order.customerId === customerId)
    .slice(0, 30)
    .map((order) => publicOrder(order, order.status !== 'completed'))
}

export async function listMerchantOrders(merchantId: string) {
  const store = await loadEventStore()
  return store.orders
    .filter((order) => order.merchantId === merchantId)
    .slice(0, 80)
    .map((order) => publicOrder(order, false))
}

export async function markOrderReady(merchantId: string, orderId: string) {
  const store = await loadEventStore()
  const order = store.orders.find((row) => row.id === orderId && row.merchantId === merchantId)
  if (!order) {
    throw new AuthError('Pedido no encontrado', 404)
  }
  if (order.status === 'completed') {
    throw new AuthError('Ese pedido ya se entregó', 400)
  }
  order.status = 'ready'
  order.readyAt = new Date().toISOString()
  await saveEventStore(store)
  return publicOrder(order, false)
}

export async function completeOrderByQr(merchantId: string, rawQr: string) {
  let parsed: { orderId: string; pickupToken: string }
  try {
    parsed = parsePickupQr(rawQr)
  } catch (error) {
    throw new AuthError(error instanceof Error ? error.message : 'QR inválido', 400)
  }
  const store = await loadEventStore()
  const order = store.orders.find((row) => row.id === parsed.orderId)
  if (!order || order.merchantId !== merchantId) {
    throw new AuthError('Ese QR no es de esta barra', 404)
  }
  if (order.pickupToken !== parsed.pickupToken) {
    throw new AuthError('El código del pedido no coincide', 400)
  }
  if (order.status === 'completed') {
    throw new AuthError('Ese pedido ya se entregó', 400)
  }
  order.status = 'completed'
  order.completedAt = new Date().toISOString()
  if (!order.readyAt) {
    order.readyAt = order.completedAt
  }
  await saveEventStore(store)
  return publicOrder(order, false)
}

type ReservedCart = {
  merchantId: string
  orderNumber: string
  items: EventOrderItem[]
  total: string
  asset: string
  pickupLabel: string
  stockDelta: Array<{ productId: string; qty: number }>
}

async function syncCatalogProduct(merchant: string, product: EventProduct): Promise<string> {
  const args = {
    merchant,
    productId: product.id,
    price: product.price,
    stock: product.stock,
    active: product.active,
    promo: product.promo,
  }
  if (!(await catalogProductExists(merchant, product.id))) {
    return registerCatalogProduct(args)
  }
  await updateCatalogOffer(args)
  return setCatalogStock(merchant, product.id, product.stock)
}

async function reserveStock(
  merchantId: string,
  rawItems: unknown[],
): Promise<ReservedCart> {
  const store = await loadEventStore()
  const qtyByProduct = new Map<string, number>()
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const row = raw as { productId?: unknown; qty?: unknown }
    const productId = String(row.productId ?? '').trim()
    const qty = Number(row.qty)
    if (!productId || !Number.isInteger(qty) || qty <= 0) {
      throw new AuthError('Cantidad inválida', 400)
    }
    qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + qty)
  }
  if (qtyByProduct.size === 0) {
    throw new AuthError('Elige productos para ordenar', 400)
  }

  const items: EventOrderItem[] = []
  const stockDelta: Array<{ productId: string; qty: number }> = []
  let asset = ''
  let pickupLabel = 'Barra'
  let total = 0

  for (const [productId, qty] of qtyByProduct) {
    const product = store.products.find(
      (row) => row.id === productId && row.merchantId === merchantId && row.active,
    )
    if (!product) {
      throw new AuthError('Un producto ya no está disponible', 400)
    }
    if (product.stock < qty) {
      throw new AuthError(`No hay suficiente stock de ${product.name}`, 400)
    }
    if (!asset) {
      asset = product.asset
    } else if (asset !== product.asset) {
      throw new AuthError('Paga el pedido en un solo asset', 400)
    }
    pickupLabel = product.pickupLabel || pickupLabel
    product.stock -= qty
    stockDelta.push({ productId, qty })
    const line = lineTotal(product, qty)
    items.push({
      productId,
      name: product.name,
      qty,
      unitPrice: product.price,
      lineTotal: formatAmount(line),
      promoLabel: product.promo?.label,
    })
    total += line
  }

  const nextNumber = (store.counters[merchantId] ?? 0) + 1
  store.counters[merchantId] = nextNumber
  await saveEventStore(store)

  return {
    merchantId,
    orderNumber: String(nextNumber).padStart(3, '0'),
    items,
    total: formatAmount(total),
    asset,
    pickupLabel,
    stockDelta,
  }
}

async function restoreStock(delta: Array<{ productId: string; qty: number }>) {
  const store = await loadEventStore()
  for (const item of delta) {
    const product = store.products.find((row) => row.id === item.productId)
    if (product) {
      product.stock += item.qty
    }
  }
  await saveEventStore(store)
}

async function commitOrder(input: {
  reserved: ReservedCart
  merchant: { id: string; email: string; place?: { name?: string } }
  customer: PublicUserLike
  stellarHash: string
  fee: string
  net: string
  feeAccount: string
  feeBps: number
}): Promise<EventOrder> {
  const settings = (await loadEventStore()).settings[input.merchant.id]
  const order: EventOrder = {
    id: randomUUID(),
    merchantId: input.merchant.id,
    merchantName: venueTitle(settings, input.merchant),
    customerId: input.customer.id,
    customerEmail: input.customer.email,
    orderNumber: input.reserved.orderNumber,
    pickupLabel: input.reserved.pickupLabel,
    pickupToken: randomBytes(9).toString('hex'),
    items: input.reserved.items,
    total: input.reserved.total,
    asset: input.reserved.asset,
    status: 'preparing',
    stellarHash: input.stellarHash,
    fee: input.fee,
    net: input.net,
    feeAccount: input.feeAccount,
    feeBps: input.feeBps,
    createdAt: new Date().toISOString(),
  }
  const store = await loadEventStore()
  store.orders.unshift(order)
  await saveEventStore(store)
  return order
}

function lineTotal(product: EventProduct, qty: number): number {
  const paidQty = payableQty(qty, product.promo)
  const discount = Math.min(Math.max(product.promo?.discountPct ?? 0, 0), 100) / 100
  return Number(product.price) * paidQty * (1 - discount)
}

function payableQty(qty: number, promo?: EventProductPromo): number {
  const buyQty = promo?.buyQty ?? 0
  const getQty = promo?.getQty ?? 0
  if (buyQty <= 0 || getQty <= 0) {
    return qty
  }
  const group = buyQty + getQty
  const free = Math.floor(qty / group) * getQty
  return qty - free
}

function toBoardOrder(order: EventOrder): EventBoardOrder {
  return {
    orderNumber: order.orderNumber,
    status: order.status === 'ready' ? 'ready' : 'preparing',
    pickupLabel: order.pickupLabel,
    createdAt: order.createdAt,
    readyAt: order.readyAt,
  }
}

function venueTitle(
  settings: EventSettings | undefined,
  user: { email?: string; place?: { name?: string } } | undefined,
): string {
  return settings?.title || user?.place?.name || user?.email || 'Barra del evento'
}

function requireName(value: unknown): string {
  const name = String(value ?? '').trim()
  if (name.length < 2) {
    throw new AuthError('El nombre del producto es muy corto', 400)
  }
  return name.slice(0, 80)
}

function requirePrice(value: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AuthError('El precio debe ser mayor a 0', 400)
  }
  return formatAmount(amount)
}

function requireStock(value: unknown): number {
  const stock = Number(value)
  if (!Number.isInteger(stock) || stock < 0) {
    throw new AuthError('La cantidad debe ser un entero de 0 o más', 400)
  }
  return stock
}

function resolveAsset(value: unknown): string {
  const requested = String(value ?? '').trim().toUpperCase()
  const loyalty = loyaltyAssetFromEnv().getCode().toUpperCase()
  if (!requested || requested === loyalty) {
    return loyalty
  }
  if (requested === 'USDC' || requested === 'XLM') {
    return requested
  }
  throw new AuthError('Asset no soportado', 400)
}

function parsePromo(value: unknown): EventProductPromo | undefined {
  if (value == null || value === false) {
    return undefined
  }
  if (typeof value !== 'object') {
    throw new AuthError('Promo inválida', 400)
  }
  const raw = value as Record<string, unknown>
  const label = String(raw.label ?? '').trim()
  if (!label) {
    return undefined
  }
  const promo: EventProductPromo = { label: label.slice(0, 40) }
  const discountPct = Number(raw.discountPct)
  if (Number.isFinite(discountPct) && discountPct > 0) {
    promo.discountPct = Math.min(discountPct, 100)
  }
  const buyQty = Number(raw.buyQty)
  const getQty = Number(raw.getQty)
  if (Number.isInteger(buyQty) && buyQty > 0 && Number.isInteger(getQty) && getQty > 0) {
    promo.buyQty = buyQty
    promo.getQty = getQty
  }
  return promo
}

export async function listEventsForAdmin(): Promise<EventAdminRow[]> {
  const [store, users] = await Promise.all([loadEventStore(), loadStore()])
  return users.users
    .filter((user) => user.role === 'merchant')
    .map((user) => {
      const settings = normalizeSettings(
        store.settings[user.id] ?? {
          merchantId: user.id,
          title: venueTitle(undefined, user),
          pickupLabel: 'Barra',
          feeBps: 0,
          feeAccount: '',
        },
      )
      const orders = store.orders.filter((order) => order.merchantId === user.id)
      const feesCollected: Record<string, string> = {}
      const recentFees: EventFeeReceipt[] = []
      for (const order of orders) {
        const fee = order.fee ?? '0'
        if (decimalToStroops(fee) <= 0n) {
          continue
        }
        feesCollected[order.asset] = stroopsToAmount(
          decimalToStroops(feesCollected[order.asset] ?? '0') + decimalToStroops(fee),
        )
        if (recentFees.length < 8) {
          recentFees.push({
            orderNumber: order.orderNumber,
            asset: order.asset,
            fee,
            net: order.net ?? order.total,
            hash: order.stellarHash,
            createdAt: order.createdAt,
          })
        }
      }
      return {
        merchantId: user.id,
        email: user.email,
        merchantPublicKey: user.publicKey,
        title: settings.title,
        pickupLabel: settings.pickupLabel,
        feeBps: settings.feeBps,
        feePercent: feePercentLabel(settings.feeBps),
        feeAccount: settings.feeAccount,
        orderCount: orders.length,
        feesCollected,
        recentFees,
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function saveEventForMerchant(
  merchantId: string,
  input: Record<string, unknown>,
): Promise<EventSettings> {
  const merchant = await findUserById(merchantId)
  if (!merchant || merchant.role !== 'merchant') {
    throw new AuthError('Elige una empresa registrada', 404)
  }
  return saveMerchantSettings(merchant, input)
}

export function splitPurchase(
  total: string,
  settings: EventSettings | undefined,
): { fee: string; net: string; feeAccount: string; feeBps: number } {
  const normalized = settings ? normalizeSettings(settings) : undefined
  const feeBps = normalized?.feeBps ?? 0
  const feeAccount = normalized?.feeAccount ?? ''
  if (feeBps <= 0 || !feeAccount) {
    return { fee: '0', net: total, feeAccount: '', feeBps: 0 }
  }
  const gross = decimalToStroops(total)
  const fee = (gross * BigInt(feeBps)) / 10_000n
  const net = gross - fee
  return {
    fee: stroopsToAmount(fee),
    net: stroopsToAmount(net),
    feeAccount,
    feeBps,
  }
}

function normalizeSettings(settings: EventSettings): EventSettings {
  return {
    ...settings,
    feeBps: settings.feeBps ?? 0,
    feeAccount: settings.feeAccount ?? '',
  }
}

function parseFeeBps(value: unknown): number {
  if (value == null || value === '') {
    return 0
  }
  const percent = Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new AuthError('La comisión debe estar entre 0 y 100', 400)
  }
  return Math.round(percent * 100)
}

function parseFeeAccount(value: unknown, feeBps: number): string {
  const account = String(value ?? '').trim()
  if (!account) {
    if (feeBps > 0) {
      throw new AuthError('Indica la cuenta que recibe la comisión', 400)
    }
    return ''
  }
  if (!StrKey.isValidEd25519PublicKey(account)) {
    throw new AuthError('La cuenta de comisión no es una public key de Stellar', 400)
  }
  return account
}

function feePercentLabel(feeBps: number): string {
  const percent = feeBps / 100
  return Number.isInteger(percent) ? String(percent) : String(percent)
}

function decimalToStroops(amount: string): bigint {
  const trimmed = amount.trim()
  if (!trimmed) {
    return 0n
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new AuthError('El monto no es válido', 400)
  }
  const [whole, frac = ''] = trimmed.split('.')
  const frac7 = `${frac}0000000`.slice(0, 7)
  return BigInt(whole) * 10_000_000n + BigInt(frac7)
}

function stroopsToAmount(stroops: bigint): string {
  if (stroops < 0n) {
    throw new AuthError('El monto no es válido', 400)
  }
  const scale = 10_000_000n
  const whole = stroops / scale
  const frac = (stroops % scale).toString().padStart(7, '0').replace(/0+$/, '')
  return frac ? `${whole.toString()}.${frac}` : whole.toString()
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new AuthError('El total del pedido no es válido', 400)
  }
  const [whole, fraction = ''] = value.toFixed(7).split('.')
  if (!fraction.replace(/0+$/, '')) {
    return whole
  }
  return `${whole}.${fraction.replace(/0+$/, '')}`
}
