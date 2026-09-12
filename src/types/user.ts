export type UserRole = 'customer' | 'merchant' | 'admin'

export type PlacePromoKind = 'story' | 'purchase' | 'usdc'

export type PlacePromo =
  | { kind: 'story'; rojos: string }
  | { kind: 'purchase'; spend: string; rojos: string }
  | { kind: 'usdc'; rojos: string }

export type BusinessPlace = {
  name: string
  address: string
  lat: number
  lng: number
  category: string
  note?: string
  /** Merchant accepts ROJOS as payment / discount. */
  acceptsRojos?: boolean
  promos?: PlacePromo[]
}

export type AppUser = {
  id?: string
  email: string
  publicKey: string
  sinpeCode?: string
  role: UserRole
  place?: BusinessPlace
}

export type PublicPlace = BusinessPlace & {
  id: string
}

export type PaymentAssetCode = 'XLM' | 'USDC' | string
