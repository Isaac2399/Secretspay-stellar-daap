import { z } from 'zod'
import {
  loadInvoicingEnv,
  missingInvoicingConfig,
} from '../config/env.config.js'
import {
  convertUsdToCrc,
  getUsdCrcSellRate,
  splitIva,
} from '../services/currency.service.js'
import {
  buildMakeXmlPayload,
  consultarHacienda,
  createInvoice,
} from '../services/cyberfuel.service.js'
import {
  findInvoiceByTxHash,
  nextComprobante,
  upsertInvoice,
} from '../store.js'
import {
  IvaTarifa,
  InvoicingError,
  type InvoiceMoney,
  type InvoiceRecord,
  type PaymentCompletedEvent,
} from '../types.js'

const idTypes = ['01', '02', '03', '04', '05'] as const

const customerSchema = z.object({
  nombre: z.string().trim().min(2),
  tipoIdentificacion: z.enum(idTypes).optional(),
  numeroIdentificacion: z.string().trim().optional(),
  nombreComercial: z.string().trim().optional(),
  correo: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  ubicacion: z
    .object({
      provincia: z.string().optional(),
      canton: z.string().optional(),
      distrito: z.string().optional(),
      barrio: z.string().optional(),
      sennas: z.string().optional(),
    })
    .optional(),
})

const paymentEventSchema = z.object({
  txHash: z.string().trim().min(8),
  walletAddress: z.string().trim().min(4),
  amountUSD: z.coerce.number().positive(),
  customerInfo: customerSchema,
  cabysCode: z
    .string()
    .trim()
    .regex(/^\d{10,13}$/, 'CAByS debe tener 10-13 dígitos'),
  description: z.string().trim().optional(),
  taxRate: z.coerce.number().min(0).max(13).optional(),
  taxIncluded: z.boolean().optional(),
  assetCode: z.string().trim().optional(),
  network: z.string().trim().optional(),
})

const STALE_PENDING_MS = 2 * 60 * 1000

