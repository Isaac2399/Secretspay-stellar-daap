import {
  Asset,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  rpc,
} from '@stellar/stellar-sdk'
import { Client, KeypairSigner, type AssembledTransaction } from '@stellar/stellar-sdk/contract'
import { AuthError } from './errors.js'
import {
  loyaltyAssetFromEnv,
  networkPassphrase,
  usdcAssetFromEnv,
} from './provisionAccount.js'
import type { EventProductPromo } from './events/types.js'

const TESTNET_RPC = 'https://soroban-testnet.stellar.org'
const SECRET_CANDIDATES = [
  'ROJOS_DISTRIBUTOR_SECRET_KEY',
  'SINPE_TREASURY_SECRET_KEY',
  'SUPER_ADMIN_SECRET_KEY',
  'SPONSOR_SECRET_KEY',
]

type CatalogArgs = {
  merchant: string
  productId: string
  price: string
  stock: number
  active: boolean
  promo?: EventProductPromo
}

type EscrowClient = {
  register_product: (
    args: Record<string, unknown>,
    opts?: { timeoutInSeconds?: number },
  ) => Promise<AssembledTransaction<null>>
  update_offer: (
    args: Record<string, unknown>,
    opts?: { timeoutInSeconds?: number },
  ) => Promise<AssembledTransaction<null>>
  set_stock: (
    args: Record<string, unknown>,
    opts?: { timeoutInSeconds?: number },
  ) => Promise<AssembledTransaction<null>>
  set_event_fee: (
    args: Record<string, unknown>,
    opts?: { timeoutInSeconds?: number },
  ) => Promise<AssembledTransaction<null>>
  get_event_fee: (args: { merchant: string }) => Promise<AssembledTransaction<EventFeeView | null>>
  get_product: (args: {
    merchant: string
    product_id: string
  }) => Promise<AssembledTransaction<unknown>>
  checkout: (
    args: Record<string, unknown>,
    opts?: { timeoutInSeconds?: number },
  ) => Promise<AssembledTransaction<bigint>>
}

type EventFeeView = {
  fee_bps?: number
  feeBps?: number
  treasury?: string
}

const tails = new Map<string, Promise<unknown>>()
let clientPromise: Promise<EscrowClient> | null = null

export function escrowContractId(): string {
  const id = (process.env.ESCROW_CONTRACT_ID ?? '').trim()
  if (!id || !StrKey.isValidContract(id)) {
    throw new AuthError(
      'Falta ESCROW_CONTRACT_ID con el contrato de testnet. Sin eso el evento no se puede publicar.',
      503,
    )
  }
  return id
}

export function withMerchantLock<T>(merchant: string, run: () => Promise<T>): Promise<T> {
  const previous = tails.get(merchant) ?? Promise.resolve()
  const current = previous.then(run, run)
  tails.set(
    merchant,
    current.then(
      () => undefined,
      () => undefined,
    ),
  )
  return current
}

export async function catalogProductExists(merchant: string, productId: string): Promise<boolean> {
  const client = await adminClient()
  const tx = await client.get_product({ merchant, product_id: productId })
  const found = tx.result
  return found != null
}

export async function registerCatalogProduct(input: CatalogArgs): Promise<string> {
  const offer = offerArgs(input)
  const hash = await send((client) =>
    client.register_product(
      {
        merchant: input.merchant,
        product_id: input.productId,
        price: offer.price,
        stock: offer.stock,
        discount_bps: offer.discount_bps,
        buy_qty: offer.buy_qty,
        get_qty: offer.get_qty,
      },
      { timeoutInSeconds: 90 },
    ),
  )
  if (input.active) {
    return hash
  }
  return updateCatalogOffer(input)
}

export async function updateCatalogOffer(input: CatalogArgs): Promise<string> {
  const offer = offerArgs(input)
  return send((client) =>
    client.update_offer(
      {
        merchant: input.merchant,
        product_id: input.productId,
        price: offer.price,
        active: input.active,
        discount_bps: offer.discount_bps,
        buy_qty: offer.buy_qty,
        get_qty: offer.get_qty,
      },
      { timeoutInSeconds: 90 },
    ),
  )
}

export async function setCatalogStock(
  merchant: string,
  productId: string,
  stock: number,
): Promise<string> {
  return send((client) =>
    client.set_stock(
      {
        merchant,
        product_id: productId,
        stock: toU32(stock),
      },
      { timeoutInSeconds: 90 },
    ),
  )
}

