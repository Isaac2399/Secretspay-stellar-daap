export const SEP24_TERMINAL = new Set([
  'completed',
  'error',
  'expired',
  'refunded',
])

export type Sep24AmountLimits = {
  minAmount: number | null
  maxAmount: number | null
  homeDomain?: string | null
}

export type Sep24ErrorCode = 'missing_trustline' | 'expired_session' | 'amount_out_of_range' | string

export type Sep24Rail = 'cash' | 'card'

export type Sep24InteractiveResponse = {
  id: string
  url: string
  type: string
  homeDomain: string
  assetCode: string
  rail: Sep24Rail
}

export type Sep24Transaction = {
  id: string
  kind: string
  status: string
  status_eta?: number | null
  more_info_url?: string
  amount_in?: string
  amount_out?: string
  amount_in_asset?: string
  amount_out_asset?: string
  started_at?: string
  completed_at?: string | null
  stellar_transaction_id?: string | null
  external_transaction_id?: string | null
  message?: string | null
  memo?: string | null
}

export function isTerminalSep24Status(status: string): boolean {
  return SEP24_TERMINAL.has(status)
}
