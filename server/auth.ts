import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { AuthError } from './errors.js'
import { ensureLoyaltyTrustline, provisionStellarAccount } from './provisionAccount.js'
import { loadStore, saveStore } from './userStore.js'
import {
  generateSinpeCode,
  isSecretsCode,
  isSinpeCode,
  normalizeSinpeCode,
} from './sinpe/code.js'

export const DEFAULT_SUPER_ADMIN_PUBLIC_KEY =
  'GC5IQE74UCRCKXJII3G3AYNJHB75JGVD2TQKMDNNR2QZVLKEDVU5E4NJ'
export const DEFAULT_SUPER_ADMIN_EMAIL = 'admin@stellarpay.local'
export const DEV_SUPER_ADMIN_PASSWORD = 'Admin1234!'
export const DEFAULT_CASHIER_EMAIL = 'caja@stellarpay.local'
export const DEV_CASHIER_PASSWORD = 'CajaRojo#16Sep26'
export const DEFAULT_SINPE_OPS_EMAIL = 'sinpe@stellarpay.local'
export const DEV_SINPE_OPS_PASSWORD = 'SinpeMatch#16Sep26'

export function superAdminPublicKey(): string {
  const fromEnv = (process.env.SUPER_ADMIN_PUBLIC_KEY ?? '').trim()
  return fromEnv || DEFAULT_SUPER_ADMIN_PUBLIC_KEY
}

export function isSuperAdminRecord(user: {
  email: string
  publicKey: string
  role: UserRole
}): boolean {
  if (user.role === 'admin') {
    return true
  }
  if (user.publicKey === superAdminPublicKey()) {
    return true
  }
  const email = superAdminEmail()
  return Boolean(email && user.email === email)
}

export function superAdminEmail(): string {
  const fromEnv = normalizeEmail(process.env.SUPER_ADMIN_EMAIL ?? '')
  return fromEnv || DEFAULT_SUPER_ADMIN_EMAIL
}

function seedSuperAdminDisabled(): boolean {
  const flag = (process.env.SUPER_ADMIN_SEED ?? '').trim().toLowerCase()
  return flag === '0' || flag === 'false' || flag === 'off'
}

let seedSuperAdminPromise: Promise<void> | null = null

export async function ensureDevSuperAdmin(): Promise<void> {
  if (seedSuperAdminDisabled()) {
    return
  }
  if (!seedSuperAdminPromise) {
    seedSuperAdminPromise = upsertDevSuperAdmin().catch((error) => {
      seedSuperAdminPromise = null
      throw error
    })
  }
  await seedSuperAdminPromise
}

async function upsertDevSuperAdmin(): Promise<void> {
  const email = DEFAULT_SUPER_ADMIN_EMAIL
  const store = await loadStore()
  const existing = store.users.find((user) => user.email === email)
  const adminKey = superAdminPublicKey()
  if (
    existing &&
    existing.role === 'admin' &&
    existing.publicKey === adminKey &&
    verifyPassword(DEV_SUPER_ADMIN_PASSWORD, existing.salt, existing.passwordHash)
  ) {
    return
  }
  const salt = randomBytes(16).toString('hex')
  const passwordHash = hashPassword(DEV_SUPER_ADMIN_PASSWORD, salt)
  if (existing) {
    existing.role = 'admin'
    existing.publicKey = adminKey
    existing.salt = salt
    existing.passwordHash = passwordHash
    delete existing.secretKeyEnc
  } else {
    store.users.push({
      id: randomBytes(12).toString('hex'),
      email,
      salt,
      passwordHash,
      role: 'admin',
      publicKey: adminKey,
      createdAt: new Date().toISOString(),
    })
  }
  await saveStore(store)
}

let seedEventStaffPromise: Promise<void> | null = null

export async function ensureDevEventStaff(): Promise<void> {
  if (seedStaffDisabled()) {
    return
  }
  if (!seedEventStaffPromise) {
    seedEventStaffPromise = upsertDevEventStaff().catch((error) => {
      seedEventStaffPromise = null
      throw error
    })
  }
  await seedEventStaffPromise
}

function seedStaffDisabled(): boolean {
  const flag = (process.env.STAFF_SEED ?? '').trim().toLowerCase()
  return flag === '0' || flag === 'false' || flag === 'off'
}

