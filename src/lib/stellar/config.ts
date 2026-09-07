import { Horizon, Networks } from '@stellar/stellar-sdk'

const MAINNET_USDC_ISSUER =
  'GA5ZSEJYB37JRC5RCJAELWUHTMYHMEKPVGFBMDLM5AH4VEKBE4SKZU7Z'
/** Circle USDC on Stellar Testnet — same issuer as testanchor.stellar.org stellar.toml. */
const TESTNET_USDC_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
const DEFAULT_HORIZON = 'https://horizon-testnet.stellar.org'
const DEFAULT_LOYALTY_CODE = 'ROJOS'
const DEFAULT_LOYALTY_ISSUER =
  'GBSLP3N4R65KVUYBAKQL5XAU67ZFGTNO3WBXJXWGDCH5FM3TFBNKXPPW'
const PLACEHOLDER = /ENTER_YOUR_/i

function envValue(...keys: (keyof ImportMetaEnv)[]): string {
  for (const key of keys) {
    const value = stripQuotes(import.meta.env[key] ?? '')
    if (value && !PLACEHOLDER.test(value)) {
      return value
    }
  }
  return ''
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}

function httpUrl(value: string, fallback: string): string {
  const raw = stripQuotes(value)
  const candidate = raw
    ? raw.startsWith('http://') || raw.startsWith('https://')
      ? raw
      : `https://${raw}`
    : fallback
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return fallback
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return fallback
  }
}

function networkPassphrase(): string {
  const network = envValue(
    'VITE_STELLAR_NETWORK',
    'NEXT_PUBLIC_STELLAR_NETWORK',
  ).toUpperCase()
  if (network === 'PUBLIC') {
    return Networks.PUBLIC
  }
  return envValue('VITE_NETWORK_PASSPHRASE') || Networks.TESTNET
}

const passphrase = networkPassphrase()
const isPublic = passphrase === Networks.PUBLIC

export const stellarConfig = {
  horizonUrl: httpUrl(
    envValue('VITE_HORIZON_URL', 'NEXT_PUBLIC_HORIZON_URL'),
    isPublic ? 'https://horizon.stellar.org' : DEFAULT_HORIZON,
  ),
  networkPassphrase: passphrase,
  usdc: {
    code: envValue('VITE_USDC_CODE') || 'USDC',
    issuer:
      envValue('VITE_USDC_ISSUER') ||
      (isPublic ? MAINNET_USDC_ISSUER : TESTNET_USDC_ISSUER),
  },
  loyalty: {
    code: (
      envValue('VITE_LOYALTY_CODE', 'NEXT_PUBLIC_LOYALTY_CODE') ||
      DEFAULT_LOYALTY_CODE
    ).toUpperCase(),
    issuer:
      envValue('VITE_LOYALTY_ISSUER', 'NEXT_PUBLIC_LOYALTY_ISSUER') ||
      DEFAULT_LOYALTY_ISSUER,
  },
  feeBumpApiUrl: envValue('VITE_FEE_BUMP_API_URL') || '/api/fee-bump',
  pointsPerUsdc: Number(envValue('VITE_POINTS_PER_USDC') || '10'),
  pointsPerXlm: Number(envValue('VITE_POINTS_PER_XLM') || '1'),
}

let horizon: Horizon.Server | null = null

export function getHorizonServer(): Horizon.Server {
  horizon ??= new Horizon.Server(stellarConfig.horizonUrl)
  return horizon
}
