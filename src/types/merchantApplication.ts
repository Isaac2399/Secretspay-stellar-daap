export type MerchantApplicationStatus = 'pending' | 'approving' | 'approved' | 'rejected'

export type MerchantApplicationView = {
  id: string
  status: MerchantApplicationStatus
  createdAt: string
  decidedAt?: string
  rejectionNote?: string
  email: string
  businessName: string
  contactName: string
  phone: string
  taxId: string
  category: string
  address: string
  description: string
  acceptsRojos: boolean
  userId?: string
}

export type MerchantApplicationInput = {
  email: string
  password: string
  businessName: string
  contactName: string
  phone: string
  taxId: string
  category: string
  address: string
  description: string
  acceptsRojos: boolean
}
