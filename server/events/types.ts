export type EventProductPromo = {
  label: string
  discountPct?: number
  buyQty?: number
  getQty?: number
}

export type EventProduct = {
  id: string
  merchantId: string
  name: string
  price: string
  asset: string
  stock: number
  active: boolean
  pickupLabel: string
  promo?: EventProductPromo
  /** Transacción en la que el producto quedó escrito en el contrato. */
  chainHash?: string
  createdAt: string
  updatedAt: string
}

export type EventOrderStatus = 'preparing' | 'ready' | 'completed' | 'cancelled'

export type EventOrderItem = {
  productId: string
  name: string
  qty: number
  unitPrice: string
  lineTotal: string
  promoLabel?: string
}

export type EventOrder = {
  id: string
  merchantId: string
  merchantName: string
  customerId: string
  customerEmail: string
  orderNumber: string
  pickupLabel: string
  pickupToken: string
  items: EventOrderItem[]
  total: string
  asset: string
  status: EventOrderStatus
  stellarHash?: string
  fee?: string
  net?: string
  feeAccount?: string
  feeBps?: number
  createdAt: string
  readyAt?: string
  completedAt?: string
}

export type EventSettings = {
  merchantId: string
  title: string
  pickupLabel: string
  /** Puntos básicos. 250 = 2,5 %. 0 = no se cobra comisión. */
  feeBps: number
  /** Cuenta G… que recibe `feeBps` de cada compra. */
  feeAccount: string
  /** Transacción en la que esta comisión quedó escrita en el contrato. */
  chainHash?: string
}

export type EventFeeReceipt = {
  orderNumber: string
  asset: string
  fee: string
  net: string
  hash?: string
  createdAt: string
}

export type EventAdminRow = {
  merchantId: string
  email: string
  merchantPublicKey: string
  title: string
  pickupLabel: string
  feeBps: number
  feePercent: string
  feeAccount: string
  orderCount: number
  feesCollected: Record<string, string>
  recentFees: EventFeeReceipt[]
}

export type EventStoreData = {
  products: EventProduct[]
  orders: EventOrder[]
  counters: Record<string, number>
  settings: Record<string, EventSettings>
}

export type EventBoardOrder = {
  orderNumber: string
  status: Extract<EventOrderStatus, 'preparing' | 'ready'>
  pickupLabel: string
  createdAt: string
  readyAt?: string
}

export type EventVenue = {
  merchantId: string
  title: string
  pickupLabel: string
  productCount: number
}
