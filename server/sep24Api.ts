import { AuthError } from './errors.js'
import { secretKeyForUser, type PublicUser } from './auth.js'
import {
  ensureUsdcTrustlineForIssuer,
  usdcAssetFromEnv,
} from './provisionAccount.js'
import {
  getUsdcDepositLimits,
  parseSep24Amount,
  parseSep24Rail,
  startInteractiveDeposit,
  getSep24Transaction,
} from './sep/sep24.js'
import { loadAnchorToml } from './sep/toml.js'

export async function handleSep24Deposit(
  user: PublicUser,
  body: Record<string, unknown>,
) {
  const secretKey = await secretKeyForUser(user.id)
  const toml = await loadAnchorToml()
  const issuer = toml.usdcIssuer || usdcAssetFromEnv().getIssuer() || ''
  if (!issuer) {
    throw new AuthError('No hay emisor USDC en el stellar.toml ni en la config', 502)
  }
  try {
    await ensureUsdcTrustlineForIssuer(secretKey, issuer)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'error de Horizon'
    throw new AuthError(
      `No se pudo abrir la trustline de USDC antes del depósito: ${detail}`,
      409,
      'missing_trustline',
    )
  }

  const amount = parseSep24Amount(String(body.amount ?? ''))
  const rail = parseSep24Rail(body.rail)

  const { interactive } = await startInteractiveDeposit({
    publicKey: user.publicKey,
    secretKey,
    amount,
    rail,
  })

  return {
    id: interactive.id,
    url: interactive.url,
    type: interactive.type,
    homeDomain: toml.homeDomain,
    assetCode: 'USDC',
    rail,
  }
}

export async function handleSep24Transaction(
  user: PublicUser,
  body: Record<string, unknown>,
) {
  const id = String(body.id ?? '').trim()
  if (!id) {
    throw new AuthError('Falta el id de la transacción SEP-24', 400)
  }
  const secretKey = await secretKeyForUser(user.id)
  const transaction = await getSep24Transaction({
    publicKey: user.publicKey,
    secretKey,
    id,
  })
  return { transaction }
}

export async function handleSep24Info() {
  const [limits, toml] = await Promise.all([getUsdcDepositLimits(), loadAnchorToml()])
  return {
    assetCode: 'USDC',
    minAmount: limits?.min ?? null,
    maxAmount: limits?.max ?? null,
    homeDomain: toml.homeDomain,
  }
}

export async function handleSep24Trustline(user: PublicUser) {
  const secretKey = await secretKeyForUser(user.id)
  const toml = await loadAnchorToml()
  const issuer = toml.usdcIssuer || usdcAssetFromEnv().getIssuer() || ''
  if (!issuer) {
    throw new AuthError('No hay emisor USDC en el stellar.toml ni en la config', 502)
  }
  await ensureUsdcTrustlineForIssuer(secretKey, issuer)
  return { ok: true, assetCode: 'USDC' }
}