export function parsePaymentCompletedEvent(
  body: unknown,
): PaymentCompletedEvent {
  const parsed = paymentEventSchema.safeParse(body)
  if (!parsed.success) {
    throw new InvoicingError(
      `Payload de pago inválido: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      400,
    )
  }
  return parsed.data
}

/**
 * Orquesta: valida → idempotencia por txHash → tipo de cambio → CRC → Cyberfuel.
 */
export async function processPaymentCompleted(
  input: unknown,
): Promise<{ invoice: InvoiceRecord; duplicate: boolean }> {
  const env = loadInvoicingEnv()
  const missing = missingInvoicingConfig(env)
  if (missing.length) {
    throw new InvoicingError(
      `Falta configuración de facturación: ${missing.join(', ')}`,
      503,
    )
  }

  const event = parsePaymentCompletedEvent(hydrateDefaults(input, env))
  const existing = await findInvoiceByTxHash(event.txHash)
  if (existing && !canRetry(existing)) {
    return { invoice: existing, duplicate: true }
  }

  const quote = await getUsdCrcSellRate()
  const converted = convertUsdToCrc(event.amountUSD, quote.venta)
  const configuredRate = Number(env.INVOICE_TAX_RATE)
  const taxRate =
    event.taxRate ??
    (Number.isFinite(configuredRate) ? configuredRate : IvaTarifa.General13.tarifa)
  const split = splitIva({
    totalOrNet: converted.amountCRC,
    taxRate,
    taxIncluded: event.taxIncluded !== false,
  })
  const money: InvoiceMoney = {
    amountUSD: converted.amountUSD,
    amountCRC: converted.amountCRC,
    tipoCambio: quote.venta,
    tipoCambioFecha: quote.fecha,
    netoCRC: split.neto,
    ivaCRC: split.iva,
    totalCRC: split.total,
    taxRate,
    codigoTarifa:
      taxRate >= 13 ? IvaTarifa.General13.codigoTarifa : IvaTarifa.Exento.codigoTarifa,
  }

  const consecutivo = existing?.consecutivo ?? (await nextComprobante())
  const pending: InvoiceRecord = {
    txHash: event.txHash,
    walletAddress: event.walletAddress,
    amountUSD: money.amountUSD,
    amountCRC: money.amountCRC,
    tipoCambio: money.tipoCambio,
    tipoCambioFecha: money.tipoCambioFecha,
    cabysCode: event.cabysCode,
    description: event.description ?? env.INVOICE_DEFAULT_DESCRIPTION,
    customerInfo: event.customerInfo,
    taxRate,
    taxIncluded: event.taxIncluded !== false,
    assetCode: event.assetCode,
    network: event.network,
    status: 'pending',
    retryable: true,
    consecutivo,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await upsertInvoice(pending)

  const payload = buildMakeXmlPayload({
    consecutivo,
    customer: event.customerInfo,
    cabysCode: event.cabysCode,
    description: pending.description,
    money,
    txHash: event.txHash,
    walletAddress: event.walletAddress,
    assetCode: event.assetCode,
    network: event.network,
  })

  try {
    const response = await createInvoice(payload)
    const saved = await upsertInvoice({
      ...pending,
      status: 'submitted',
      retryable: false,
      clave: response.clave,
      cyberfuelResponse: response.raw,
      lastError: undefined,
    })
    return { invoice: saved, duplicate: false }
  } catch (error) {
    const invoicing = asInvoicingError(error)
    const failed = await upsertInvoice({
      ...pending,
      status: invoicing.retryable ? 'failed' : 'rejected',
      retryable: invoicing.retryable,
      lastError: {
        message: invoicing.message,
        status: invoicing.status,
        body: invoicing.details,
        at: new Date().toISOString(),
      },
    })
    console.error('[invoicing] No se emitió el comprobante; queda listo para reintento', {
      txHash: event.txHash,
      consecutivo,
      retryable: invoicing.retryable,
      status: invoicing.status,
      message: invoicing.message,
      details: invoicing.details,
    })
    throw invoicingWithRecord(invoicing, failed)
  }
}

export async function retryInvoice(txHash: string): Promise<{
  invoice: InvoiceRecord
  duplicate: boolean
}> {
  const existing = await findInvoiceByTxHash(txHash)
  if (!existing) {
    throw new InvoicingError(`No hay factura registrada para ${txHash}`, 404)
  }
  if (!canRetry(existing)) {
    return { invoice: existing, duplicate: true }
  }
  return processPaymentCompleted({
    txHash: existing.txHash,
    walletAddress: existing.walletAddress,
    amountUSD: existing.amountUSD,
    cabysCode: existing.cabysCode,
    description: existing.description,
    customerInfo: existing.customerInfo,
    taxRate: existing.taxRate,
    taxIncluded: existing.taxIncluded,
    assetCode: existing.assetCode,
    network: existing.network,
  })
}

export async function consultInvoiceAtHacienda(txHash: string): Promise<{
  invoice: InvoiceRecord
  hacienda: unknown
}> {
  const invoice = await findInvoiceByTxHash(txHash)
  if (!invoice) {
    throw new InvoicingError(`No hay factura registrada para ${txHash}`, 404)
  }
  if (!invoice.clave) {
    throw new InvoicingError(
      'La factura aún no tiene clave numérica de Hacienda',
      409,
      true,
    )
  }
  const hacienda = await consultarHacienda(invoice.clave)
  return { invoice, hacienda }
}

function hydrateDefaults(
  input: unknown,
  env: ReturnType<typeof loadInvoicingEnv>,
): unknown {
  if (!input || typeof input !== 'object') {
    return input
  }
  const record = { ...(input as Record<string, unknown>) }
  if (!record.cabysCode && env.INVOICE_DEFAULT_CABYS) {
    record.cabysCode = env.INVOICE_DEFAULT_CABYS
  }
  if (!record.customerInfo || typeof record.customerInfo !== 'object') {
    record.customerInfo = { nombre: 'Consumidor final' }
  }
  return record
}

function canRetry(record: InvoiceRecord): boolean {
  if (record.status === 'submitted' || record.status === 'accepted') {
    return false
  }
  if (record.status === 'pending') {
    const age = Date.now() - new Date(record.updatedAt).getTime()
    return age > STALE_PENDING_MS
  }
  return record.retryable
}

function asInvoicingError(error: unknown): InvoicingError {
  if (error instanceof InvoicingError) {
    return error
  }
  return new InvoicingError(
    error instanceof Error ? error.message : 'Error al emitir factura',
    500,
    true,
    error,
  )
}

function invoicingWithRecord(
  error: InvoicingError,
  record: InvoiceRecord,
): InvoicingError {
  return new InvoicingError(error.message, error.status, error.retryable, {
    invoice: record,
    cause: error.details,
  })
}
