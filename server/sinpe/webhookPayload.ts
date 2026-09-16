const PLACEHOLDER =
  /^(?:\{+[a-z][a-z0-9_]*\}+|%+[a-z][a-z0-9_]*%+|\$+[a-z][a-z0-9_]*\$+|\{%[a-z][a-z0-9_]*%\})$/i

const MESSAGE_KEYS = [
  'message',
  'text',
  'sms',
  'body',
  'content',
  'msg',
  'sms_text',
  'smsText',
  'sms_body',
  'smsBody',
  'fullMessage',
  'full_message',
  'originalMessage',
  'original_message',
  'smsContent',
  'sms_content',
  'm',
]

export function extractSinpeWebhookFields(body: Record<string, unknown>): {
  sender: string
  message: string
  timestamp: number
} {
  const strings = flattenStrings(body)
  const namedMessage = firstString(...MESSAGE_KEYS.map((key) => body[key]))
  const scored = strings
    .map((value) => ({ value, score: smsScore(value) }))
    .sort((a, b) => b.score - a.score || b.value.length - a.value.length)
  const message =
    (namedMessage && smsScore(namedMessage) > 0 ? namedMessage : '') ||
    scored.find((row) => row.score > 0)?.value ||
    namedMessage ||
    scored.find((row) => !isTemplatePlaceholder(row.value))?.value ||
    ''

  return {
    sender: firstString(
      body.sender,
      body.from,
      body.number,
      body.phone,
      body.originator,
      body.sim,
    ),
    message,
    timestamp: Number(
      body.timestamp ??
        body.sentStamp ??
        body.sent_stamp ??
        body.time ??
        body.date ??
        Date.now(),
    ),
  }
}

export function isTemplatePlaceholder(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) {
    return true
  }
  if (PLACEHOLDER.test(trimmed)) {
    return true
  }
  const withoutTokens = trimmed
    .replace(/%[a-z][a-z0-9_]*%/gi, '')
    .replace(/\{+[a-z][a-z0-9_]*\}+/gi, '')
    .replace(/\$[a-z][a-z0-9_]*\$/gi, '')
    .replace(/\s+/g, '')
  return withoutTokens.length === 0
}

function flattenStrings(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) {
    return []
  }
  if (typeof value === 'string') {
    const trimmed = decodeValue(value)
    if (!trimmed || isTemplatePlaceholder(trimmed)) {
      return []
    }
    return [trimmed]
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return [String(value)]
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenStrings(entry, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.values(value).flatMap((entry) => flattenStrings(entry, depth + 1))
  }
  return []
}

function smsScore(text: string): number {
  if (isTemplatePlaceholder(text)) {
    return -1
  }
  const value = text.toLowerCase()
  let score = 0
  if (/recib/.test(value)) score += 4
  if (/colones|\bcrc\b|₡|¢/.test(value)) score += 4
  if (/sinpe/.test(value)) score += 3
  if (/referencia|comprobante/.test(value)) score += 3
  if (/sc[a-z0-9]{8}ts/i.test(text)) score += 5
  if (/\bR[A-HJ-NP-Z2-9]{5}\b/i.test(text)) score += 2
  if (/\d+[.,]\d{1,2}/.test(text) || /[₡¢]\s*\d/.test(text)) score += 2
  return score
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = decodeValue(value)
      if (trimmed && !isTemplatePlaceholder(trimmed)) {
        return trimmed
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
    if (value && typeof value === 'object') {
      const nested = flattenStrings(value)
      const hit = nested.find((entry) => smsScore(entry) > 0) ?? nested[0]
      if (hit) {
        return hit
      }
    }
  }
  return ''
}

function decodeValue(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }
  try {
    const once = decodeURIComponent(trimmed.replace(/\+/g, ' ')).trim()
    if (once.includes('%') && /%[0-9a-f]{2}/i.test(once)) {
      return decodeURIComponent(once).trim()
    }
    return once
  } catch {
    return trimmed
  }
}
