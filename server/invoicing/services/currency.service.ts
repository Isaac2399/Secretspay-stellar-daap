import axios, { AxiosError } from 'axios'
import { loadInvoicingEnv } from '../config/env.config.js'
import { InvoicingError, type ExchangeRateQuote } from '../types.js'

const HACIENDA_TC_URL = 'https://api.hacienda.go.cr/indicadores/tc/dolar'

/** Fallback solo para desarrollo local si Hacienda/BCCR no responde. */
const MOCK_VENTA_CRC = 453.38

type CachedQuote = { quote: ExchangeRateQuote; expiresAt: number }

let cache: CachedQuote | null = null
const CACHE_MS = 60 * 60 * 1000

type HaciendaTcResponse = {
  venta?: { fecha?: string; valor?: number } | number
  compra?: { fecha?: string; valor?: number } | number
}

/**
 * Redondeo bancario a `decimals` (Hacienda usa hasta 5 decimales en montos).
 */
export function roundMoney(value: number, decimals = 5): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function money(value: number, decimals = 5): string {
  return roundMoney(value, decimals).toFixed(decimals)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  if (value && typeof value === 'object' && 'valor' in value) {
    return asNumber((value as { valor: unknown }).valor)
  }
  return null
}

function asDate(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  if (value && typeof value === 'object' && 'fecha' in value) {
    const fecha = (value as { fecha?: unknown }).fecha
    if (typeof fecha === 'string' && fecha.trim()) {
      return fecha
    }
  }
  return fallback
}

function quoteFromHacienda(
  data: HaciendaTcResponse,
  fuente: string,
): ExchangeRateQuote | null {
  const today = new Date().toISOString().slice(0, 10)
  const venta = asNumber(data.venta)
  if (!venta) {
    return null
  }
  return {
    monedaOrigen: 'USD',
    monedaDestino: 'CRC',
    venta: roundMoney(venta, 5),
    compra: asNumber(data.compra) ?? undefined,
    fecha: asDate(data.venta, today),
    fuente,
  }
}

/**
 * Tipo de cambio oficial de venta CRC/USD.
 *
 * Orden: 1) EXCHANGE_RATE_USD_CRC (mock/override)
 *        2) API de Hacienda (BCCR) con cache 1h
 *        3) mock de desarrollo si el API falla
 */
export async function getUsdCrcSellRate(): Promise<ExchangeRateQuote> {
  const env = loadInvoicingEnv()
  const override = Number(env.EXCHANGE_RATE_USD_CRC)
  if (Number.isFinite(override) && override > 0) {
    return {
      monedaOrigen: 'USD',
      monedaDestino: 'CRC',
      venta: roundMoney(override, 5),
      fecha: new Date().toISOString().slice(0, 10),
      fuente: 'EXCHANGE_RATE_USD_CRC',
    }
  }

  if (cache && cache.expiresAt > Date.now()) {
    return cache.quote
  }

  const url = env.EXCHANGE_RATE_API_URL || HACIENDA_TC_URL
  try {
    const response = await axios.get<HaciendaTcResponse>(url, {
      timeout: 12_000,
      headers: { Accept: 'application/json' },
    })
    const quote = quoteFromHacienda(response.data, url)
    if (!quote) {
      throw new InvoicingError(
        'El API de tipo de cambio no devolvió un valor de venta válido',
        502,
        true,
        response.data,
      )
    }
    cache = { quote, expiresAt: Date.now() + CACHE_MS }
    return quote
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      console.warn(
        '[invoicing] Tipo de cambio Hacienda/BCCR no disponible; usando mock de desarrollo.',
        axiosMessage(error),
      )
      return {
        monedaOrigen: 'USD',
        monedaDestino: 'CRC',
        venta: MOCK_VENTA_CRC,
        fecha: new Date().toISOString().slice(0, 10),
        fuente: 'mock-development',
      }
    }
    throw new InvoicingError(
      'No se pudo obtener el tipo de cambio de venta CRC/USD',
      502,
      true,
      axiosMessage(error),
    )
  }
}

export function convertUsdToCrc(
  amountUSD: number,
  venta: number,
): { amountUSD: number; amountCRC: number } {
  if (!(amountUSD > 0)) {
    throw new InvoicingError('El monto USD debe ser mayor que cero', 400)
  }
  if (!(venta > 0)) {
    throw new InvoicingError('El tipo de cambio de venta es inválido', 500)
  }
  return {
    amountUSD: roundMoney(amountUSD, 5),
    amountCRC: roundMoney(amountUSD * venta, 5),
  }
}

export function splitIva(params: {
  totalOrNet: number
  taxRate: number
  taxIncluded: boolean
}): { neto: number; iva: number; total: number } {
  const rate = params.taxRate / 100
  if (params.taxIncluded) {
    const neto = roundMoney(params.totalOrNet / (1 + rate), 5)
    const total = roundMoney(params.totalOrNet, 5)
    return { neto, iva: roundMoney(total - neto, 5), total }
  }
  const neto = roundMoney(params.totalOrNet, 5)
  const iva = roundMoney(neto * rate, 5)
  return { neto, iva, total: roundMoney(neto + iva, 5) }
}

function axiosMessage(error: unknown): unknown {
  if (error instanceof AxiosError) {
    return {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    }
  }
  return error instanceof Error ? error.message : error
}
