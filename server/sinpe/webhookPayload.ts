const PLACEHOLDER =
  /^(?:\{+[a-z][a-z0-9_]*\}+|%+[a-z][a-z0-9_]*%+|\$+[a-z][a-z0-9_]*\$+|\{%[a-z][a-z0-9_]*%\})$/i

const MESSAGE_KEYS = [
  'fullMessage',
  'full_message',
  'originalMessage',
  'original_message',
  'smsContent',
  'sms_content',
  'sms_text',
  'smsText',
  'sms_body',
  'smsBody',
  'message',
  'text',
  'sms',
  'body',
  'content',
  'msg',
  'm',
]

const IGNORE_KEYS = new Set([
  'action',
  'path',
  'url',
  'api_key',
  'apiKey',
  'x-api-key',
  'authorization',
])

const PART_ARRAY_KEYS = ['parts', 'pdus', 'messages', 'smsParts', 'fragments']

export function extractSinpeWebhookFields(body: Record<string, unknown>): {
  sender: string
  message: string
  timestamp: number
} {
  const strings = flattenStrings(body)
  const named = MESSAGE_KEYS.flatMap((key) => flattenStrings(body[key]))
  const joined = joinMessageParts(body)
  const unwrapped = strings.flatMap((value) => {
    const inner = unwrapJsonSms(value)
    return inner && inner !== value ? [inner] : []
  })
  const candidates = unique(
    [...named, ...strings, ...unwrapped, joined].filter(Boolean),
  )
  const scored = candidates
    .map((value) => ({
      value,
      score: smsScore(value) + lengthBonus(value),
    }))
    .sort((a, b) => b.score - a.score || b.value.length - a.value.length)

  const message = scored.find((row) => row.score > 0)?.value || named[0] || ''

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
        body.receivedStamp ??
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

export function isRouteNoise(value: string): boolean {
  const compact = value.trim().toLowerCase().replace(/[^a-z]/g, '')
  return (
    compact === 'sinpesmswebhook' ||
    compact === 'webhook' ||
    compact === 'payments' ||
    compact === 'action' ||
    /apipayments/.test(compact)
  )
}

export function looksTruncatedSinpeSms(message: string): boolean {
  const text = message.replace(/\s+/g, ' ').trim()
  if (text.length < 24) {
    return true
  }
  const hasCode = /sc[a-z0-9]{8}ts/i.test(text.replace(/[^a-z0-9]/gi, ''))
  const mentionsNote = /sinpe\s+m[oó]vil/i.test(text)
  const noReference = !/referencia|comprobante/i.test(text)
  const endsBroken = /[,:;]\s*$/.test(text) || /\bsc[a-z0-9]{1,7}$/i.test(text)
  return (!hasCode && (mentionsNote || noReference)) || endsBroken
}

export function recoverBrokenJsonSms(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) {
    return null
  }
  const fields: Record<string, unknown> = {}
  const pattern =
    /"(from|sender|text|message|sms|body|content|msg|sim|sentStamp|receivedStamp|timestamp)"\s*:\s*(?:"((?:\\.|[^"\\])*)(?:"|$)|(-?\d+))/gi
  for (const match of trimmed.matchAll(pattern)) {
    const key = match[1]
    if (!key) {
      continue
    }
    fields[key] = match[3] ?? unescapeJson(match[2] ?? '')
  }
  return Object.keys(fields).length > 0 ? fields : null
}

function flattenStrings(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) {
    return []
  }
  if (typeof value === 'string') {
    const trimmed = decodeValue(value)
    if (!trimmed || isTemplatePlaceholder(trimmed) || isRouteNoise(trimmed)) {
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
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      if (IGNORE_KEYS.has(key)) {
        return []
      }
      return flattenStrings(entry, depth + 1)
    })
  }
  return []
}

function joinMessageParts(body: Record<string, unknown>): string {
  for (const key of PART_ARRAY_KEYS) {
    const value = body[key]
    if (!Array.isArray(value)) {
      continue
    }
    const joined = flattenStrings(value).join(' ').replace(/\s+/g, ' ').trim()
    if (joined.length > 20) {
      return joined
    }
  }
  const numbered = Object.entries(body)
    .filter(([key]) => /^(?:text|message|sms|part)_?\d+$/i.test(key))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .flatMap(([, value]) => flattenStrings(value))
  return numbered.join(' ').replace(/\s+/g, ' ').trim()
}

function unwrapJsonSms(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) {
    return text
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const inner = extractInnerMessage(parsed as Record<string, unknown>)
      if (inner) {
        return inner
      }
    }
  } catch {
    const recovered = recoverBrokenJsonSms(trimmed)
    const inner = recovered ? extractInnerMessage(recovered) : ''
    if (inner) {
      return inner
    }
  }
  return text
}

function extractInnerMessage(body: Record<string, unknown>): string {
  const named = MESSAGE_KEYS.flatMap((key) => flattenStrings(body[key]))
  const scored = named
    .map((value) => ({ value, score: smsScore(value) + lengthBonus(value) }))
    .sort((a, b) => b.score - a.score || b.value.length - a.value.length)
  return scored[0]?.value ?? ''
}

function smsScore(text: string): number {
  if (isTemplatePlaceholder(text) || isRouteNoise(text)) {
    return -1
  }
  const value = text.toLowerCase()
  let score = 0
  if (/recib/.test(value)) score += 4
  if (/colones|\bcrc\b|₡|¢/.test(value)) score += 4
  if (/sinpe/.test(value) && value.length > 24) score += 3
  if (/referencia|comprobante/.test(value)) score += 3
  if (/sc[a-z0-9]{8}ts/i.test(text.replace(/[^a-z0-9]/gi, ''))) score += 8
  if (/\bR[A-HJ-NP-Z2-9]{5}\b/i.test(text)) score += 2
  if (/\d+[.,]\d{1,2}/.test(text) || /[₡¢]\s*\d/.test(text)) score += 2
  if (/\d{1,7}\s*(colones|crc)/i.test(text)) score += 3
  return score
}

function lengthBonus(text: string): number {
  return Math.min(6, Math.floor(text.length / 40))
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = decodeValue(value)
      if (trimmed && !isTemplatePlaceholder(trimmed) && !isRouteNoise(trimmed)) {
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

function unescapeJson(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
}

function unique(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.trim()
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(key)
  }
  return out
}