function cashierEmail(): string {
  return normalizeEmail(process.env.CASHIER_EMAIL ?? '') || DEFAULT_CASHIER_EMAIL
}

function cashierPassword(): string {
  return (process.env.CASHIER_PASSWORD ?? '').trim() || DEV_CASHIER_PASSWORD
}

function sinpeOpsEmail(): string {
  return normalizeEmail(process.env.SINPE_OPS_EMAIL ?? '') || DEFAULT_SINPE_OPS_EMAIL
}

function sinpeOpsPassword(): string {
  return (process.env.SINPE_OPS_PASSWORD ?? '').trim() || DEV_SINPE_OPS_PASSWORD
}

async function upsertDevEventStaff(): Promise<void> {
  const store = await loadStore()
  const specs: Array<{ email: string; password: string; role: UserRole }> = [
    { email: cashierEmail(), password: cashierPassword(), role: 'cashier' },
    { email: sinpeOpsEmail(), password: sinpeOpsPassword(), role: 'sinpe_ops' },
  ]
  let changed = false
  for (const spec of specs) {
    if (upsertStaffRecord(store, spec)) {
      changed = true
    }
  }
  if (changed) {
    await saveStore(store)
  }
}

function upsertStaffRecord(
  store: { users: StoredUser[] },
  spec: { email: string; password: string; role: UserRole },
): boolean {
  const existing = store.users.find((user) => user.email === spec.email)
  if (
    existing &&
    existing.role === spec.role &&
    verifyPassword(spec.password, existing.salt, existing.passwordHash)
  ) {
    return false
  }
  const salt = randomBytes(16).toString('hex')
  const passwordHash = hashPassword(spec.password, salt)
  if (existing) {
    existing.role = spec.role
    existing.salt = salt
    existing.passwordHash = passwordHash
    delete existing.secretKeyEnc
    delete existing.sinpeCode
    delete existing.place
    return true
  }
  store.users.push({
    id: randomBytes(12).toString('hex'),
    email: spec.email,
    salt,
    passwordHash,
    role: spec.role,
    publicKey: Keypair.random().publicKey(),
    createdAt: new Date().toISOString(),
  })
  return true
}

export { AuthError } from './errors.js'

export type UserRole = 'customer' | 'merchant' | 'admin' | 'cashier' | 'sinpe_ops'

export function isEventStaffRole(role: UserRole): boolean {
  return role === 'cashier' || role === 'sinpe_ops'
}

