export type CashCredit = {
  id: string
  crcAmount: number
  calculatedRojos: number
  promoApplied: boolean
  userId: string
  publicKey: string
  email: string
  cashierId: string
  cashierEmail: string
  stellarHash?: string
  createdAt: string
}

export type CashRefundStatus = 'pending_cash' | 'paid'

export type CashRefund = {
  id: string
  userId: string
  email: string
  publicKey: string
  rojos: string
  crcAmount: number
  /** Teléfono SINPE Móvil de 8 dígitos que recibe el dinero. */
  phone?: string
  phoneDisplay?: string
  stellarHash: string
  status: CashRefundStatus
  createdAt: string
  paidAt?: string
  cashierEmail?: string
}

export type CashStoreData = {
  credits: CashCredit[]
  refunds: CashRefund[]
}
