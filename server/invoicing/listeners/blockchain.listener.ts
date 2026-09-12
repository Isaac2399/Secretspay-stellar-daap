import { Horizon, StrKey } from '@stellar/stellar-sdk'
import { loadInvoicingEnv, usdEquivalentAssets } from '../config/env.config.js'
import { processPaymentCompleted } from '../controllers/invoice.controller.js'
import { InvoicingError, type PaymentCompletedEvent } from '../types.js'

type HorizonPayment = {
  type?: string
  transaction_hash?: string
  from?: string
  to?: string
  amount?: string
  asset_type?: string
  asset_code?: string
  paging_token?: string
}

type ListenerOptions = {
  merchantWallet?: string
  customerLookup?: (wallet: string) => PaymentCompletedEvent['customerInfo'] | undefined
  cabysCode?: string
  description?: string
}

/**
 * Recibe el payload del webhook HTTP:
 * `{ txHash, walletAddress, amountUSD, customerInfo, cabysCode }`
 */
export async function handlePaymentWebhook(body: unknown) {
  return processPaymentCompleted(body)
}

/**
 * Stream de Horizon (proceso largo). En Vercel usa `pollHorizonPayments`.
 */
export function startHorizonPaymentStream(options: ListenerOptions = {}): () => void {
  const env = loadInvoicingEnv()
  const merchant = options.merchantWallet || env.INVOICE_MERCHANT_WALLET
  if (!merchant || !StrKey.isValidEd25519PublicKey(merchant)) {
    throw new InvoicingError(
      'Configura INVOICE_MERCHANT_WALLET (public key Stellar del comercio) para el listener',
      500,
    )
  }

  const horizon = new Horizon.Server(
    env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  )
  console.info('[invoicing] Escuchando pagos Horizon', {
    merchant,
    horizon: env.HORIZON_URL,
  })

  const close = horizon
    .payments()
    .forAccount(merchant)
    .cursor('now')
    .stream({
      onmessage: (record) => {
        void ingestHorizonPayment(record as HorizonPayment, merchant, options)
      },
      onerror: (error) => {
        console.error('[invoicing] Error en stream Horizon; se puede relanzar el listener', error)
      },
    })

  return close
}

/**
 * Una pasada de Horizon (útil como cron en Vercel).
 */
export async function pollHorizonPayments(
  options: ListenerOptions & { cursor?: string; limit?: number } = {},
): Promise<{ processed: number; skipped: number; cursor?: string }> {
  const env = loadInvoicingEnv()
  const merchant = options.merchantWallet || env.INVOICE_MERCHANT_WALLET
  if (!merchant || !StrKey.isValidEd25519PublicKey(merchant)) {
    throw new InvoicingError(
      'Configura INVOICE_MERCHANT_WALLET para consultar pagos en Horizon',
      400,
    )
  }

  const horizon = new Horizon.Server(
    env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  )
  let builder = horizon
    .payments()
    .forAccount(merchant)
    .limit(options.limit ?? 50)
  builder = options.cursor
    ? builder.cursor(options.cursor).order('asc')
    : builder.order('desc')

  const page = await builder.call()

  let processed = 0
  let skipped = 0
  let cursor = options.cursor
  for (const record of page.records as HorizonPayment[]) {
    cursor = record.paging_token ?? cursor
    const result = await ingestHorizonPayment(record, merchant, options)
    if (result === 'processed') processed += 1
    else skipped += 1
  }
  return { processed, skipped, cursor }
}

async function ingestHorizonPayment(
  record: HorizonPayment,
  merchant: string,
  options: ListenerOptions,
): Promise<'processed' | 'skipped'> {
  if (record.type !== 'payment') {
    return 'skipped'
  }
  if ((record.to ?? '') !== merchant) {
    return 'skipped'
  }

  const env = loadInvoicingEnv()
  const assetCode =
    record.asset_type === 'native' ? 'XLM' : (record.asset_code ?? '').toUpperCase()
  if (!usdEquivalentAssets(env).has(assetCode)) {
    console.info('[invoicing] Pago ignorado: el activo no es USD-equivalente', {
      txHash: record.transaction_hash,
      assetCode,
    })
    return 'skipped'
  }

  const from = record.from ?? ''
  const customer = options.customerLookup?.(from)
  if (!customer) {
    console.warn(
      '[invoicing] Pago on-chain sin customerInfo. POST /api/invoices/from-payment con los datos fiscales, o registra un lookup por wallet.',
      { txHash: record.transaction_hash, from },
    )
    return 'skipped'
  }

  const event: PaymentCompletedEvent = {
    txHash: record.transaction_hash ?? '',
    walletAddress: from,
    amountUSD: Number(record.amount),
    customerInfo: customer,
    cabysCode: options.cabysCode || env.INVOICE_DEFAULT_CABYS,
    description: options.description || env.INVOICE_DEFAULT_DESCRIPTION,
    assetCode,
    network: 'stellar-testnet',
    taxIncluded: true,
  }

  try {
    await processPaymentCompleted(event)
    return 'processed'
  } catch (error) {
    console.error('[invoicing] Falló la emisión desde Horizon; el txHash quedó para reintento', {
      txHash: record.transaction_hash,
      error: error instanceof Error ? error.message : error,
    })
    return 'skipped'
  }
}

if (process.argv[1]?.includes('blockchain.listener')) {
  startHorizonPaymentStream()
}
