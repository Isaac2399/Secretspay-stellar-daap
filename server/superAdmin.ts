import { AuthError } from './errors.js'
import {
  isSuperAdminRecord,
  superAdminPublicKey,
  type PublicUser,
  type StoredUser,
} from './auth.js'
import { loadStore } from './userStore.js'
import { horizonUrl, loyaltyAssetFromEnv, usdcAssetFromEnv } from './provisionAccount.js'
import { loadRwaStore, type RwaStore } from './rwaStore.js'

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

type HorizonPaymentRecord = {
  id: string
  type: string
  from?: string
  to?: string
  account?: string
  funder?: string
  amount?: string
  starting_balance?: string
  asset_type?: string
  asset_code?: string
  created_at: string
  transaction_hash: string
  transaction_successful?: boolean
  transaction?: {
    memo?: string
    memo_type?: string
    successful?: boolean
    created_at?: string
  }
}

export async function requireSuperAdmin(session: PublicUser | null): Promise<PublicUser> {
  if (!session) {
    throw new AuthError('No hay sesión', 401)
  }
  if (session.role !== 'admin') {
    throw new AuthError('Solo el super admin puede ver este panel', 403)
  }
  return session
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const store = await loadStore()
  const merchants = store.users.filter(
    (user) => user.role === 'merchant' && !isSuperAdminRecord(user),
  )
  const customers = store.users.filter(
    (user) => user.role === 'customer' && !isSuperAdminRecord(user),
  )

  const merchantRows = await mapPool(merchants, 4, loadMerchantRow)
  const customerRows = await mapPool(customers, 4, loadCustomerRow)

  const merchantSalesTotal = emptySales()
  for (const row of merchantRows) {
    addTotals(merchantSalesTotal, row.sales)
  }

  const rwa = await loadRwaStore()
  const finance = buildFinance(merchantRows, customerRows, merchantSalesTotal, rwa)

  return {
    distributorPublicKey: superAdminPublicKey(),
    merchants: merchantRows.sort((a, b) => a.email.localeCompare(b.email)),
    customers: customerRows.sort((a, b) => a.email.localeCompare(b.email)),
    merchantSalesTotal,
    finance,
  }
}

async function loadMerchantRow(user: StoredUser): Promise<AdminMerchantRow> {
  const payments = await loadAccountPayments(user.publicKey, 200)
  const sales = emptySales()
  const monthlyUsdcReceived: Record<string, number> = {}
  const monthlyUsdcSent: Record<string, number> = {}
  let receivedCount = 0
  for (const item of payments) {
    if (item.status !== 'success') {
      continue
    }
    const month = item.createdAt.slice(0, 7)
    if (item.kind === 'received') {
      receivedCount += 1
      const asset = saleAsset(item.asset)
      sales[asset] = addAmounts(sales[asset] ?? '0', item.amount)
      if (asset === 'USDC') {
        monthlyUsdcReceived[month] = (monthlyUsdcReceived[month] ?? 0) + Number(item.amount)
      }
    }
    if (item.kind === 'sent' && saleAsset(item.asset) === 'USDC') {
      monthlyUsdcSent[month] = (monthlyUsdcSent[month] ?? 0) + Number(item.amount)
    }
  }
  return {
    id: user.id,
    email: user.email,
    publicKey: user.publicKey,
    createdAt: user.createdAt,
    placeName: user.place?.name,
    sales,
    receivedCount,
    monthlyUsdcReceived,
    monthlyUsdcSent,
  }
}

async function loadCustomerRow(user: StoredUser): Promise<AdminCustomerRow> {
  return {
    id: user.id,
    email: user.email,
    publicKey: user.publicKey,
    createdAt: user.createdAt,
    payments: await loadAccountPayments(user.publicKey, 50),
  }
}

