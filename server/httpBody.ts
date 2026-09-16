import { recoverBrokenJsonSms } from './sinpe/webhookPayload.js'

/** Accept JSON, form-urlencoded, or a raw SMS string from SMS Forwarder. */
export function decodeHttpBody(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {}
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
      if (typeof parsed === 'string') {
        return { message: parsed }
      }
    } catch {
      const recovered = recoverBrokenJsonSms(trimmed)
      if (recovered) {
        return recovered
      }
    }
  }

  if (trimmed.includes('=') && !trimmed.includes('Ha recibido') && !trimmed.includes('{')) {
    const form = Object.fromEntries(new URLSearchParams(trimmed).entries())
    if (Object.keys(form).length > 0) {
      return form
    }
  }

  if (/recib|colones|sinpe|referencia|₡|¢/i.test(trimmed)) {
    return { message: trimmed }
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return { message: trimmed }
  }

  return { message: trimmed }
}