export function isAssignableAccount(user: { role: UserRole }): boolean {
  return user.role === 'customer' || user.role === 'merchant'
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const COOKIE_NAME = 'stellar_session'

export type StoredUser = {
  id: string
  email: string
  passwordHash: string
  salt: string
  role: UserRole
  publicKey: string
  secretKeyEnc?: string
  createdAt: string
  sinpeCode?: string
  place?: {
    name: string
    address: string
    lat: number
    lng: number
    category?: string
    note?: string
    acceptsRojos?: boolean
    promos?: Array<
      | { kind: 'story'; rojos: string }
      | { kind: 'purchase'; spend: string; rojos: string }
      | { kind: 'usdc'; rojos: string }
    >
  }
}

export type PublicUser = {
  id: string
  email: string
  role: UserRole
  publicKey: string
  sinpeCode?: string
  place?: StoredUser['place']
}

function sessionSecret(): string {
  return process.env.SESSION_SECRET ?? 'stellar-web-app-dev-secret'
}

function cookieAttrs(): string {
  const secure = process.env.VERCEL ? '; Secure' : ''
  return `HttpOnly; Path=/; SameSite=Lax${secure}`
}

export function toPublicUser(user: StoredUser): PublicUser {
  const admin = isSuperAdminRecord(user)
  return {
    id: user.id,
    email: user.email,
    role: admin ? 'admin' : user.role,
    publicKey: admin ? superAdminPublicKey() : user.publicKey,
    sinpeCode: admin ? undefined : user.sinpeCode,
    place: admin ? undefined : user.place,
  }
}

export async function findUserByEmail(
  email: string,
): Promise<StoredUser | undefined> {
  const normalized = normalizeEmail(email)
  const store = await loadStore()
  return store.users.find((user) => user.email === normalized)
}

export async function findUserById(id: string): Promise<StoredUser | undefined> {
  const store = await loadStore()
  return store.users.find((user) => user.id === id)
}

export async function findUserByPublicKey(
  publicKey: string,
): Promise<StoredUser | undefined> {
  const store = await loadStore()
  return store.users.find((user) => user.publicKey === publicKey)
}

export async function findUserBySinpeCode(
  code: string,
): Promise<StoredUser | undefined> {
  const key = normalizeSinpeCode(code)
  if (!isSinpeCode(key)) {
    return undefined
  }
  const store = await loadStore()
  return store.users.find((user) => normalizeSinpeCode(user.sinpeCode ?? '') === key)
}

export async function ensureUserSinpeCode(
  userId: string,
): Promise<StoredUser | undefined> {
  const store = await loadStore()
  const user = store.users.find((entry) => entry.id === userId)
  if (!user) {
    return undefined
  }
  if (isSuperAdminRecord(user) || isEventStaffRole(user.role)) {
    return user
  }
  const expected = generateSinpeCode(user.publicKey)
  if (user.sinpeCode === expected && isSecretsCode(expected)) {
    return user
  }
  user.sinpeCode = expected
  await saveStore(store)
  return user
}

export async function searchAssignableUsers(query: string): Promise<PublicUser[]> {
  const store = await loadStore()
  const q = query.trim().toLowerCase()
  const users = store.users.filter(
    (user) => isAssignableAccount(user) && !isSuperAdminRecord(user),
  )
  const matched = q
    ? users.filter(
        (user) =>
          user.email.includes(q) ||
          user.publicKey.toLowerCase().includes(q) ||
          user.id.toLowerCase() === q ||
          (user.sinpeCode ?? '').toLowerCase().includes(q)
      )
    : users
  return matched.slice(0, 30).map(toPublicUser)
}

export async function createUser(input: {
  email: string
  password: string
  role: UserRole
}): Promise<PublicUser> {
  const email = normalizeEmail(input.email)
  if (!isEmail(email)) {
    throw new AuthError('El email no es válido', 400)
  }
  if (input.password.length < 8) {
    throw new AuthError('La contraseña debe tener al menos 8 caracteres', 400)
  }
  if (input.role !== 'customer' && input.role !== 'merchant') {
    throw new AuthError('El rol debe ser customer o merchant', 400)
  }
  if (await findUserByEmail(email)) {
    throw new AuthError('Ya existe una cuenta con ese email', 409)
  }

  const salt = randomBytes(16).toString('hex')
  const adminSignup = Boolean(superAdminEmail() && email === superAdminEmail())

  let user: StoredUser
  if (adminSignup) {
    user = {
      id: randomBytes(12).toString('hex'),
      email,
      salt,
      passwordHash: hashPassword(input.password, salt),
      role: 'admin',
      publicKey: superAdminPublicKey(),
      createdAt: new Date().toISOString(),
    }
  } else {
    let keys: { publicKey: string; secretKey: string }
    try {
      keys = await provisionStellarAccount()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo crear la cuenta Stellar'
      throw new AuthError(message, 502)
    }
    user = {
      id: randomBytes(12).toString('hex'),
      email,
      salt,
      passwordHash: hashPassword(input.password, salt),
      role: input.role,
      publicKey: keys.publicKey,
      secretKeyEnc: encryptSecret(keys.secretKey),
      createdAt: new Date().toISOString(),
    }
  }

  const store = await loadStore()
  if (!adminSignup) {
    user.sinpeCode = generateSinpeCode(user.publicKey)
  }
  store.users.push(user)
  await saveStore(store)
  return toPublicUser(user)
}

export async function authenticate(
  email: string,
  password: string,
): Promise<PublicUser> {
  const user = await findUserByEmail(email)
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    throw new AuthError(
      'Email o contraseña incorrectos. Las cuentas de tu PC no están en Vercel: usa Registro en este mismo enlace.',
      401,
    )
  }
  const promoted = await promoteSuperAdminIfNeeded(user)
  if (!isSuperAdminRecord(promoted)) {
    await ensureUserLoyaltyTrustline(promoted.id)
  }
  const withCode = (await ensureUserSinpeCode(promoted.id)) ?? promoted
  return toPublicUser(withCode)
}

export async function ensureUserLoyaltyTrustline(userId: string): Promise<void> {
  const user = await findUserById(userId)
  if (!user?.secretKeyEnc) {
    return
  }
  try {
    await ensureLoyaltyTrustline(decryptSecret(user.secretKeyEnc))
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo abrir la trustline'
    throw new AuthError(message, 502)
  }
}

