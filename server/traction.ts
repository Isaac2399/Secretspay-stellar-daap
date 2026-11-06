import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Networks } from '@stellar/stellar-sdk'
import { AuthError } from './errors.js'
import { loadEventStore } from './events/store.js'
import { networkPassphrase } from './provisionAccount.js'

const WAITLIST_FILE = join('data', 'traction-waitlist.json')
const KV_KEY = 'stellar-web-app:traction-waitlist'
const MAX_ENTRIES = 200
const TESTNET_CONTRACT = 'CC633M77TFTEUWK4X4R35DVUB2WXAP5WFN7ZBR2KI5BCFEMTBBX7A2S4'

export type TractionPayment = {
  createdAt: string
  merchantName: string
  orderNumber: string
  total: string
  fee: string
  net: string
  feeBps: number
  hash: string
  network: 'testnet' | 'public'
}

export type TractionSnapshot = {
  network: 'testnet' | 'public'
  contractId: string
  payments: TractionPayment[]
  waitlistCount: number
  venueNote: string | null
  feeSponsored: true
  asOf: string
}

type WaitlistEntry = {
  id: string
  name: string
  contact: string
  event: string
  createdAt: string
}

export async function tractionSnapshot(): Promise<TractionSnapshot> {
  const network = currentNetwork()
  const store = await loadEventStore()
  const payments = store.orders
    .filter((order) => Boolean(order.stellarHash))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((order) => ({
      createdAt: order.createdAt,
      merchantName: order.merchantName,
      orderNumber: order.orderNumber,
      total: order.total,
      fee: order.fee ?? '0',
      net: order.net ?? order.total,
      feeBps: order.feeBps ?? 0,
      hash: order.stellarHash as string,
      network,
    }))
  const waitlist = await loadWaitlist()
  const venueNote = (process.env.TRACTION_VENUE_NOTE ?? '').trim()
  return {
    network,
    contractId: (process.env.ESCROW_CONTRACT_ID ?? '').trim() || TESTNET_CONTRACT,
    payments,
    waitlistCount: waitlist.length,
    venueNote: venueNote || null,
    feeSponsored: true,
    asOf: new Date().toISOString(),
  }
}

export async function joinWaitlist(input: {
  name: unknown
  contact: unknown
  event: unknown
}): Promise<{ count: number }> {
  const name = clip(input.name, 80)
  const contact = clip(input.contact, 80)
  const event = clip(input.event, 120)
  if (name.length < 2) {
    throw new AuthError('Escribe tu nombre.', 400)
  }
  if (contact.length < 5) {
    throw new AuthError('Escribe un teléfono o un email.', 400)
  }
  const list = await loadWaitlist()
  const key = contact.toLowerCase()
  if (list.some((entry) => entry.contact.toLowerCase() === key)) {
    return { count: list.length }
  }
  if (list.length >= MAX_ENTRIES) {
    throw new AuthError('La lista de espera está llena.', 503)
  }
  list.push({
    id: `${Date.now().toString(36)}-${list.length + 1}`,
    name,
    contact,
    event,
    createdAt: new Date().toISOString(),
  })
  await saveWaitlist(list)
  return { count: list.length }
}

function currentNetwork(): 'testnet' | 'public' {
  return networkPassphrase() === Networks.PUBLIC ? 'public' : 'testnet'
}

function clip(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

async function loadWaitlist(): Promise<WaitlistEntry[]> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | WaitlistEntry[] | null>(['GET', KV_KEY])
    if (!raw) {
      return []
    }
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as WaitlistEntry[]) : raw
    return Array.isArray(parsed) ? parsed : []
  }
  if (process.env.VERCEL) {
    return []
  }
  if (!existsSync(WAITLIST_FILE)) {
    return []
  }
  const parsed = JSON.parse(readFileSync(WAITLIST_FILE, 'utf8')) as WaitlistEntry[]
  return Array.isArray(parsed) ? parsed : []
}

async function saveWaitlist(list: WaitlistEntry[]): Promise<void> {
  if (kvConfigured()) {
    await kvCommand(['SET', KV_KEY, JSON.stringify(list)])
    return
  }
  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta KV para guardar la lista de espera.',
      503,
    )
  }
  mkdirSync(dirname(WAITLIST_FILE), { recursive: true })
  writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2), 'utf8')
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
    throw new AuthError('No se pudo guardar la lista de espera', 500)
  }
  const payload = (await response.json()) as { result: T }
  return payload.result
}