async function loadAccountPayments(
  publicKey: string,
  limit: number,
): Promise<AdminPayment[]> {
  const url = new URL(
    `${horizonUrl()}/accounts/${encodeURIComponent(publicKey)}/payments`,
  )
  url.searchParams.set('order', 'desc')
  url.searchParams.set('limit', String(Math.min(limit, 200)))
  url.searchParams.set('join', 'transactions')

  try {
    const response = await fetch(url)
    if (response.status === 404) {
      return []
    }
    if (!response.ok) {
      return []
    }
    const page = (await response.json()) as {
      _embedded?: { records?: HorizonPaymentRecord[] }
    }
    return (page._embedded?.records ?? [])
      .map((record) => toPayment(record, publicKey))
      .filter((item): item is AdminPayment => item !== null)
  } catch {
    return []
  }
}

function toPayment(
  record: HorizonPaymentRecord,
  publicKey: string,
): AdminPayment | null {
  const failed =
    record.transaction?.successful === false ||
    record.transaction_successful === false
  const status = failed ? 'failed' : 'success'
  const createdAt = record.transaction?.created_at ?? record.created_at
  const memo = record.transaction?.memo ?? ''

  if (record.type === 'create_account') {
    const destination = record.account ?? ''
    const source = record.funder ?? ''
    const kind =
      source === publicKey ? 'sent' : destination === publicKey ? 'funded' : 'received'
    return {
      id: record.id,
      hash: record.transaction_hash,
      kind,
      amount: record.starting_balance ?? '0',
      asset: 'XLM',
      counterparty: kind === 'sent' ? destination : source,
      memo,
      createdAt,
      status,
    }
  }

  if (
    record.type !== 'payment' &&
    record.type !== 'path_payment_strict_send' &&
    record.type !== 'path_payment_strict_receive'
  ) {
    return null
  }

  const from = record.from ?? ''
  const to = record.to ?? ''
  const kind = from === publicKey ? 'sent' : 'received'
  const code =
    record.asset_type === 'native' ? 'XLM' : saleAsset(record.asset_code ?? 'TOKEN')

  return {
    id: record.id,
    hash: record.transaction_hash,
    kind,
    amount: record.amount ?? '0',
    asset: code,
    counterparty: kind === 'sent' ? to : from,
    memo,
    createdAt,
    status,
  }
}

function emptySales(): TokenTotals {
  return {
    XLM: '0',
    USDC: '0',
    [loyaltyCode()]: '0',
  }
}

function saleAsset(code: string): string {
  const upper = code.trim().toUpperCase()
  if (!upper || upper === 'NATIVE') {
    return 'XLM'
  }
  if (upper === 'USDC') {
    return usdcCode()
  }
  if (upper === loyaltyCode().toUpperCase()) {
    return loyaltyCode()
  }
  return upper
}

function usdcCode(): string {
  try {
    return usdcAssetFromEnv().getCode().toUpperCase() || 'USDC'
  } catch {
    return 'USDC'
  }
}

function loyaltyCode(): string {
  try {
    return loyaltyAssetFromEnv().getCode()
  } catch {
    return 'ROJOS'
  }
}

