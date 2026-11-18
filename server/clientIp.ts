import type { IncomingMessage } from 'node:http'

export function clientIpFromHeaders(
  headers: IncomingMessage['headers'],
  fallback = '',
): string {
  const forwarded = header(headers, 'x-forwarded-for').split(',')[0]?.trim() ?? ''
  if (forwarded) {
    return forwarded.slice(0, 64)
  }
  const real = header(headers, 'x-real-ip').trim()
  if (real) {
    return real.slice(0, 64)
  }
  return fallback.trim().slice(0, 64)
}

function header(headers: IncomingMessage['headers'], name: string): string {
  const value = headers[name]
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }
  return value ?? ''
}
