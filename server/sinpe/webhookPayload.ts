const PLACEHOLDER = /^\{[a-z0-9_]+\}$/i

export function extractSinpeWebhookFields(body: Record<string, unknown>): {
  sender: string
  message: string
  timestamp: number
} {
  const strings = flattenStrings(body)
  const namedMessage = firstString(
    body.message,
    body.text,
    body.body,
    body.sms,
    body.content,
    body.msg,
    body.key,
    body.sms_text,
    body.smsBody,
    body.fullMessage,
    body.originalMessage,
  )
  const scored = strings
    .map((value) => ({ value, score: smsScore(value) }))
    .sort((a, b) => b.score - a.score || b.value.length - a.value.length)
  const message =
    (namedMessage && smsScore(namedMessage) > 0 ? namedMessage : '') ||
    scored.find((row) => row.score > 0)?.value ||
    namedMessage ||
    scored[0]?.value ||
    ''

  return {
    sender: firstString(body.sender, body.from, body.number, body.phone, body.originator),
    message,
    timestamp: Number(
      body.timestamp ?? body.sentStamp ?? body.time ?? body.date ?? Date.now(),
    ),
  }
}

function flattenStrings(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) {
    return []
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || PLACEHOLDER.test(trimmed)) {
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
  const value = text.toLowerCase()
  let score = 0
  if (/recib/.test(value)) score += 4
  if (/colones|\bcrc\b|₡|¢/.test(value)) score += 4
  if (/sinpe/.test(value)) score += 3
  if (/referencia|comprobante/.test(value)) score += 3
  if (/sc[a-z0-9]{8}ts/i.test(text)) score += 5
  if (/\bR[A-HJ-NP-Z2-9]{5}\b/i.test(text)) score += 2
  return score
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() && !PLACEHOLDER.test(value.trim())) {
      return value.trim()
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
