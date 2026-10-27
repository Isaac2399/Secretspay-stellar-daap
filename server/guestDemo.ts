import { Asset, Horizon } from '@stellar/stellar-sdk'
import {
  insertGuestDemoUser,
  secretKeyForUser,
  toPublicUser,
  type PublicUser,
  type StoredUser,
} from './auth.js'
import { AuthError } from './errors.js'
import {
  ensureLoyaltyTrustline,
  ensureUsdcTrustline,
  horizonUrl,
  isTestnet,
  loyaltyAssetFromEnv,
  provisionStellarAccount,
  usdcAssetFromEnv,
} from './provisionAccount.js'
import { creditFromTreasury, creditLoyaltyFromTreasury } from './submitPayment.js'
import { loadStore, saveStore } from './userStore.js'

/**
 * Judge demo sessions.
 *
 * A small pool of custodial Testnet customers is funded ahead of time
 * (Friendbot XLM, treasury ROJOS, and USDC when the treasury can pay it).
 * A click assigns the least-recently-used seat and refills it when a
 * balance is under the floor. The secret stays on the server.
 */

const DEFAULT_POOL_SIZE = 3
const MAX_POOL_SIZE = 8
const ROJOS_FLOOR = 40
const ROJOS_CREDIT = '250'
const USDC_FLOOR = 5
const USDC_CREDIT = '25'

/** Opt out for the pilot: GUEST_DEMO=0 hides the judge demo. */
function guestDemoEnabled(): boolean {
  const flag = (process.env.GUEST_DEMO ?? '').trim().toLowerCase()
  return flag !== '0' && flag !== 'false' && flag !== 'off'
}

/** Pilot default: no free ROJOS on guest demo. Opt in with GUEST_DEMO_ROJOS=1. */
function guestDemoRojosEnabled(): boolean {
  const flag = (process.env.GUEST_DEMO_ROJOS ?? '').trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'on'
}
const WARM_RETRY_MS = 5_000
const USDC_RETRY_MS = 10 * 60 * 1000

let queue: Promise<void> = Promise.resolve()
let warmQueued = false
let warmRetryAt = 0
let usdcRetryAt = 0

