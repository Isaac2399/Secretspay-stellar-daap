import { loadLocalEnv } from './loadLocalEnv.js'
import { decodeHttpBody } from './httpBody.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { ensureDevSuperAdmin, ensureDevEventStaff } from './auth.js'
import { scheduleGuestDemoWarm } from './guestDemo.js'
import { dispatchApi } from './dispatchApi.js'

loadLocalEnv()

export function authApiPlugin(): Plugin {
  return {
    name: 'stellar-auth-api',
    enforce: 'pre',
    configureServer(server) {
      void ensureDevSuperAdmin()
      void ensureDevEventStaff()
      scheduleGuestDemoWarm()
      server.middlewares.use(handleApi)
    },
    configurePreviewServer(server) {
      void ensureDevSuperAdmin()
      void ensureDevEventStaff()
      scheduleGuestDemoWarm()
      server.middlewares.use(handleApi)
    },
  }
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  const url = req.url ?? ''
  const pathOnly = url.split('?')[0] ?? url
  if (
    !pathOnly.startsWith('/api/auth') &&
    !pathOnly.startsWith('/api/payments') &&
    !pathOnly.startsWith('/api/sep24') &&
    !pathOnly.startsWith('/api/places') &&
    !pathOnly.startsWith('/api/admin') &&
    !pathOnly.startsWith('/api/cards') &&
    !pathOnly.startsWith('/api/rwa') &&
    !pathOnly.startsWith('/api/invoices') &&
    !pathOnly.startsWith('/api/events') &&
    !pathOnly.startsWith('/api/v1/') &&
    !pathOnly.includes('sinpe-sms-webhook')
  ) {
    next()
    return
  }

  try {
    const parsedUrl = new URL(url, 'http://local')
    const path = parsedUrl.pathname
    const query = Object.fromEntries(parsedUrl.searchParams.entries())
    const posted =
      req.method === 'GET' || req.method === 'HEAD'
        ? { body: {}, rawBody: undefined }
        : await readJson(req)
    const body = { ...query, ...posted.body }
    const authorization = headerValue(req.headers.authorization)
    const result = await dispatchApi({
      method: req.method ?? 'GET',
      path,
      cookie: req.headers.cookie,
      authorization,
      apiKey: headerValue(req.headers['x-api-key']),
      body,
      rawBody: posted.rawBody,
      webhookId: headerValue(req.headers['svix-id']) ?? headerValue(req.headers['webhook-id']),
      webhookTimestamp:
        headerValue(req.headers['svix-timestamp']) ??
        headerValue(req.headers['webhook-timestamp']),
      webhookSignature:
        headerValue(req.headers['svix-signature']) ??
        headerValue(req.headers['webhook-signature']),
    })
    const payload = JSON.stringify(result.body)
    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json')
    if (result.setCookie) {
      res.setHeader('Set-Cookie', result.setCookie)
    }
    res.end(payload)
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Error interno' }))
  }
}

async function readJson(
  req: IncomingMessage,
): Promise<{ body: Record<string, unknown>; rawBody?: string }> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) {
    return { body: {} }
  }
  return { body: decodeHttpBody(raw), rawBody: raw }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.trim() || undefined
}
