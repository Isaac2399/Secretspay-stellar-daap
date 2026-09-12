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

export function extractSinpeCodes(...texts: string[]): string[] {
  const joined = texts.filter(Boolean).join(' ').toUpperCase()
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

  const spaced = joined.replace(/[^A-Z0-9]+/g, ' ')
  for (const token of spaced.split(/\s+/)) {
    add(token)
  }
  const compact = joined.replace(/[^A-Z0-9]/g, '')
  const glued = new RegExp(`R${CODE_BODY}`, 'g')
  for (const match of compact.matchAll(glued)) {
    add(match[0] ?? '')
  }
  return found
}

export function extractSinpeCode(...texts: string[]): string | undefined {
  return extractSinpeCodes(...texts)[0]
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