export async function updateUserPublicKey(
  userId: string,
  publicKey: string,
): Promise<PublicUser> {
  if (!/^G[A-Z0-9]{55}$/.test(publicKey)) {
    throw new AuthError('La public key de Stellar no es válida', 400)
  }
  const store = await loadStore()
  const user = store.users.find((entry) => entry.id === userId)
  if (!user) {
    throw new AuthError('No hay sesión', 401)
  }
  const duplicate = store.users.find(
    (entry) => entry.publicKey === publicKey && entry.id !== userId,
  )
  if (duplicate) {
    throw new AuthError('Esa public key ya está vinculada a otra cuenta', 409)
  }
  user.publicKey = publicKey
  if (publicKey === superAdminPublicKey()) {
    user.role = 'admin'
    delete user.sinpeCode
  } else if (!isEventStaffRole(user.role)) {
    user.sinpeCode = generateSinpeCode(publicKey)
  }
  await saveStore(store)
  return toPublicUser(user)
}

export async function updateUserPlace(
  userId: string,
  place: StoredUser['place'] | null,
): Promise<PublicUser> {
  const store = await loadStore()
  const user = store.users.find((entry) => entry.id === userId)
  if (!user) {
    throw new AuthError('No hay sesión', 401)
  }
  if (user.role !== 'merchant') {
    throw new AuthError('Solo las cuentas de empresa pueden publicar un local', 403)
  }
  if (place === null) {
    delete user.place
  } else {
    user.place = place
  }
  await saveStore(store)
  return toPublicUser(user)
}

export async function listPublicPlaces(): Promise<
  Array<NonNullable<StoredUser['place']> & { id: string }>
> {
  const store = await loadStore()
  return store.users.flatMap((user) => {
    if (user.role !== 'merchant' || !user.place || isSuperAdminRecord(user)) {
      return []
    }
    return [
      {
        id: user.id,
        ...user.place,
        category: user.place.category || 'other',
      },
    ]
  })
}

export function createSessionCookie(userId: string): string {
  const exp = Date.now() + SESSION_TTL_MS
  const payload = `${userId}.${exp}`
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('hex')
  const token = `${payload}.${sig}`
  return `${COOKIE_NAME}=${token}; ${cookieAttrs()}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; ${cookieAttrs()}; Max-Age=0`
}

export async function userFromCookieHeader(
  header: string | undefined,
): Promise<PublicUser | null> {
  const token = readCookie(header, COOKIE_NAME)
  if (!token) {
    return null
  }
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }
  const [userId, exp, sig] = parts
  const payload = `${userId}.${exp}`
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('hex')
  if (!safeEqual(sig, expected) || Number(exp) < Date.now()) {
    return null
  }
  const user = await findUserById(userId)
  if (!user) {
    return null
  }
  const withCode = (await ensureUserSinpeCode(user.id)) ?? user
  return toPublicUser(withCode)
}

export async function secretKeyForUser(userId: string): Promise<string> {
  const user = await findUserById(userId)
  if (!user?.secretKeyEnc) {
    throw new AuthError(
      'Esta cuenta no tiene llave custodial; no se puede firmar el pago.',
      400,
    )
  }
  return decryptSecret(user.secretKeyEnc)
}

async function promoteSuperAdminIfNeeded(user: StoredUser): Promise<StoredUser> {
  if (!isSuperAdminRecord(user)) {
    return user
  }
  const adminKey = superAdminPublicKey()
  if (user.role === 'admin' && user.publicKey === adminKey) {
    return user
  }
  const store = await loadStore()
  const entry = store.users.find((item) => item.id === user.id)
  if (!entry) {
    return user
  }
  entry.role = 'admin'
  entry.publicKey = adminKey
  await saveStore(store)
  return entry
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':')
  if (!ivHex || !tagHex || !dataHex) {
    throw new AuthError('La llave custodial está corrupta', 500)
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivHex, 'hex'),
  )
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

function encryptionKey(): Buffer {
  return createHash('sha256').update(sessionSecret()).digest()
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const next = hashPassword(password, salt)
  return safeEqual(next, hash)
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null
  }
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      return rest.join('=')
    }
  }
  return null
}