function buildFinance(
  merchants: AdminMerchantRow[],
  customers: AdminCustomerRow[],
  sales: TokenTotals,
  rwa: RwaStore,
): AdminFinance {
  const listings = rwa.listings.filter((row) => row.published)
  const holdingRows = Object.values(rwa.holdings).flat()
  const rwaAumUsd = listings.reduce((sum, row) => sum + Number(row.raisedUsd), 0)
  const rwaTargetUsd = listings.reduce((sum, row) => sum + Number(row.targetUsd), 0)
  const rwaBookUsd = holdingRows.reduce((sum, row) => sum + Number(row.investedUsd), 0)
  const rwaDividendsPaidUsd = holdingRows.reduce(
    (sum, row) => sum + Number(row.claimedDividendsUsd),
    0,
  )
  const rwaMonthlyObligationUsd = listings.reduce((sum, row) => {
    const apy = Number(row.apy) / 100
    const raised = Number(row.raisedUsd)
    if (!Number.isFinite(apy) || !Number.isFinite(raised)) {
      return sum
    }
    return sum + (raised * apy) / 12
  }, 0)
  const rwaInvestors = Object.values(rwa.holdings).filter((rows) => rows.length > 0).length
  const months = last12Months()
  const inflow = Object.fromEntries(months.map((item) => [item.key, 0])) as Record<string, number>
  const outflow = Object.fromEntries(months.map((item) => [item.key, 0])) as Record<string, number>

  for (const merchant of merchants) {
    for (const [month, amount] of Object.entries(merchant.monthlyUsdcReceived)) {
      if (inflow[month] !== undefined) {
        inflow[month] += amount
      }
    }
    for (const [month, amount] of Object.entries(merchant.monthlyUsdcSent)) {
      if (outflow[month] !== undefined) {
        outflow[month] += amount
      }
    }
  }
  let failedPayments = 0
  for (const customer of customers) {
    for (const payment of customer.payments) {
      if (payment.status === 'failed') {
        failedPayments += 1
      }
      if (payment.status !== 'success' || payment.asset !== 'USDC') {
        continue
      }
      const month = payment.createdAt.slice(0, 7)
      if (payment.kind === 'received' && inflow[month] !== undefined) {
        inflow[month] += Number(payment.amount)
      }
      if (payment.kind === 'sent' && outflow[month] !== undefined) {
        outflow[month] += Number(payment.amount)
      }
    }
  }

  const requestStatus = [
    {
      label: 'Auditoría',
      value: rwa.requests.filter((row) => row.status === 'pending_audit').length,
    },
    {
      label: 'Legal',
      value: rwa.requests.filter((row) => row.status === 'legal_review').length,
    },
    {
      label: 'Aprobadas',
      value: rwa.requests.filter((row) => row.status === 'approved').length,
    },
    {
      label: 'Rechazadas',
      value: rwa.requests.filter((row) => row.status === 'rejected').length,
    },
  ]

  return {
    merchantGmvUsdc: Number(sales.USDC ?? 0),
    merchantGmvXlm: Number(sales.XLM ?? 0),
    merchantLoyalty: Number(sales[loyaltyCode()] ?? 0),
    rwaAumUsd,
    rwaTargetUsd,
    rwaBookUsd,
    rwaFundingGapUsd: Math.max(0, rwaTargetUsd - rwaAumUsd),
    rwaDividendsPaidUsd,
    rwaMonthlyObligationUsd,
    rwaAnnualObligationUsd: rwaMonthlyObligationUsd * 12,
    rwaInvestors,
    rwaListings: listings.length,
    pendingRequests: rwa.requests.filter(
      (row) => row.status === 'pending_audit' || row.status === 'legal_review',
    ).length,
    rejectedRequests: rwa.requests.filter((row) => row.status === 'rejected').length,
    failedPayments,
    listingRaised: listings.map((row) => ({
      label: row.assetCode,
      value: Number(row.raisedUsd) || 0,
    })),
    listingObligation: listings.map((row) => ({
      label: row.assetCode,
      value: ((Number(row.raisedUsd) || 0) * (Number(row.apy) || 0)) / 100 / 12,
    })),
    requestStatus: requestStatus.filter((row) => row.value > 0),
    merchantRanking: merchants
      .map((row) => ({
        label: row.placeName || row.email,
        value: Number(row.sales.USDC ?? 0),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    monthly: months.map((item) => {
      const inAmount = inflow[item.key] ?? 0
      const outAmount = outflow[item.key] ?? 0
      return {
        month: item.key,
        label: item.label,
        inflow: inAmount,
        outflow: outAmount,
        net: inAmount - outAmount,
      }
    }),
  }
}

function last12Months(): { key: string; label: string }[] {
  const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const now = new Date()
  const months: { key: string; label: string }[] = []
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: labels[date.getMonth()] ?? '',
    })
  }
  return months
}

function addTotals(target: TokenTotals, extra: TokenTotals) {
  for (const [asset, amount] of Object.entries(extra)) {
    target[asset] = addAmounts(target[asset] ?? '0', amount)
  }
}

function addAmounts(left: string, right: string): string {
  const sum = Number(left) + Number(right)
  if (!Number.isFinite(sum)) {
    return left
  }
  return (Math.round(sum * 1e7) / 1e7).toString()
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  for (let index = 0; index < items.length; index += size) {
    const chunk = items.slice(index, index + size)
    out.push(...(await Promise.all(chunk.map(mapper))))
  }
  return out
}
