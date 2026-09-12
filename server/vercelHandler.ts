/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadLocalEnv } from './loadLocalEnv.js'
import { decodeHttpBody } from './httpBody.js'
import { dispatchApi } from './dispatchApi.js'

loadLocalEnv()

type VercelRequest = IncomingMessage & {
  body?: unknown
}

const DYNAMIC_SEGMENT = /\/\[(?:\.\.\.)?[^\]]+\]/g
const API_PREFIX = /^\/(v1\/)?(auth|payments|sep24|places|cards|admin|rwa|invoices)(\/|$)/

export const config = {
  maxDuration: 30,
}

export default async function handler(
  req: VercelRequest,
  res: ServerResponse,
) {
  try {
    const result = await dispatchApi({
      method: req.method ?? 'GET',
      path: requestPath(req),
      cookie: req.headers.cookie,
      authorization: headerAuth(req),
      apiKey: headerApiKey(req),
      body: await readRequestBody(req),
    })

    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json')
    if (result.setCookie) {
      res.setHeader('Set-Cookie', result.setCookie)
    }
    res.end(JSON.stringify(result.body))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno'
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: message }))
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

async function readRequestBody(req: VercelRequest): Promise<Record<string, unknown>> {
  const parsed = parseBody(req.body)
  if (Object.keys(parsed).length > 0) {
    return parsed
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const search = (req.url ?? '').split('?')[1]
    if (!search) {
      return {}
    }
    return Object.fromEntries(new URLSearchParams(search).entries())
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) {
    return {}
  }
  return decodeHttpBody(raw)
}

function headerAuth(req: IncomingMessage): string | undefined {
  const value = req.headers.authorization
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || undefined
}

function headerApiKey(req: IncomingMessage): string | undefined {
  const value = req.headers['x-api-key']
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || undefined
}
