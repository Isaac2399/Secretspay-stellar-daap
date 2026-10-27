import { createHmac, randomBytes } from 'node:crypto'

/** `sc` + 8 chars + `ts` (SECRETS). Cabe en la nota de SINPE Móvil. */
const PREFIX = 'sc'
const SUFFIX = 'ts'
const BODY_LEN = 8
const CHARSET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const LEGACY_BODY = '[A-HJ-NP-Z2-9]{5}'

/** Ventana para usar el código tras copiarlo. */
export const SINPE_CODE_TTL_MS = 5 * 60 * 1000
/** Historial para emparejar SMS que llegaron con un código ya vencido. */
export const SINPE_CODE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export function sinpeReceivePhone(): string {
  const digits = (process.env.SINPE_RECEIVE_PHONE ?? '').replace(/\D/g, '')
  return digits || '62951541'
}

/**
 * Remitentes BAC (u otros bancos) permitidos para acreditar automático.
 * Ej: SINPE_SMS_ALLOWED_SENDERS=2272,8989
 * Vacío = no filtra (solo útil en local).
 */
export function sinpeAllowedSenders(): string[] {
  const raw = (process.env.SINPE_SMS_ALLOWED_SENDERS ?? '').trim()
  if (!raw) {
    return []
  }
  return raw
    .split(/[,;\s]+/)
    .map((part) => part.replace(/\D/g, ''))
    .filter(Boolean)
}

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** true si no hay allowlist o el from coincide (también con prefijo 506). */
export function isAllowedSinpeSender(sender: string): boolean {
  const allowed = sinpeAllowedSenders()
  if (allowed.length === 0) {
    return true
  }
  const digits = normalizePhoneDigits(sender)
  if (!digits) {
    return false
  }
  return allowed.some(
    (entry) =>
      digits === entry ||
      digits.endsWith(entry) ||
      entry.endsWith(digits) ||
      (digits.startsWith('506') && digits.slice(3) === entry) ||
      (entry.startsWith('506') && entry.slice(3) === digits),
  )
}

export function formatSinpePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`
  }
  if (digits.length === 11 && digits.startsWith('506')) {
    return `${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  return phone.trim()
}

export function secretsCodeForPublicKey(publicKey: string): string {
  const hmac = createHmac('sha256', codeSecret()).update(publicKey).digest()
  let body = ''
  for (let index = 0; body.length < BODY_LEN; index += 1) {
    body += CHARSET[hmac[index % hmac.length]! % CHARSET.length] ?? '2'
  }
  return `${PREFIX}${body}${SUFFIX}`
}

export function codeMatchesPublicKey(code: string, publicKey: string): boolean {
  const normalized = normalizeSinpeCode(code)
  if (isSecretsCode(normalized)) {
    return normalized === secretsCodeForPublicKey(publicKey)
  }
  return false
}

export function normalizeSinpeCode(raw: string): string {
  const compact = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const secrets = compact.match(new RegExp(`^${PREFIX}([a-z0-9]{${BODY_LEN}})${SUFFIX}$`))
  if (secrets?.[1]) {
    return `${PREFIX}${secrets[1].toUpperCase()}${SUFFIX}`
  }
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isSinpeCode(value: string): boolean {
  const normalized = normalizeSinpeCode(value)
  return isSecretsCode(normalized) || isLegacySinpeCode(normalized)
}

export function isSecretsCode(value: string): boolean {
  return new RegExp(`^${PREFIX}[A-Z0-9]{${BODY_LEN}}${SUFFIX}$`).test(
    normalizeSinpeCode(value),
  )
}

function isLegacySinpeCode(value: string): boolean {
  return new RegExp(`^R${LEGACY_BODY}$`).test(value.trim().toUpperCase())
}

const CODE_NOISE =
  /TRANSFERENCIAS?|TRANSFERENCI|REFERENCIAS?|RECIBISTE|RECIBIDO|RECIBIO|COLONES/g

export function extractSinpeCodes(...texts: string[]): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    const code = normalizeSinpeCode(raw)
    if (!isSinpeCode(code) || seen.has(code)) {
      return
    }
    seen.add(code)
    found.push(code)
  }

  const joined = texts.filter(Boolean).join(' ')
  const compact = joined.replace(/[^a-z0-9]/gi, '')
  const wrapped = new RegExp(`${PREFIX}[a-z0-9]{${BODY_LEN}}${SUFFIX}`, 'gi')
  for (const match of compact.matchAll(wrapped)) {
    add(match[0] ?? '')
  }

  const upper = joined.toUpperCase()
  const afterNote = upper.split(/SINPE\s+M[OÓ]VIL\s*,\s*/i)[1]
  if (afterNote) {
    const token = afterNote.replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/)[0]
    if (token) {
      add(token)
    }
  }

  const spaced = upper.replace(CODE_NOISE, ' ').replace(/[^A-Z0-9]+/g, ' ')
  for (const token of spaced.split(/\s+/)) {
    add(token)
  }
  const glued = upper.replace(CODE_NOISE, ' ').replace(/[^A-Z0-9]/g, '')
  const legacy = new RegExp(`R${LEGACY_BODY}`, 'g')
  for (const match of glued.matchAll(legacy)) {
    add(match[0] ?? '')
  }
  return found
}

export function extractSinpeCode(...texts: string[]): string | undefined {
  return extractSinpeCodes(...texts)[0]
}

export function generateSinpeCode(publicKey: string): string {
  return secretsCodeForPublicKey(publicKey)
}

/** Código efímero aleatorio (no depende solo de la public key). */
export function mintEphemeralSinpeCode(exclude: Set<string> = new Set()): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const bytes = randomBytes(BODY_LEN)
    let body = ''
    for (let index = 0; index < BODY_LEN; index += 1) {
      body += CHARSET[bytes[index]! % CHARSET.length] ?? '2'
    }
    const code = `${PREFIX}${body}${SUFFIX}`
    if (!exclude.has(normalizeSinpeCode(code))) {
      return code
    }
  }
  throw new Error('No se pudo generar un código SINPE único')
}

export function isSinpeCodeExpired(expiresAt: string, now = Date.now()): boolean {
  const expires = Date.parse(expiresAt)
  return !Number.isFinite(expires) || expires <= now
}

export function remainingSinpeCodeMs(expiresAt: string, now = Date.now()): number {
  const expires = Date.parse(expiresAt)
  if (!Number.isFinite(expires)) {
    return 0
  }
  return Math.max(0, expires - now)
}

function codeSecret(): string {
  return (
    (process.env.SINPE_CODE_SECRET ?? '').trim() ||
    (process.env.SESSION_SECRET ?? '').trim() ||
    'stellar-web-app-dev-secret'
  )
}
