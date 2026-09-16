import { StrKey } from '@stellar/stellar-sdk'
import { extractSinpeCodes } from './code.js'

export type ParsedSinpeSms = {
  crcAmount: number
  referenceId: string
  comment: string
}

const REFERENCE_PATTERNS = [
  /comprobante\s*(?:n[o°.]{0,2}|num(?:ero)?)?\s*[:#-]?\s*(\d{6,40})/i,
  /referencias?\s*[:#-]?\s*(\d{6,40})/i,
  /(?:ref(?:erencia)?)\s*[:#-]?\s*(\d{6,40})/i,
  /autorizaci[oó]n\s*[:#-]?\s*(\d{6,40})/i,
  /transacci[oó]n\s*(?:n[o°.]{0,2})?\s*[:#-]?\s*(\d{6,40})/i,
  /clave\s*[:#-]?\s*(\d{6,40})/i,
]

const AMOUNT_PATTERNS = [
  /(?:ha\s+recibido|recibid[oa]|recibiste|recibio|recibió)\s+[₡¢]?\s*([\d][\d.,]*)\s*(?:colones|crc)?/i,
  /([\d][\d.,]*)\s*(?:colones|crc)\b/i,
  /[₡¢]\s*([\d][\d.,]*)/,
  /(?:por|monto)\s+(?:crc\s*)?([\d][\d.,]*)/i,
]

const COMMENT_PATTERNS = [
  /por\s+sinpe\s+m[oó]vil\s*,\s*(sc[a-z0-9]{8}ts)/i,
  /por\s+sinpe\s+m[oó]vil\s*,\s*([A-Za-z0-9]{6,16})(?:\s|$|[.,])/i,
  /por\s+sinpe\s+m[oó]vil\s*,\s*(.+?)(?:\s+transf\w*\.?)?\s*referencia\b/i,
  /detalle\s*[:.]?\s*(.+)$/i,
  /(?:nota|comentario|concept[oa]|descripci[oó]n)\s*[:.]?\s*(.+)$/i,
]

export function parseSinpeSms(message: string): ParsedSinpeSms | null {
  const text = message.replace(/\s+/g, ' ').trim()
  if (!text) {
    return null
  }

  const crcAmount = extractAmount(text)
  if (crcAmount === null) {
    return null
  }

  return {
    crcAmount,
    referenceId: extractReference(text) ?? fallbackReference(text),
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

function fallbackReference(text: string): string {
  const amountToken = text.match(
    /(?:recib[\wí]*|colones|crc|₡|¢)\D{0,12}([\d][\d.,]*)/i,
  )?.[1]
  const runs = [...text.matchAll(/\d{6,40}/g)].map((match) => match[0])
  const best = runs
    .filter((run) => run !== amountToken?.replace(/[^\d]/g, ''))
    .sort((a, b) => b.length - a.length)[0]
  return best ?? `sms-${Math.abs(hashText(text))}`
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
  return extractSinpeCodes(text)[0] ?? ''
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

function hashText(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0
  }
  return hash
}
