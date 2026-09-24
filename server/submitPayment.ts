import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Operation,
  StrKey,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import {
  secretKeyForUser,
  findUserByPublicKey,
  findUserById,
  isSuperAdminRecord,
  superAdminPublicKey,
} from './auth.js'
import { AuthError } from './errors.js'
import {
  horizonUrl,
  loyaltyAssetFromEnv,
  networkPassphrase,
  usdcAssetFromEnv,
} from './provisionAccount.js'

export async function creditLoyaltyFromTreasury(input: {
  destination: string
  amount: string
  memo?: string
}): Promise<{ hash: string; status: string }> {
  if (!StrKey.isValidEd25519PublicKey(input.destination)) {
    throw new AuthError('La cuenta destino no es válida', 400)
  }
  if (!/^\d+(\.\d{1,7})?$/.test(input.amount) || Number(input.amount) <= 0) {
    throw new AuthError('El monto de ROJOS no es válido', 400)
  }
  const loyalty = loyaltyAssetFromEnv()
  if (!loyalty) {
    throw new AuthError('El token de lealtad no está configurado', 503)
  }
  const sourceSecret = treasurySecret()
  const server = new Horizon.Server(horizonUrl())
  const passphrase = networkPassphrase()
  const sponsor = sponsorKeypair()
  const baseFee = String(await server.fetchBaseFee())
  return submitHorizonPayment({
    server,
    passphrase,
    sponsor,
    baseFee,
    sourceSecret,
    destination: input.destination,
    asset: loyalty,
    amount: input.amount,
    memo: input.memo ?? 'SINPE',
  })
}

export type StaffSendRole = 'admin' | 'sinpe_ops'

export function staffSendSource(role: StaffSendRole): {
  publicKey: string
  label: string
} {
  if (role === 'sinpe_ops') {
    const secret = treasurySecret()
    return {
      publicKey: Keypair.fromSecret(secret).publicKey(),
      label: 'Mesa SINPE',
    }
  }
  const secret = superAdminSigningSecret()
  return {
    publicKey: Keypair.fromSecret(secret).publicKey(),
    label: 'Super admin',
  }
}

export async function submitStaffTransfer(input: {
  role: StaffSendRole
  destination: string
  amount: string
  asset: string
  memo?: string
}): Promise<{ hash: string; status: string; asset: string; source: string }> {
  if (!StrKey.isValidEd25519PublicKey(input.destination)) {
    throw new AuthError('La cuenta destino no es válida', 400)
  }
  if (!/^\d+(\.\d{1,7})?$/.test(input.amount) || Number(input.amount) <= 0) {
    throw new AuthError('El monto no es válido', 400)
  }
  const asset = resolveAsset(input.asset)
  const sourceSecret =
    input.role === 'sinpe_ops' ? treasurySecret() : superAdminSigningSecret()
  const source = Keypair.fromSecret(sourceSecret)
  if (source.publicKey() === input.destination) {
    throw new AuthError('No puedes enviarte a la misma cuenta', 400)
  }

  const server = new Horizon.Server(horizonUrl())
  const payment = await submitHorizonPayment({
    server,
    passphrase: networkPassphrase(),
    sponsor: sponsorKeypair(),
    baseFee: String(await server.fetchBaseFee()),
    sourceSecret,
    destination: input.destination,
    asset,
    amount: input.amount,
    memo: input.memo,
  })
  return {
    ...payment,
    asset: asset.isNative() ? 'XLM' : asset.getCode(),
    source: source.publicKey(),
  }
}

function superAdminSigningSecret(): string {
  const expected = superAdminPublicKey()
  const names = [
    'SUPER_ADMIN_SECRET_KEY',
    'ROJOS_DISTRIBUTOR_SECRET_KEY',
    'SINPE_TREASURY_SECRET_KEY',
    'SPONSOR_SECRET_KEY',
  ]
  for (const name of names) {
    const secret = readSecret(name)
    if (secret && Keypair.fromSecret(secret).publicKey() === expected) {
      return secret
    }
  }
  throw new AuthError(
    'La cuenta super admin no tiene secret key. Configura SUPER_ADMIN_SECRET_KEY con la misma public key del distribuidor.',
    503,
  )
}

