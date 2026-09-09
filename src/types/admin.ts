export type AdminPayment = {
  id: string
  hash: string
  kind: 'sent' | 'received' | 'funded'
  amount: string
  asset: string
  counterparty: string
  memo: string
  createdAt: string
  status: 'success' | 'failed'
}

export type TokenTotals = Record<string, string>

export type AdminMerchantRow = {
  id: string
  email: string
  publicKey: string
  createdAt: string
  placeName?: string
  sales: TokenTotals
  receivedCount: number
  monthlyUsdcReceived: Record<string, number>
  monthlyUsdcSent: Record<string, number>
}

export type AdminCustomerRow = {
  id: string
  email: string
  publicKey: string
  createdAt: string
  payments: AdminPayment[]
}

export type AdminOverview = {
  distributorPublicKey: string
  merchants: AdminMerchantRow[]
  customers: AdminCustomerRow[]
  merchantSalesTotal: TokenTotals
  finance: AdminFinance
}

export type AdminMonthPoint = {
  month: string
  label: string
  inflow: number
  outflow: number
  net: number
}

export type AdminFinance = {
  merchantGmvUsdc: number
  merchantGmvXlm: number
  merchantLoyalty: number
  rwaAumUsd: number
  rwaTargetUsd: number
  rwaBookUsd: number
  rwaFundingGapUsd: number
  rwaDividendsPaidUsd: number
  rwaMonthlyObligationUsd: number
  rwaAnnualObligationUsd: number
  rwaInvestors: number
  rwaListings: number
  pendingRequests: number
  rejectedRequests: number
  failedPayments: number
  listingRaised: { label: string; value: number }[]
  listingObligation: { label: string; value: number }[]
  requestStatus: { label: string; value: number }[]
  merchantRanking: { label: string; value: number }[]
  monthly: AdminMonthPoint[]
}