export async function publishEventFee(input: {
  merchant: string
  feeBps: number
  treasury: string
}): Promise<string> {
  const current = await readEventFee(input.merchant)
  if (
    current &&
    current.feeBps === input.feeBps &&
    current.treasury === input.treasury
  ) {
    return current.hash ?? ''
  }
  return send((client) =>
    client.set_event_fee(
      {
        caller: adminKeypair().publicKey(),
        merchant: input.merchant,
        fee_bps: input.feeBps,
        treasury: input.treasury,
      },
      { timeoutInSeconds: 90 },
    ),
  )
}

export async function checkoutSale(input: {
  customerSecret: string
  merchant: string
  asset: string
  lines: Array<{ productId: string; qty: number }>
}): Promise<{ hash: string; gross: bigint }> {
  await ensureTokenContract(input.asset)
  const customer = Keypair.fromSecret(input.customerSecret)
  const client = await adminClient()
  const tx = await client.checkout(
    {
      customer: customer.publicKey(),
      merchant: input.merchant,
      token: tokenContractId(input.asset),
      lines: input.lines.map((line) => ({
        product_id: line.productId,
        qty: toU32(line.qty),
      })),
    },
    { timeoutInSeconds: 120 },
  )
  const needed = tx.needsNonInvokerSigningBy()
  if (needed.includes(customer.publicKey())) {
    await tx.signAuthEntries({
      address: customer.publicKey(),
      signAuthEntry: new KeypairSigner(customer, networkPassphrase()),
    })
  }
  try {
    const sent = await tx.signAndSend()
    const hash = sent.sendTransactionResponse?.hash
    if (!hash) {
      throw new AuthError('La red no devolvió la transacción de la venta', 502)
    }
    const ledger = sent.getTransactionResponse as { returnValue?: unknown } | undefined
    const gross = readI128(ledger?.returnValue) ?? readI128(sent.result)
    if (gross == null) {
      throw new AuthError('No se pudo leer el monto cobrado por el contrato', 502)
    }
    return { hash, gross }
  } catch (error) {
    if (error instanceof AuthError) {
      throw error
    }
    throw new AuthError(contractError(error), 400)
  }
}

async function readEventFee(
  merchant: string,
): Promise<{ feeBps: number; treasury: string; hash?: string } | null> {
  const client = await adminClient()
  const tx = await client.get_event_fee({ merchant })
  const fee = tx.result
  if (!fee) {
    return null
  }
  const treasury = typeof fee.treasury === 'string' ? fee.treasury : ''
  const feeBps = Number(fee.fee_bps ?? fee.feeBps ?? 0)
  if (!treasury) {
    return null
  }
  return { feeBps, treasury }
}

async function send(
  build: (client: EscrowClient) => Promise<AssembledTransaction<unknown>>,
): Promise<string> {
  try {
    const client = await adminClient()
    const tx = await build(client)
    const sent = await tx.signAndSend()
    const hash = sent.sendTransactionResponse?.hash
    if (!hash) {
      throw new AuthError('La red no devolvió la transacción del contrato', 502)
    }
    void sent.result
    return hash
  } catch (error) {
    if (error instanceof AuthError) {
      throw error
    }
    throw new AuthError(contractError(error), 400)
  }
}

async function adminClient(): Promise<EscrowClient> {
  const contractId = escrowContractId()
  if (!clientPromise) {
    const admin = adminKeypair()
    clientPromise = Client.from({
      contractId,
      rpcUrl: rpcUrl(),
      networkPassphrase: networkPassphrase(),
      publicKey: admin.publicKey(),
      signTransaction: new KeypairSigner(admin, networkPassphrase()),
      signAuthEntry: new KeypairSigner(admin, networkPassphrase()),
    }).then((client) => client as unknown as EscrowClient)
    clientPromise.catch(() => {
      clientPromise = null
    })
  }
  return clientPromise
}

function adminKeypair(): Keypair {
  const contractAdmin = (process.env.ROJOS_DISTRIBUTOR_SECRET_KEY ?? '').trim()
  if (contractAdmin && StrKey.isValidEd25519SecretSeed(contractAdmin)) {
    return Keypair.fromSecret(contractAdmin)
  }
  const issuer = loyaltyAssetFromEnv().getIssuer()
  for (const name of SECRET_CANDIDATES) {
    const secret = (process.env[name] ?? '').trim()
    if (!secret || !StrKey.isValidEd25519SecretSeed(secret)) {
      continue
    }
    const key = Keypair.fromSecret(secret)
    if (issuer && key.publicKey() === issuer) {
      return key
    }
  }
  throw new AuthError(
    'La cuenta que administra el contrato no está disponible en el servidor.',
    503,
  )
}

const readyTokens = new Set<string>()