function readSecret(name: string): string | null {
  const secret = (process.env[name] ?? '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
  if (!secret || /ENTER_YOUR_/i.test(secret)) {
    return null
  }
  if (!StrKey.isValidEd25519SecretSeed(secret)) {
    return null
  }
  return secret
}

function treasurySecret(): string {
  const secret = (
    process.env.SINPE_TREASURY_SECRET_KEY ??
    process.env.ROJOS_DISTRIBUTOR_SECRET_KEY ??
    process.env.SPONSOR_SECRET_KEY ??
    ''
  )
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
  if (!secret || /ENTER_YOUR_/i.test(secret)) {
    throw new AuthError(
      'Falta SINPE_TREASURY_SECRET_KEY (cuenta distribuidora de ROJOS).',
      503,
    )
  }
  if (!StrKey.isValidEd25519SecretSeed(secret)) {
    throw new AuthError('SINPE_TREASURY_SECRET_KEY no es una secret key válida', 503)
  }
  return secret
}

export async function submitCustodialPayment(input: {
  userId: string
  destination: string
  amount: string
  asset: string
  memo?: string
  reward?: string
}): Promise<{ hash: string; status: string; rewardHash?: string }> {
  if (!StrKey.isValidEd25519PublicKey(input.destination)) {
    throw new AuthError('La cuenta destino no es válida', 400)
  }
  const payer = await findUserById(input.userId)
  if (payer && isSuperAdminRecord(payer)) {
    throw new AuthError('El super admin no envía pagos desde este panel', 403)
  }
  if (!/^\d+(\.\d{1,7})?$/.test(input.amount) || Number(input.amount) <= 0) {
    throw new AuthError('El monto no es válido', 400)
  }

  const reward = parseReward(input.reward)
  const source = Keypair.fromSecret(await secretKeyForUser(input.userId))
  if (source.publicKey() === input.destination) {
    throw new AuthError('No puedes pagarte a ti mismo', 400)
  }

  const asset = resolveAsset(input.asset)
  const loyalty = loyaltyAssetFromEnv()
  const server = new Horizon.Server(horizonUrl())
  const passphrase = networkPassphrase()
  const sponsor = sponsorKeypair()
  const baseFee = String(await server.fetchBaseFee())

  let merchantSecret: string | undefined
  if (reward) {
    if (!loyalty) {
      throw new AuthError('El token de lealtad no está configurado', 400)
    }
    const merchant = await findUserByPublicKey(input.destination)
    if (!merchant || merchant.role !== 'merchant') {
      throw new AuthError(
        'El regalo de puntos solo aplica si el destino es una empresa de Stellar Pay.',
        400,
      )
    }
    merchantSecret = await secretKeyForUser(merchant.id)
    const merchantAccount = await server.loadAccount(merchant.publicKey)
    const available = loyaltyBalance(merchantAccount, loyalty)
    if (Number(available) < Number(reward)) {
      throw new AuthError(
        `La empresa no tiene suficientes ${loyalty.getCode()} para el regalo (tiene ${available}).`,
        400,
      )
    }
  }

  const payment = await submitHorizonPayment({
    server,
    passphrase,
    sponsor,
    baseFee,
    sourceSecret: source.secret(),
    destination: input.destination,
    asset,
    amount: input.amount,
    memo: input.memo,
  })

  if (!reward || !merchantSecret || !loyalty) {
    return payment
  }

  try {
    const gift = await submitHorizonPayment({
      server,
      passphrase,
      sponsor,
      baseFee,
      sourceSecret: merchantSecret,
      destination: source.publicKey(),
      asset: loyalty,
      amount: reward,
      memo: 'regalo',
    })
    return { ...payment, rewardHash: gift.hash }
  } catch (error) {
    const detail = error instanceof AuthError ? error.message : 'no se pudo enviar el regalo'
    throw new AuthError(
      `El pago se envió (${payment.hash}) pero el regalo de puntos falló: ${detail}`,
      400,
    )
  }
}

async function submitHorizonPayment(input: {
  server: Horizon.Server
  passphrase: string
  sponsor: Keypair | null
  baseFee: string
  sourceSecret: string
  destination: string
  asset: Asset
  amount: string
  memo?: string
}): Promise<{ hash: string; status: string }> {
  const source = Keypair.fromSecret(input.sourceSecret)
  const account = await input.server.loadAccount(source.publicKey())
  const builder = new TransactionBuilder(account, {
    fee: input.sponsor ? '0' : input.baseFee,
    networkPassphrase: input.passphrase,
  }).addOperation(
    Operation.payment({
      destination: input.destination,
      asset: input.asset,
      amount: input.amount,
    }),
  )

  if (input.memo) {
    builder.addMemo(Memo.text(input.memo.slice(0, 28)))
  }

  const inner = builder.setTimeout(180).build()
  inner.sign(source)

  try {
    if (input.sponsor) {
      const feeBump = TransactionBuilder.buildFeeBumpTransaction(
        input.sponsor,
        input.baseFee,
        inner,
        input.passphrase,
      )
      feeBump.sign(input.sponsor)
      const result = await input.server.submitTransaction(feeBump)
      return { hash: result.hash, status: 'success' }
    }

    const result = await input.server.submitTransaction(inner)
    return { hash: result.hash, status: 'success' }
  } catch (error) {
    throw new AuthError(horizonPaymentMessage(error), 400)
  }
}

function parseReward(raw: string | undefined): string | undefined {
  const value = String(raw ?? '').trim()
  if (!value) {
    return undefined
  }
  if (!/^\d+(\.\d{1,7})?$/.test(value) || Number(value) <= 0) {
    throw new AuthError('La cantidad de puntos de regalo no es válida', 400)
  }
  return value
}

function loyaltyBalance(
  account: Horizon.AccountResponse,
  asset: Asset,
): string {
  const line = account.balances.find((entry) => {
    if (entry.asset_type === 'native' || entry.asset_type === 'liquidity_pool_shares') {
      return false
    }
    return (
      entry.asset_code === asset.getCode() && entry.asset_issuer === asset.getIssuer()
    )
  })
  return line && 'balance' in line ? line.balance : '0'
}

function resolveAsset(code: string): Asset {
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

  throw new AuthError(`Asset no soportado: ${code}`, 400)
}

function sponsorKeypair(): Keypair | null {
  const secret = process.env.SPONSOR_SECRET_KEY?.trim() ?? ''
  if (!secret || /ENTER_YOUR_/i.test(secret)) {
    return null
  }
  if (!StrKey.isValidEd25519SecretSeed(secret)) {
    return null
  }
  return Keypair.fromSecret(secret)
}

function horizonPaymentMessage(error: unknown): string {
  const extras = (
    error as {
      response?: {
        data?: {
          extras?: { result_codes?: { operations?: string[]; transaction?: string } }
          title?: string
        }
      }
    }
  ).response?.data

  const op = extras?.extras?.result_codes?.operations?.[0]
  if (op === 'op_no_trust') {
    return 'El destino no tiene trustline del token. La cuenta empresa debe haberse registrado con ROJOS configurado.'
  }
  if (op === 'op_underfunded') {
    return 'Saldo insuficiente para este pago.'
  }
  if (op === 'op_no_source_trust') {
    return 'Tu cuenta no tiene trustline de este token.'
  }
  if (op === 'op_line_full') {
    return 'El comercio no puede recibir más de este asset (línea llena).'
  }

  const title = extras?.title
  const tx = extras?.extras?.result_codes?.transaction
  if (op || tx || title) {
    return `El pago fue rechazado: ${op ?? tx ?? title}`
  }
  return error instanceof Error ? error.message : 'No se pudo enviar el pago'
}
