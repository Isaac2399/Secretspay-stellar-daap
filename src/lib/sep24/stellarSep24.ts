/**
 * Client helper for the custodial SEP-10 + SEP-24 deposit flow.
 *
 * Signing the SEP-10 challenge lives on the server (`server/sep/sep10.ts`) so
 * the user secret never reaches the browser. This module is the typed frontend
 * façade used by the deposit modal.
 */
export {
  ensureUsdcTrustline,
  fetchSep24DepositLimits,
  fetchSep24Transaction,
  Sep24ApiError,
  startSep24Deposit,
} from './api'
export {
  isTerminalSep24Status,
  type Sep24AmountLimits,
  type Sep24InteractiveResponse,
  type Sep24Rail,
  type Sep24Transaction,
} from './types'
export { useSep24Deposit, type Sep24Phase } from './useSep24Deposit'