async function ensureTokenContract(assetCode: string): Promise<void> {
  const asset = assetFromCode(assetCode)
  const id = asset.contractId(networkPassphrase())
  if (readyTokens.has(id)) {
    return
  }
  const server = new rpc.Server(rpcUrl())
  const admin = adminKeypair()
  const account = await server.getAccount(admin.publicKey())
  let tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(Operation.createStellarAssetContract({ asset }))
    .setTimeout(180)
    .build()
  const simulation = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simulation)) {
    if (/exist|already|ExistingValue/i.test(simulation.error)) {
      readyTokens.add(id)
      return
    }
    throw new AuthError(
      `No se pudo preparar el token del contrato. ${simulation.error}`,
      400,
    )
  }
  tx = rpc.assembleTransaction(tx, simulation).build()
  tx.sign(admin)
  const sent = await server.sendTransaction(tx)
  if (sent.status === 'ERROR') {
    throw new AuthError('No se pudo preparar el token del contrato', 502)
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const got = await server.getTransaction(sent.hash)
    if (got.status === 'SUCCESS') {
      readyTokens.add(id)
      return
    }
    if (got.status === 'FAILED') {
      throw new AuthError('No se pudo preparar el token del contrato', 502)
    }
  }
  throw new AuthError('La red no confirmó el token del contrato', 504)
}

function rpcUrl(): string {
  return (process.env.SOROBAN_RPC_URL ?? '').trim() || TESTNET_RPC
}

function tokenContractId(assetCode: string): string {
  return assetFromCode(assetCode).contractId(networkPassphrase())
}

function assetFromCode(assetCode: string): Asset {
  const code = assetCode.trim().toUpperCase()
  const loyalty = loyaltyAssetFromEnv()
  if (code === 'XLM' || code === 'NATIVE') {
    return Asset.native()
  }
  if (code === loyalty.getCode().toUpperCase()) {
    return loyalty
  }
  if (code === 'USDC') {
    return usdcAssetFromEnv()
  }
  throw new AuthError('Ese asset no se puede cobrar por el contrato', 400)
}

function offerArgs(input: CatalogArgs): {
  price: bigint
  stock: number
  discount_bps: number
  buy_qty: number
  get_qty: number
} {
  const discountPct = input.promo?.discountPct ?? 0
  const discountBps = Math.round(Math.min(Math.max(discountPct, 0), 100) * 100)
  return {
    price: decimalToStroops(input.price),
    stock: toU32(input.stock),
    discount_bps: discountBps,
    buy_qty: toU32(input.promo?.buyQty ?? 0),
    get_qty: toU32(input.promo?.getQty ?? 0),
  }
}

function toU32(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 4_294_967_295) {
    throw new AuthError('La cantidad no cabe en el contrato', 400)
  }
  return value
}

function readI128(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value)
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const row = value as { i128?: unknown; toJSON?: () => unknown }
  if (row.i128 != null && row.i128 !== value) {
    const inner = readI128(row.i128)
    if (inner != null) {
      return inner
    }
  }
  if (typeof row.toJSON === 'function') {
    const json = row.toJSON()
    if (json !== value) {
      return readI128(json)
    }
  }
  return null
}

function decimalToStroops(amount: string): bigint {
  const trimmed = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new AuthError('El precio no es válido', 400)
  }
  const [whole, frac = ''] = trimmed.split('.')
  const frac7 = `${frac}0000000`.slice(0, 7)
  return BigInt(whole) * 10_000_000n + BigInt(frac7)
}

export function stroopsToAmount(stroops: bigint): string {
  const scale = 10_000_000n
  const whole = stroops / scale
  const frac = (stroops % scale).toString().padStart(7, '0').replace(/0+$/, '')
  return frac ? `${whole.toString()}.${frac}` : whole.toString()
}

function contractError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  const known: Array<[RegExp, string]> = [
    [/InsufficientStock|#10\b/, 'No hay suficiente stock en el contrato'],
    [/InactiveProduct|#12\b/, 'Ese producto está oculto en el contrato'],
    [/ProductNotFound|#11\b/, 'Ese producto todavía no está en el contrato'],
    [/DuplicateProduct|#13\b/, 'Ese producto ya está en el contrato'],
    [/InvalidPromo|#9\b/, 'La promo no entra en el contrato'],
    [/InsufficientVault|#5\b/, 'La bóveda del contrato no cubre la venta'],
  ]
  for (const [pattern, message] of known) {
    if (pattern.test(text)) {
      return message
    }
  }
  const compact = text.replace(/\s+/g, ' ').slice(0, 240)
  return `El contrato rechazó la operación. ${compact}`
}
