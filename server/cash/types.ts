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

export type CashStoreData = {
  credits: CashCredit[]
}
