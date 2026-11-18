/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadLocalEnv } from './loadLocalEnv.js'
import { decodeHttpBody } from './httpBody.js'
import { clientIpFromHeaders } from './clientIp.js'
import { publicErrorMessage } from './safeText.js'
import { dispatchApi } from './dispatchApi.js'

loadLocalEnv()

type VercelRequest = IncomingMessage & {
  body?: unknown
}

const DYNAMIC_SEGMENT = /\/\[(?:\.\.\.)?[^\]]+\]/g
const API_PREFIX = /^\/(v1\/)?(auth|payments|sep24|places|cards|admin|rwa|invoices|events|traction)(\/|$)/

export const config = {
  maxDuration: 30,
}

export default async function handler(
  req: VercelRequest,
  res: ServerResponse,
) {
  try {
    const received = await readRequestBody(req)
    const result = await dispatchApi({
      method: req.method ?? 'GET',
      path: requestPath(req),
      cookie: req.headers.cookie,
      authorization: headerAuth(req),
      apiKey: headerApiKey(req),
      clientIp: clientIpFromHeaders(req.headers, req.socket?.remoteAddress),
      body: received.body,
      rawBody: received.rawBody,
      webhookId: headerValue(req, 'svix-id') ?? headerValue(req, 'webhook-id'),
      webhookTimestamp:
        headerValue(req, 'svix-timestamp') ?? headerValue(req, 'webhook-timestamp'),
      webhookSignature:
        headerValue(req, 'svix-signature') ?? headerValue(req, 'webhook-signature'),
    })

    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json')
    if (result.setCookie) {
      res.setHeader('Set-Cookie', cookieForRequest(result.setCookie, req))
    }
    res.end(JSON.stringify(result.body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno'
    console.error('[api]', publicErrorMessage(message))
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: publicErrorMessage(message) }))
  }
}

function headerPath(req: IncomingMessage): string {
  const invoke = req.headers['x-invoke-path']
  const matched = req.headers['x-matched-path']
  const value = (Array.isArray(invoke) ? invoke[0] : invoke) ??
    (Array.isArray(matched) ? matched[0] : matched)
  return value ?? ''
}

/**
 * Vercel may pass the full `/api/cards/issue`, only `/cards/issue`,
 * only the dynamic segment (`/issue`), or the matcher `/api/cards/[action]`.
 * Rebuild a concrete `/api/...` path so local Vite, Preview, and Production
 * all hit the same dispatch routes.
 */
export function requestPath(req: VercelRequest): string {
  const url = req.url ?? ''
  const [urlPath, search = ''] = url.split('?')
  const query = new URLSearchParams(search)
  const fromUrl = normalizePath(urlPath ?? '')
  const fromHeader = normalizePath(headerPath(req))

  const concrete = firstConcreteApiPath([fromUrl, fromHeader])
  if (concrete) {
    return concrete
  }

  const matcher = fromHeader.includes('[')
    ? fromHeader
    : fromUrl.includes('[')
      ? fromUrl
      : ''
  const base = normalizePath(matcher.replace(DYNAMIC_SEGMENT, ''))
  const leftover = firstConcretePath([
    fromUrl.includes('[') ? '' : fromUrl,
    query.get('action'),
    query.get('path'),
  ])

  if (base.startsWith('/api') && leftover) {
    if (leftover.startsWith('/api/')) {
      return leftover
    }
    const suffix = leftover.startsWith('/') ? leftover : `/${leftover}`
    if (base.endsWith(suffix)) {
      return base
    }
    return normalizePath(`${base}${suffix}`)
  }

  if (base.startsWith('/api')) {
    return base
  }
  return fromUrl || '/api'
}

function firstConcreteApiPath(paths: string[]): string | null {
  for (const raw of paths) {
    if (!raw || raw.includes('[')) {
      continue
    }
    if (raw.startsWith('/api/')) {
      return normalizePath(raw)
    }
    if (API_PREFIX.test(raw)) {
      return normalizePath(`/api${raw}`)
    }
  }
  return null
}

function firstConcretePath(values: Array<string | null>): string {
  for (const value of values) {
    const raw = normalizePath(value ?? '')
    if (raw && raw !== '/' && !raw.includes('[')) {
      return raw
    }
  }
  return ''
}

function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return ''
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.replace(/\/$/, '') || '/'
}

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) {
    return {}
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    const raw = body.toString('utf8')
    return raw ? decodeHttpBody(raw) : {}
  }
  if (typeof body === 'string') {
    if (!body.trim()) {
      return {}
    }
    return decodeHttpBody(body)
  }
  if (typeof body === 'object') {
    return body as Record<string, unknown>
  }
  return {}
}

async function readRequestBody(
  req: VercelRequest,
): Promise<{ body: Record<string, unknown>; rawBody?: string }> {
  const query = queryParams(req)
  const parsed = parseBody(req.body)
  if (Object.keys(parsed).length > 0) {
    const rawBody = rawFromPreparsed(req.body)
    return { body: { ...query, ...parsed }, rawBody }
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    return { body: query }
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) {
    return { body: query }
  }
  return { body: { ...query, ...decodeHttpBody(raw) }, rawBody: raw }
}

function rawFromPreparsed(body: unknown): string | undefined {
  if (typeof body === 'string' && body.trim()) {
    return body
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    return body.toString('utf8')
  }
  return undefined
}

function cookieForRequest(
  setCookie: string | string[],
  req: IncomingMessage,
): string | string[] {
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie]
  if (requestIsSecure(req)) {
    return headers.length === 1 ? (headers[0] ?? '') : headers
  }
  const adjusted = headers.flatMap((header) => {
    const without = header.replace(/; Secure/g, '')
    if (/Max-Age=0/i.test(header)) {
      const withSecure = /; Secure/.test(header) ? header : `${header}; Secure`
      return [without, withSecure]
    }
    return [without]
  })
  const unique = [...new Set(adjusted)]
  return unique.length === 1 ? (unique[0] ?? '') : unique
}

function requestIsSecure(req: IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-proto']
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim()
    .toLowerCase()
  if (proto === 'https') {
    return true
  }
  if (proto === 'http') {
    return false
  }
  const socket = req.socket as { encrypted?: boolean } | undefined
  return socket?.encrypted === true
}

function headerAuth(req: IncomingMessage): string | undefined {
  const value = req.headers.authorization
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || undefined
}

function queryParams(req: VercelRequest): Record<string, string> {
  const fromUrl = Object.fromEntries(
    new URLSearchParams((req.url ?? '').split('?')[1] ?? '').entries(),
  )
  const raw = (req as VercelRequest & { query?: Record<string, unknown> }).query
  if (!raw || typeof raw !== 'object') {
    return fromUrl
  }
  const fromQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      fromQuery[key] = value
    } else if (Array.isArray(value) && typeof value[0] === 'string') {
      fromQuery[key] = value[0]
    }
  }
  return { ...fromQuery, ...fromUrl }
}

function headerApiKey(req: IncomingMessage): string | undefined {
  return (
    headerValue(req, 'x-api-key') ??
    headerValue(req, 'api-key') ??
    headerValue(req, 'apikey')
  )
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || undefined
}
