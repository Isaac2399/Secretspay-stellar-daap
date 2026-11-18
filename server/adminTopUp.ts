import { Asset, StrKey } from '@stellar/stellar-sdk'
import {
  findUserByEmail,
  findUserByPublicKey,
  isSuperAdminRecord,
  secretKeyForUser,
  type UserRole,
} from './auth.js'
import { AuthError } from './errors.js'
import {
  ensureLoyaltyTrustline,
  ensureUsdcTrustline,
  loyaltyAssetFromEnv,
  usdcAssetFromEnv,
} from './provisionAccount.js'
import { submitStaffTransfer } from './submitPayment.js'

export type TopUpAccount = {
  id: string
  email: string
  publicKey: string
  superAdmin: boolean
}

export type TopUpTarget = {
  destination: string
  userId?: string
  email?: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Resuelve la cuenta a recargar. Si vienen email y public key, tienen que ser la misma. */
export function resolveTopUpTarget(input: {
  email?: string
  publicKey?: string
  byEmail?: TopUpAccount
  byPublicKey?: TopUpAccount
}): TopUpTarget {
  const email = (input.email ?? '').trim().toLowerCase()
  const publicKey = (input.publicKey ?? '').trim()
  if (!email && !publicKey) {
    throw new AuthError('Indica el email o la public key de la cuenta', 400)
  }
  if (email && !EMAIL.test(email)) {
    throw new AuthError('El email no es válido', 400)
  }
  if (publicKey && !StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new AuthError('La public key no es válida', 400)
  }
  if (email && !input.byEmail) {
    throw new AuthError('No hay una cuenta con ese email', 404)
  }
  if (input.byEmail && publicKey && input.byEmail.publicKey !== publicKey) {
    throw new AuthError(
      'El email y la public key no corresponden a la misma cuenta',
      400,
    )
  }

  const account =
    input.byEmail ??
    (publicKey && input.byPublicKey?.publicKey === publicKey
      ? input.byPublicKey
      : undefined)
  if (account?.superAdmin) {
    throw new AuthError('No puedes recargar la cuenta del super admin', 400)
  }

  const destination = account?.publicKey ?? publicKey
  if (!destination) {
    throw new AuthError('Indica el email o la public key de la cuenta', 400)
  }
  return {
    destination,
    userId: account?.id,
    email: account?.email,
  }
}

export async function topUpFromSuperAdmin(input: {
  email?: string
  publicKey?: string
  amount: string
  asset: string
  memo?: string
}): Promise<{
  hash: string
  status: string
  asset: string
  source: string
  destination: string
  email?: string
}> {
  const email = (input.email ?? '').trim().toLowerCase()
  const publicKey = (input.publicKey ?? '').trim()
  const [byEmailUser, byKeyUser] = await Promise.all([
    email ? findUserByEmail(email) : Promise.resolve(undefined),
    publicKey ? findUserByPublicKey(publicKey) : Promise.resolve(undefined),
  ])
  const target = resolveTopUpTarget({
    email,
    publicKey,
    byEmail: byEmailUser ? toTopUpAccount(byEmailUser) : undefined,
    byPublicKey: byKeyUser ? toTopUpAccount(byKeyUser) : undefined,
  })
  if (target.userId) {
    await openCustodialTrustline(target.userId, input.asset)
  }
  const payment = await submitStaffTransfer({
    role: 'admin',
    destination: target.destination,
    amount: input.amount,
    asset: input.asset,
    memo: input.memo,
  })
  return {
    ...payment,
    destination: target.destination,
    email: target.email,
  }
}

function toTopUpAccount(user: {
  id: string
  email: string
  publicKey: string
  role: UserRole
}): TopUpAccount {
  return {
    id: user.id,
    email: user.email,
    publicKey: user.publicKey,
    superAdmin: isSuperAdminRecord(user),
  }
}

async function openCustodialTrustline(userId: string, assetCode: string): Promise<void> {
  const asset = assetForTrustline(assetCode)
  if (!asset || asset.isNative()) {
    return
  }
  let secret: string
  try {
    secret = await secretKeyForUser(userId)
  } catch (error) {
    if (error instanceof AuthError && error.status === 400) {
      return
    }
    throw error
  }
  const usdc = usdcAssetFromEnv()
  const loyalty = loyaltyAssetFromEnv()
  try {
    if (sameAsset(asset, usdc)) {
      await ensureUsdcTrustline(secret)
      return
    }
    if (loyalty && sameAsset(asset, loyalty)) {
      await ensureLoyaltyTrustline(secret)
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo abrir la trustline'
    throw new AuthError(message, 502)
  }
}

function assetForTrustline(code: string): Asset | null {
  const normalized = code.trim().toUpperCase()
  if (normalized === 'XLM' || normalized === 'NATIVE') {
    return Asset.native()
  }
  if (normalized === 'USDC' || normalized === 'USD') {
    return usdcAssetFromEnv()
  }
  const loyalty = loyaltyAssetFromEnv()
  if (loyalty && normalized === loyalty.getCode().toUpperCase()) {
    return loyalty
  }
  return null
}

function sameAsset(left: Asset, right: Asset): boolean {
  if (left.isNative() || right.isNative()) {
    return left.isNative() && right.isNative()
  }
  return left.getCode() === right.getCode() && left.getIssuer() === right.getIssuer()
}
