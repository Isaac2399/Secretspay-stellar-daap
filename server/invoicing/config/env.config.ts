import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

const ENV_FILES = ['.env.local', '.env'] as const

for (const file of ENV_FILES) {
  const full = resolve(process.cwd(), file)
  if (existsSync(full)) {
    loadDotenv({ path: full, override: false })
  }
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}

const optionalUrl = z
  .string()
  .trim()
  .transform(stripQuotes)
  .refine((value) => !value || /^https?:\/\//i.test(value), 'URL inválida')
  .optional()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Base del API Cyberfuel. MakeXML se concatena: `{url}/makeXML.{env}.{version}` */
  CYBERFUEL_API_URL: z
    .string()
    .trim()
    .transform(stripQuotes)
    .default('https://www.comprobanteselectronicoscr.com/api'),
  CYBERFUEL_API_KEY: z.string().trim().transform(stripQuotes).default(''),
  /** Bearer opcional. Cyberfuel documenta api_key en el JSON; el header cubre portales que sí lo piden. */
  CYBERFUEL_BEARER_TOKEN: z.string().trim().transform(stripQuotes).optional(),
  /** `stag` = sandbox Hacienda / Cyberfuel. `prod` = producción. */
  CYBERFUEL_ENV: z.enum(['stag', 'prod']).default('stag'),
  /** `42` es la versión pública documentada. Usa `44` si tu cuenta ya está en DGT 4.4. */
  CYBERFUEL_STRUCTURE_VERSION: z.string().trim().default('42'),

  CYBERFUEL_SUCURSAL: z.string().trim().default('1'),
  CYBERFUEL_TERMINAL: z.string().trim().default('1'),
  CYBERFUEL_SITUACION_PRESENTACION: z.string().trim().default('1'),
  CYBERFUEL_MEDIO_PAGO: z.string().trim().default('99'),

  EMISOR_NOMBRE: z.string().trim().default(''),
  EMISOR_NOMBRE_COMERCIAL: z.string().trim().default(''),
  EMISOR_TIPO_IDENTIFICACION: z.string().trim().default('02'),
  EMISOR_NUMERO: z.string().trim().transform((v) => v.replace(/\D/g, '')).default(''),
  EMISOR_PROVINCIA: z.string().trim().default('1'),
  EMISOR_CANTON: z.string().trim().default('01'),
  EMISOR_DISTRITO: z.string().trim().default('01'),
  EMISOR_BARRIO: z.string().trim().default('01'),
  EMISOR_SENNAS: z.string().trim().default('Costa Rica'),
  EMISOR_TELEFONO: z.string().trim().default('22222222'),
  EMISOR_CORREO: z.string().trim().default(''),

  /**
   * Indicador oficial de Hacienda (BCCR). Respuesta:
   * `{ venta: { fecha, valor }, compra: { fecha, valor } }`
   */
  EXCHANGE_RATE_API_URL: z
    .string()
    .trim()
    .transform(stripQuotes)
    .default('https://api.hacienda.go.cr/indicadores/tc/dolar'),
  /** Si se setea, se usa esta venta CRC/USD y no se llama al API (útil en tests). */
  EXCHANGE_RATE_USD_CRC: z.string().trim().optional(),
  EXCHANGE_RATE_API_URL_OVERRIDE: optionalUrl,

  HORIZON_URL: z
    .string()
    .trim()
    .transform(stripQuotes)
    .optional(),
  INVOICE_MERCHANT_WALLET: z.string().trim().transform(stripQuotes).optional(),
  INVOICE_WEBHOOK_SECRET: z.string().trim().transform(stripQuotes).optional(),
  INVOICE_DEFAULT_CABYS: z.string().trim().default(''),
  INVOICE_DEFAULT_DESCRIPTION: z
    .string()
    .trim()
    .default('Servicio digital cobrado en criptomoneda (Stellar Testnet)'),
  INVOICE_TAX_RATE: z.string().trim().default('13'),
  INVOICE_USD_ASSETS: z.string().trim().default('USDC,USD'),
})

export type InvoicingEnv = z.infer<typeof envSchema>

let cached: InvoicingEnv | null = null

function readRawEnv(): Record<string, string | undefined> {
  const horizon =
    process.env.HORIZON_URL ||
    process.env.VITE_HORIZON_URL ||
    process.env.NEXT_PUBLIC_HORIZON_URL ||
    'https://horizon-testnet.stellar.org'

  return {
    ...process.env,
    HORIZON_URL: horizon,
    EXCHANGE_RATE_API_URL:
      process.env.EXCHANGE_RATE_API_URL ||
      process.env.EXCHANGE_RATE_API_URL_OVERRIDE ||
      'https://api.hacienda.go.cr/indicadores/tc/dolar',
  }
}

export function loadInvoicingEnv(): InvoicingEnv {
  if (cached) {
    return cached
  }
  const parsed = envSchema.safeParse(readRawEnv())
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Variables de entorno de facturación inválidas: ${issues}`)
  }
  cached = parsed.data
  return cached
}

export function resetInvoicingEnvCache(): void {
  cached = null
}

export function missingInvoicingConfig(env = loadInvoicingEnv()): string[] {
  const missing: string[] = []
  if (!env.CYBERFUEL_API_KEY) missing.push('CYBERFUEL_API_KEY')
  if (!env.EMISOR_NOMBRE) missing.push('EMISOR_NOMBRE')
  if (!env.EMISOR_NUMERO) missing.push('EMISOR_NUMERO')
  if (!env.EMISOR_CORREO) missing.push('EMISOR_CORREO')
  return missing
}

export function cyberfuelEndpoint(
  method: 'makeXML' | 'consultahacienda' | 'sendXML',
  env = loadInvoicingEnv(),
): string {
  const base = env.CYBERFUEL_API_URL.replace(/\/$/, '')
  const alreadyVersioned = /\.(stag|prod)\.\d+$/i.test(base)
  if (alreadyVersioned) {
    return base.replace(/\/[^/]+$/, `/${method}.${env.CYBERFUEL_ENV}.${env.CYBERFUEL_STRUCTURE_VERSION}`)
  }
  return `${base}/${method}.${env.CYBERFUEL_ENV}.${env.CYBERFUEL_STRUCTURE_VERSION}`
}

export function usdEquivalentAssets(env = loadInvoicingEnv()): Set<string> {
  return new Set(
    env.INVOICE_USD_ASSETS.split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean),
  )
}
