import { stellarConfig } from './config'

export type ActivityKind = 'sent' | 'received' | 'funded'

export type AccountActivity = {
  id: string
  hash: string
  kind: ActivityKind
  amount: string
  asset: string
  counterparty: string
  memo: string
  createdAt: string
  status: 'success' | 'failed' | 'pending'
  channel?: 'sinpe' | 'bar'
  crcAmount?: string
  detailError?: string
  statusNote?: string
}

type HorizonEffectRecord = {
  id: string
  paging_token?: string
  type: string
  account?: string
  amount?: string
  starting_balance?: string
  asset_type?: string
  asset_code?: string
  created_at: string
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
  transaction_hash?: string
  transaction_successful?: boolean
  transaction?: {
    memo?: string
    successful?: boolean
    created_at?: string
  }
}

type HorizonPage<T> = {
  _embedded?: { records?: T[] }
}

/**
 * Wallet history from Horizon effects (credits/debits). SEP-24 deposits show up
 * here as account_credited even when /payments is slow or omits an op type.
 */
export async function getRecentPayments(
  publicKey: string,
  signal?: AbortSignal,
): Promise<AccountActivity[]> {
  const fromEffects = await fetchEffects(publicKey, signal)
  if (fromEffects.length > 0) {
    return fromEffects
  }
  return fetchPayments(publicKey, signal)
}

async function fetchEffects(
  publicKey: string,
  signal?: AbortSignal,
): Promise<AccountActivity[]> {
  const url = new URL(
    `${stellarConfig.horizonUrl}/accounts/${encodeURIComponent(publicKey)}/effects`,
  )
  url.searchParams.set('order', 'desc')
  url.searchParams.set('limit', '80')

  const response = await fetch(url, { signal })
  if (response.status === 404) {
    return []
  }
  if (!response.ok) {
    throw new Error('No se pudo leer el historial de Horizon')
  }

  const page = (await response.json()) as HorizonPage<HorizonEffectRecord>
  return (page._embedded?.records ?? [])
    .map((record) => effectToActivity(record))
    .filter((item): item is AccountActivity => item !== null)
}

async function fetchPayments(
  publicKey: string,
  signal?: AbortSignal,
): Promise<AccountActivity[]> {
  const url = new URL(
    `${stellarConfig.horizonUrl}/accounts/${encodeURIComponent(publicKey)}/payments`,
  )
  url.searchParams.set('order', 'desc')
  url.searchParams.set('limit', '80')

  const response = await fetch(url, { signal })
  if (response.status === 404) {
    return []
  }
  if (!response.ok) {
    throw new Error('No se pudo leer el historial de Horizon')
  }

  const page = (await response.json()) as HorizonPage<HorizonPaymentRecord>
  return (page._embedded?.records ?? [])
    .map((record) => paymentToActivity(record, publicKey))
    .filter((item): item is AccountActivity => item !== null)
}

function effectToActivity(record: HorizonEffectRecord): AccountActivity | null {
  if (record.type === 'account_created') {
    return {
      id: record.id,
      hash: record.paging_token ?? record.id,
      kind: 'funded',
      amount: record.starting_balance ?? record.amount ?? '0',
      asset: 'XLM',
      counterparty: '',
      memo: 'Cuenta activada',
      createdAt: record.created_at,
      status: 'success',
    }
  }

  if (record.type !== 'account_credited' && record.type !== 'account_debited') {
    return null
  }

  return {
    id: record.id,
    hash: record.paging_token ?? record.id,
    kind: record.type === 'account_debited' ? 'sent' : 'received',
    amount: record.amount ?? '0',
    asset: assetLabel(record.asset_type, record.asset_code),
    counterparty: '',
    memo: record.type === 'account_credited' ? 'Depósito' : '',
    createdAt: record.created_at,
    status: 'success',
  }
}

function paymentToActivity(
  record: HorizonPaymentRecord,
  publicKey: string,
): AccountActivity | null {
  if (record.type === 'create_account') {
    const destination = record.account ?? ''
    const source = record.funder ?? ''
    const kind: ActivityKind =
      source === publicKey ? 'sent' : destination === publicKey ? 'funded' : 'received'
    return {
      id: record.id,
      hash: record.transaction_hash ?? record.id,
      kind,
      amount: record.starting_balance ?? '0',
      asset: 'XLM',
      counterparty: kind === 'sent' ? destination : source,
      memo: record.transaction?.memo ?? '',
      createdAt: record.transaction?.created_at ?? record.created_at,
      status:
        record.transaction?.successful === false ||
        record.transaction_successful === false
          ? 'failed'
          : 'success',
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
  const kind: ActivityKind = from === publicKey ? 'sent' : 'received'

  return {
    id: record.id,
    hash: record.transaction_hash ?? record.id,
    kind,
    amount: record.amount ?? '0',
    asset: assetLabel(record.asset_type, record.asset_code),
    counterparty: kind === 'sent' ? (record.to ?? '') : from,
    memo: record.transaction?.memo ?? '',
    createdAt: record.transaction?.created_at ?? record.created_at,
    status:
      record.transaction?.successful === false ||
      record.transaction_successful === false
        ? 'failed'
        : 'success',
  }
}

function assetLabel(assetType?: string, assetCode?: string): string {
  if (!assetType || assetType === 'native') {
    return 'XLM'
  }
  return assetCode || 'TOKEN'
}

export function activityFromSep24Deposit(tx: {
  id: string
  amount_in?: string
  amount_out?: string
  stellar_transaction_id?: string | null
  completed_at?: string | null
  started_at?: string
}): AccountActivity {
  const amount = tx.amount_out || tx.amount_in || '0'
  const hash = tx.stellar_transaction_id || tx.id
  return {
    id: `sep24:${tx.id}`,
    hash,
    kind: 'received',
    amount,
    asset: 'USDC',
    counterparty: '',
    memo: 'Depósito USDC',
    createdAt: tx.completed_at || tx.started_at || new Date().toISOString(),
    status: 'success',
  }
}

export function mergeHorizonActivity(
  horizon: AccountActivity[],
  optimistic: AccountActivity[],
): AccountActivity[] {
  const remaining = optimistic.filter(
    (item) => !horizon.some((row) => isSameDeposit(row, item)),
  )
  return [...remaining, ...horizon]
}

function isSameDeposit(horizon: AccountActivity, optimistic: AccountActivity): boolean {
  if (optimistic.hash && horizon.hash === optimistic.hash) {
    return true
  }
  if (horizon.kind !== 'received' || horizon.asset !== optimistic.asset) {
    return false
  }
  const sameAmount =
    Number(horizon.amount) === Number(optimistic.amount) && Number(horizon.amount) > 0
  const horizonTime = new Date(horizon.createdAt).getTime()
  const optimisticTime = new Date(optimistic.createdAt).getTime()
  const closeInTime =
    Number.isFinite(horizonTime) &&
    Number.isFinite(optimisticTime) &&
    Math.abs(horizonTime - optimisticTime) < 20 * 60_000
  return sameAmount && closeInTime
}
