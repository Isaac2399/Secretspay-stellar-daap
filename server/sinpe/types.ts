export type UnassignedDepositStatus =
  | 'PENDING_MANUAL_MATCH'
  | 'PENDING_USER_CLAIM'
  | 'RESOLVED'
  | 'RESOLVED_BY_USER_CLAIM'

export type SinpeTransactionStatus = 'COMPLETED' | 'FAILED'

export type UnassignedDeposit = {
  id: string
  referenceId: string
  crcAmount: number
  calculatedRojos: number
  promoApplied: boolean
  comment: string
  sender: string
  rawMessage: string
  timestamp: number
  status: UnassignedDepositStatus
  lastError?: string
  assignedUserId?: string
  assignedPublicKey?: string
  stellarHash?: string
  resolvedByAdminId?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export type SinpeTransaction = {
  id: string
  referenceId: string
  crcAmount: number
  calculatedRojos: number
  promoApplied: boolean
  comment: string
  sender: string
  rawMessage: string
  timestamp: number
  status: SinpeTransactionStatus
  userId?: string
  publicKey?: string
  stellarHash?: string
  notification?: string
  error?: string
  createdAt: string
  updatedAt: string
}

/** Código sc…ts emitido al copiar; válido `ttlMs` desde `issuedAt`. */
export type SinpeCodeIssue = {
  id: string
  code: string
  userId: string
  publicKey: string
  issuedAt: string
  expiresAt: string
}

export type SinpeStoreData = {
  sinpeTransactions: SinpeTransaction[]
  unassignedDeposits: UnassignedDeposit[]
  codeIssues: SinpeCodeIssue[]
}
