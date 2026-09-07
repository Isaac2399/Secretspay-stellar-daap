import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from '@stellar/stellar-sdk'

const FRIENDBOT_URL = 'https://friendbot.stellar.org'
const PLACEHOLDER = /ENTER_YOUR_/i

export async function provisionStellarAccount(): Promise<{
  publicKey: string
  secretKey: string
}> {
  const pair = Keypair.random()
  const publicKey = pair.publicKey()
  const secretKey = pair.secret()

  if (isTestnet()) {
    await fundWithFriendbot(publicKey)
    await waitForAccount(publicKey)
  }

  await ensureLoyaltyTrustline(secretKey)

  return { publicKey, secretKey }
}

export async function ensureLoyaltyTrustline(secretKey: string): Promise<void> {
  await ensureAssetTrustline(secretKey, loyaltyAssetFromEnv())
}

export async function ensureUsdcTrustline(secretKey: string): Promise<void> {
  await ensureAssetTrustline(secretKey, usdcAssetFromEnv())
}

/** Opens (or no-ops) a trustline for a specific USDC issuer, e.g. the one in stellar.toml. */
export async function ensureUsdcTrustlineForIssuer(
  secretKey: string,
  issuer: string,
  code = 'USDC',
): Promise<void> {
  if (!StrKey.isValidEd25519PublicKey(issuer)) {
    throw new Error('El emisor USDC del ancla no es una public key válida.')
  }
  await ensureAssetTrustline(secretKey, new Asset(code, issuer))
}

export async function accountHasUsdcTrustline(publicKey: string): Promise<boolean> {
  const server = new Horizon.Server(horizonUrl())
  const account = await server.loadAccount(publicKey)
  return hasTrustline(account, usdcAssetFromEnv())
}

async function ensureAssetTrustline(secretKey: string, asset: Asset): Promise<void> {
  const pair = Keypair.fromSecret(secretKey)
  const server = new Horizon.Server(horizonUrl())
  const account = await waitForAccount(pair.publicKey())

  if (hasTrustline(account, asset)) {
    return
  }

  const fee = String(await server.fetchBaseFee())
  const transaction = new TransactionBuilder(account, {
    fee,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build()

  transaction.sign(pair)

  try {
    const result = await server.submitTransaction(transaction)
    if (!result.successful && result.successful !== undefined) {
      throw new Error(`Horizon rechazó la trustline de ${asset.getCode()}`)
    }
  } catch (error) {
    if (isAlreadyTrustedError(error)) {
      return
    }
    const detail = error instanceof Error ? error.message : 'error de red'
    throw new Error(`No se pudo abrir la trustline de ${asset.getCode()}: ${detail}`)
  }
}

export function isTestnet(): boolean {
  const network = readEnv(
    'VITE_STELLAR_NETWORK',
    'NEXT_PUBLIC_STELLAR_NETWORK',
  ).toUpperCase()
  if (network === 'PUBLIC') {
    return false
  }
  return networkPassphrase() === Networks.TESTNET
}

export function networkPassphrase(): string {
  return (
    readEnv('VITE_NETWORK_PASSPHRASE') ||
    (isPublicNetwork() ? Networks.PUBLIC : Networks.TESTNET)
  )
}

function isPublicNetwork(): boolean {
  return (
    readEnv(
      'VITE_STELLAR_NETWORK',
      'NEXT_PUBLIC_STELLAR_NETWORK',
    ).toUpperCase() === 'PUBLIC'
  )
}

export function horizonUrl(): string {
  const raw = readEnv('VITE_HORIZON_URL', 'NEXT_PUBLIC_HORIZON_URL')
  const fallback = 'https://horizon-testnet.stellar.org'
  const candidate = stripQuotes(raw) || fallback
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

const MAINNET_USDC_ISSUER =
  'GA5ZSEJYB37JRC5RCJAELWUHTMYHMEKPVGFBMDLM5AH4VEKBE4SKZU7Z'
const TESTNET_USDC_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

export function usdcAssetFromEnv(): Asset {
  const code = readEnv('VITE_USDC_CODE') || 'USDC'
  const issuer =
    readEnv('VITE_USDC_ISSUER') ||
    (isPublicNetwork() ? MAINNET_USDC_ISSUER : TESTNET_USDC_ISSUER)
  if (!StrKey.isValidEd25519PublicKey(issuer)) {
    throw new Error('VITE_USDC_ISSUER no es una public key de Stellar válida.')
  }
  return new Asset(code, issuer)
}

export function loyaltyAssetFromEnv(): Asset {
  const code =
    readEnv(
      'LOYALTY_CODE',
      'VITE_LOYALTY_CODE',
      'NEXT_PUBLIC_LOYALTY_CODE',
    ) || 'ROJOS'
  const issuer =
    readEnv(
      'LOYALTY_ISSUER',
      'VITE_LOYALTY_ISSUER',
      'NEXT_PUBLIC_LOYALTY_ISSUER',
    ) || 'GBSLP3N4R65KVUYBAKQL5XAU67ZFGTNO3WBXJXWGDCH5FM3TFBNKXPPW'

  if (!StrKey.isValidEd25519PublicKey(issuer)) {
    throw new Error(
      'LOYALTY_ISSUER no es una public key de Stellar válida.',
    )
  }
  return new Asset(code, issuer)
}

async function fundWithFriendbot(publicKey: string) {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`
  const response = await fetch(url)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `Friendbot no pudo activar la cuenta (${response.status}): ${detail.slice(0, 180)}`,
    )
  }
}

async function waitForAccount(publicKey: string): Promise<Horizon.AccountResponse> {
  const server = new Horizon.Server(horizonUrl())
  let lastError: unknown
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await server.loadAccount(publicKey)
    } catch (error) {
      lastError = error
      await sleep(400 * (attempt + 1))
    }
  }
  const detail = lastError instanceof Error ? lastError.message : 'timeout'
  throw new Error(`Horizon no encontró la cuenta nueva: ${detail}`)
}

function hasTrustline(account: Horizon.AccountResponse, asset: Asset): boolean {
  return account.balances.some((entry) => {
    if (entry.asset_type === 'native' || entry.asset_type === 'liquidity_pool_shares') {
      return false
    }
    return entry.asset_code === asset.getCode() && entry.asset_issuer === asset.getIssuer()
  })
}

function isAlreadyTrustedError(error: unknown): boolean {
  const extras = (
    error as {
      response?: { data?: { extras?: { result_codes?: { operations?: string[] } } } }
    }
  ).response?.data?.extras?.result_codes?.operations
  return extras?.includes('op_already_exists') === true
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}

function readEnv(...keys: string[]): string {
  const env = process.env
  for (const key of keys) {
    const value = stripQuotes(String(env[key] ?? ''))
    if (value && !PLACEHOLDER.test(value)) {
      return value
    }
  }
  return ''
}
