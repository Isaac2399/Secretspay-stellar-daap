import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AuthError } from '../errors.js'
import type { InvoiceRecord } from './types.js'

type InvoiceStore = {
  invoices: InvoiceRecord[]
  lastComprobante: number
}

const INVOICES_FILE = join('data', 'invoices.json')
const KV_KEY = 'stellar-web-app:invoices'

export async function findInvoiceByTxHash(
  txHash: string,
): Promise<InvoiceRecord | undefined> {
  const store = await loadInvoiceStore()
  const key = normalizeTx(txHash)
  return store.invoices.find((row) => normalizeTx(row.txHash) === key)
}

export async function nextComprobante(): Promise<number> {
  const store = await loadInvoiceStore()
  const next = (store.lastComprobante || 0) + 1
  store.lastComprobante = next
  await saveInvoiceStore(store)
  return next
}

export async function upsertInvoice(
  record: InvoiceRecord,
): Promise<InvoiceRecord> {
  const store = await loadInvoiceStore()
  const key = normalizeTx(record.txHash)
  const index = store.invoices.findIndex((row) => normalizeTx(row.txHash) === key)
  const next = { ...record, updatedAt: new Date().toISOString() }
  if (index >= 0) {
    store.invoices[index] = next
  } else {
    store.invoices.unshift(next)
  }
  if (next.consecutivo > store.lastComprobante) {
    store.lastComprobante = next.consecutivo
  }
  await saveInvoiceStore(store)
  return next
}

export async function listInvoices(limit = 50): Promise<InvoiceRecord[]> {
  const store = await loadInvoiceStore()
  return store.invoices.slice(0, Math.min(200, Math.max(1, limit)))
}

async function loadInvoiceStore(): Promise<InvoiceStore> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | InvoiceStore | null>(['GET', KV_KEY])
    if (!raw) {
      return emptyStore()
    }
    if (typeof raw === 'string') {
      return normalizeStore(JSON.parse(raw) as InvoiceStore)
    }
    return normalizeStore(raw)
  }

  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta Vercel KV para persistir facturas (idempotencia por txHash).',
      503,
    )
  }

  if (!existsSync(INVOICES_FILE)) {
    return emptyStore()
  }
  return normalizeStore(JSON.parse(readFileSync(INVOICES_FILE, 'utf8')) as InvoiceStore)
}

async function saveInvoiceStore(store: InvoiceStore): Promise<void> {
  const next = normalizeStore(store)
  if (kvConfigured()) {
    await kvCommand(['SET', KV_KEY, JSON.stringify(next)])
    return
  }

  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta Vercel KV para persistir facturas.',
      503,
    )
  }

  mkdirSync(dirname(INVOICES_FILE), { recursive: true })
  writeFileSync(INVOICES_FILE, JSON.stringify(next, null, 2), 'utf8')
}

function emptyStore(): InvoiceStore {
  return { invoices: [], lastComprobante: 0 }
}

function normalizeStore(store: InvoiceStore): InvoiceStore {
  return {
    invoices: (Array.isArray(store.invoices) ? store.invoices : []).map((row) => ({
      ...row,
      customerInfo: row.customerInfo ?? { nombre: 'Consumidor final' },
      taxRate: Number(row.taxRate) || 13,
      taxIncluded: row.taxIncluded !== false,
    })),
    lastComprobante: Number(store.lastComprobante) || 0,
  }
}

function normalizeTx(txHash: string): string {
  return txHash.trim().toLowerCase()
}

function kvConfigured(): boolean {
  return Boolean(kvUrl() && kvToken())
}

function kvUrl(): string {
  return stripQuotes(
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '',
  )
}

function kvToken(): string {
  return stripQuotes(
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  )
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}

async function kvCommand<T>(command: unknown[]): Promise<T> {
  const response = await fetch(kvUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) {
    throw new AuthError('No se pudo acceder al almacén KV de facturas', 500)
  }
  const payload = (await response.json()) as { result: T }
  return payload.result
}