function poolSize(): number {
  const raw = Number((process.env.GUEST_DEMO_POOL_SIZE ?? '').trim())
  if (!Number.isInteger(raw) || raw < 1) {
    return DEFAULT_POOL_SIZE
  }
  return Math.min(raw, MAX_POOL_SIZE)
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Fills one empty seat, then schedules the next so a claim can cut in. */
export function scheduleGuestDemoWarm(): void {
  if (!guestDemoEnabled() || !isTestnet() || warmQueued || Date.now() < warmRetryAt) {
    return
  }
  warmQueued = true
  void enqueue(async () => {
    try {
      const outcome = await fillOneSlot()
      warmQueued = false
      if (outcome === 'grew') {
        scheduleGuestDemoWarm()
      }
    } catch (error) {
      warmQueued = false
      warmRetryAt = Date.now() + WARM_RETRY_MS
      console.error('[guest-demo]', error instanceof Error ? error.message : error)
    }
  })
}

export async function guestDemoStatus(): Promise<{ ready: boolean; available: boolean }> {
  if (!guestDemoEnabled() || !isTestnet()) {
    return { ready: false, available: false }
  }
  scheduleGuestDemoWarm()
  const store = await loadStore()
  return { ready: store.users.some(isFundedGuest), available: true }
}

export function claimGuestDemoUser(): Promise<PublicUser> {
  const claimed = enqueue(claimUnsafe)
  void claimed.then(
    () => scheduleGuestDemoWarm(),
    () => scheduleGuestDemoWarm(),
  )
  return claimed
}

async function claimUnsafe(): Promise<PublicUser> {
  if (!guestDemoEnabled() || !isTestnet()) {
    throw new AuthError('La demo instantánea no está disponible.', 403)
  }
  if (!(await loadStore()).users.some(isFundedGuest)) {
    await fillOneSlot()
  }
  const store = await loadStore()
  const user = store.users
    .filter(isFundedGuest)
    .sort((a, b) =>
      (a.guestDemoClaimedAt ?? '').localeCompare(b.guestDemoClaimedAt ?? ''),
    )[0]
  if (!user) {
    throw new AuthError('No se pudo preparar la cuenta demo.', 503)
  }
  await topUpGuest(user)
  const claimed = await updateGuest(user.id, {
    guestDemoClaimedAt: new Date().toISOString(),
  })
  return toPublicUser(claimed)
}

async function fillOneSlot(): Promise<'grew' | 'full'> {
  const store = await loadStore()
  const guests = store.users.filter((user) => user.guestDemo && user.secretKeyEnc)
  const pending = guests.find((user) => !user.guestDemoFundedAt)
  if (pending) {
    await fundStoredGuest(pending)
    return fundedCount(await loadStore()) >= poolSize() ? 'full' : 'grew'
  }
  if (guests.length >= poolSize()) {
    return 'full'
  }
  await createAndFund()
  return fundedCount(await loadStore()) >= poolSize() ? 'full' : 'grew'
}

async function createAndFund(): Promise<void> {
  let keys: { publicKey: string; secretKey: string }
  try {
    keys = await provisionStellarAccount()
  } catch (error) {
    throw asAuthError(error, 'No se pudo crear la cuenta Stellar de la demo')
  }
  const store = await loadStore()
  const user = await insertGuestDemoUser({
    email: nextGuestEmail(store.users),
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
  })
  try {
    await fundStoredGuest(user)
  } catch (error) {
    throw asAuthError(error, 'No se pudieron cargar los fondos de prueba')
  }
}

async function fundStoredGuest(user: StoredUser): Promise<void> {
  await topUpGuest(user)
  await updateGuest(user.id, { guestDemoFundedAt: new Date().toISOString() })
}

async function topUpGuest(user: StoredUser): Promise<void> {
  const secret = await secretKeyForUser(user.id)
  const server = new Horizon.Server(horizonUrl())
  let account = await server.loadAccount(user.publicKey)
  const loyalty = loyaltyAssetFromEnv()
  const usdc = usdcAssetFromEnv()

  if (!hasTrustline(account, loyalty)) {
    await ensureLoyaltyTrustline(secret)
    account = await server.loadAccount(user.publicKey)
  }
  if (guestDemoRojosEnabled() && assetBalance(account, loyalty) < ROJOS_FLOOR) {
    await creditLoyaltyFromTreasury({
      destination: user.publicKey,
      amount: ROJOS_CREDIT,
      memo: 'demo',
    })
  }

  if (!hasTrustline(account, usdc)) {
    await ensureUsdcTrustline(secret)
    account = await server.loadAccount(user.publicKey)
  }
  if (Date.now() >= usdcRetryAt && assetBalance(account, usdc) < USDC_FLOOR) {
    try {
      await creditFromTreasury({
        destination: user.publicKey,
        amount: USDC_CREDIT,
        asset: usdc,
        memo: 'demo',
      })
    } catch (error) {
      usdcRetryAt = Date.now() + USDC_RETRY_MS
      console.warn(
        '[guest-demo] USDC de prueba no disponible:',
        error instanceof Error ? error.message : error,
      )
    }
  }
}

async function updateGuest(id: string, patch: Partial<StoredUser>): Promise<StoredUser> {
  const store = await loadStore()
  const user = store.users.find((entry) => entry.id === id)
  if (!user) {
    throw new AuthError('La cuenta demo no está disponible', 500)
  }
  Object.assign(user, patch)
  await saveStore(store)
  return user
}

function fundedCount(store: { users: StoredUser[] }): number {
  return store.users.filter(isFundedGuest).length
}

function isFundedGuest(user: StoredUser): boolean {
  return Boolean(user.guestDemo && user.secretKeyEnc && user.guestDemoFundedAt)
}

function nextGuestEmail(users: StoredUser[]): string {
  const taken = new Set(users.map((user) => user.email))
  for (let index = 1; index <= MAX_POOL_SIZE; index += 1) {
    const email =
      index === 1
        ? 'juez.demo@stellarpay.local'
        : `juez.demo.${index}@stellarpay.local`
    if (!taken.has(email)) {
      return email
    }
  }
  throw new AuthError('No hay cupo de cuentas demo', 503)
}

function hasTrustline(account: Horizon.AccountResponse, asset: Asset): boolean {
  return creditLine(account, asset) !== undefined
}

function assetBalance(account: Horizon.AccountResponse, asset: Asset): number {
  const line = creditLine(account, asset)
  const value = line ? Number(line.balance) : 0
  return Number.isFinite(value) ? value : 0
}

function creditLine(account: Horizon.AccountResponse, asset: Asset) {
  return account.balances.find((entry) => {
    if (entry.asset_type === 'native' || entry.asset_type === 'liquidity_pool_shares') {
      return false
    }
    return entry.asset_code === asset.getCode() && entry.asset_issuer === asset.getIssuer()
  })
}

function asAuthError(error: unknown, fallback: string): AuthError {
  if (error instanceof AuthError) {
    return error
  }
  const detail = error instanceof Error ? error.message : fallback
  return new AuthError(detail, 502)
}
