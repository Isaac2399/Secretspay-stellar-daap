import { createHmac } from 'node:crypto'

/** `sc` + 8 chars + `ts` (SECRETS). Cabe en la nota de SINPE Móvil. */
const PREFIX = 'sc'
const SUFFIX = 'ts'
const BODY_LEN = 8
const CHARSET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const LEGACY_BODY = '[A-HJ-NP-Z2-9]{5}'

export function sinpeReceivePhone(): string {
  const digits = (process.env.SINPE_RECEIVE_PHONE ?? '').replace(/\D/g, '')
  return digits || '88880000'
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

function codeSecret(): string {
  return (
    (process.env.SINPE_CODE_SECRET ?? '').trim() ||
    (process.env.SESSION_SECRET ?? '').trim() ||
    'stellar-web-app-dev-secret'
  )
}
