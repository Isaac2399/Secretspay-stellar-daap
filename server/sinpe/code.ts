import { randomInt } from 'node:crypto'

/** 6 caracteres (R + 5). Cabe en la nota de SINPE Móvil. */
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_BODY = '[A-HJ-NP-Z2-9]{5}'

export function normalizeSinpeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isSinpeCode(value: string): boolean {
  return new RegExp(`^R${CODE_BODY}$`).test(normalizeSinpeCode(value))
}

export function extractSinpeCode(...texts: string[]): string | undefined {
  const joined = texts.filter(Boolean).join(' ').toUpperCase()
  const spaced = joined.replace(/[^A-Z0-9]+/g, ' ')
  const bounded = spaced.match(new RegExp(`\\bR${CODE_BODY}\\b`))
  if (bounded?.[0]) {
    return bounded[0]
  }
  const compact = joined.replace(/[^A-Z0-9]/g, '')
  const glued = compact.match(new RegExp(`R${CODE_BODY}`))
  return glued?.[0]
}

export function generateSinpeCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    let code = 'R'
    for (let i = 0; i < 5; i += 1) {
      code += CHARSET[randomInt(CHARSET.length)] ?? '2'
    }
    if (!taken.has(code)) {
      return code
    }
  }
  throw new Error('No se pudo generar un código SINPE único')
}
