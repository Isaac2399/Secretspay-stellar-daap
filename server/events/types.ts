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
  createdAt: string
  readyAt?: string
  completedAt?: string
}

export type EventSettings = {
  merchantId: string
  title: string
  pickupLabel: string
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
