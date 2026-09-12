import { StrKey } from '@stellar/stellar-sdk'

export type ParsedSinpeSms = {
  crcAmount: number
  referenceId: string
  comment: string
}

const REFERENCE_PATTERNS = [
  /comprobante\s*(?:n[o°.]{0,2}|num(?:ero)?)?\s*[:#-]?\s*(\d{6,32})/i,
  /referencias?\s*[:#-]?\s*(\d{6,32})/i,
  /(?:ref(?:erencia)?)\s*[:#-]?\s*(\d{6,32})/i,
  /autorizaci[oó]n\s*[:#-]?\s*(\d{6,32})/i,
]

const AMOUNT_PATTERNS = [
  /(?:ha\s+recibido|recibid[oa]|recibiste|recibio|recibió)\s+₡?\s*([\d][\d.,]*)\s*(?:colones|crc)?/i,
  /([\d][\d.,]*)\s*(?:colones|crc)\b/i,
  /₡\s*([\d][\d.,]*)/i,
  /(?:por|monto)\s+crc\s*([\d][\d.,]*)/i,
]

const COMMENT_PATTERNS = [
  /por\s+sinpe\s+m[oó]vil\s*,\s*(.+?)\s*\.?\s*(?:trans\.?\s*)?referencia\b/i,
  /detalle\s*[:.]?\s*(.+)$/i,
  /(?:nota|comentario|concept[oa]|descripci[oó]n)\s*[:.]?\s*(.+)$/i,
]

export function parseSinpeSms(message: string): ParsedSinpeSms | null {
  const text = message.replace(/\s+/g, ' ').trim()
  if (!text) {
    return null
  }

  const crcAmount = extractAmount(text)
  const referenceId = extractReference(text)
  if (crcAmount === null || !referenceId) {
    return null
  }

  return {
    crcAmount,
    referenceId,
    comment: extractComment(text),
  }
}

export function extractStellarPublicKey(comment: string): string | undefined {
  const match = comment.toUpperCase().match(/G[A-Z2-7]{55}/)
  if (!match) {
    return undefined
  }
  return StrKey.isValidEd25519PublicKey(match[0]) ? match[0] : undefined
}

export function extractPhoneFromSms(message: string): string | undefined {
  const match = message.match(
    /(?:desde|de)\s*:?\s*(\+?\d[\d\s-]{7,18})/i,
  )
  return match?.[1]?.replace(/\s+/g, '')
}

function extractReference(text: string): string | undefined {
  for (const pattern of REFERENCE_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }
  return undefined
}

function extractAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const amount = parseCrcNumber(match[1])
      if (amount !== null && amount > 0) {
        return amount
      }
    }
  }
  return null
}

function extractComment(text: string): string {
  for (const pattern of COMMENT_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) {
      return match[1].replace(/\s+/g, ' ').trim()
    }
  }
  return ''
}

export function parseCrcNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  if (!cleaned) {
    return null
  }
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',')
    const lastDot = cleaned.lastIndexOf('.')
    const value =
      lastComma > lastDot
        ? Number(cleaned.replace(/\./g, '').replace(',', '.'))
        : Number(cleaned.replace(/,/g, ''))
    return Number.isFinite(value) ? value : null
  }
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',')
    const decimals = parts[1] ?? ''
    const value =
      decimals.length === 3
        ? Number(cleaned.replace(/,/g, ''))
        : Number(cleaned.replace(',', '.'))
    return Number.isFinite(value) ? value : null
  }
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}
