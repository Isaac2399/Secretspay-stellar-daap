import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { AuthError } from '../errors.js'
import { extractSinpeCodes, isSecretsCode } from './code.js'
import { processSinpeSmsWebhook } from './service.js'

const DEFAULT_FORWARDERS = 'rmadrigal.sb@gmail.com'
const DEFAULT_BANK_DOMAINS = [
  'bp.fi.cr',
  'bpdc.fi.cr',
  'bancopopular.fi.cr',
  'bancopopular.com',
  'bcr.fi.cr',
  'bancobcr.com',
  'bancobcr.fi.cr',
]

const WEBHOOK_TOLERANCE_SEC = 5 * 60

export type InboundEmailRequest = {
  rawBody?: string
  body: Record<string, unknown>
  webhookId?: string
  webhookTimestamp?: string
  webhookSignature?: string
}

export async function handleInboundSinpeEmail(input: InboundEmailRequest) {
  const event = input.body
  if (event.type !== 'email.received') {
    if (!signatureOk(input)) {
      throw new AuthError('Webhook de correo no autorizado', 401)
    }
    return { status: 'ignored' as const, reason: 'not_email_received' }
  }

  const data = asRecord(event.data)
  const emailId = stringField(data.email_id) || stringField(data.emailId)
  if (!emailId) {
    throw new Error('Resend no envió el id del correo')
  }

  const signed = signatureOk(input)
  try {
    const current = await processReceivedSinpeEmail(emailId, stringField(data.from))
    const sweep = await syncRecentSinpeEmails({ exceptId: emailId }).catch((error: unknown) => {
      console.error('[sinpe-email] sweep', error)
      return []
    })
    return { ...current, sweep }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!signed && /respondió (401|403|404)/i.test(message)) {
      throw new AuthError('Webhook de correo no autorizado', 401)
    }
    throw error
  }
}

/**
 * Lee los correos que ya están en Resend y acredita los que aún no se procesaron.
 * El id solo sirve si Resend lo entregó a esta cuenta: el cuerpo sale de la API, no del POST.
 */
export async function syncRecentSinpeEmails(input?: { exceptId?: string; limit?: number }) {
  const rows = await listReceivedEmails(input?.limit ?? 20)
  const cutoff = Date.now() - 36 * 60 * 60 * 1000
  const results = []
  for (const row of rows) {
    if (!row.id || row.id === input?.exceptId) {
      continue
    }
    const created = Date.parse(row.createdAt)
    if (Number.isFinite(created) && created < cutoff) {
      continue
    }
    try {
      results.push(await processReceivedSinpeEmail(row.id, row.from))
    } catch (error) {
      results.push({
        emailId: row.id,
        status: 'error' as const,
        error: error instanceof Error ? error.message : 'No se pudo leer el correo',
      })
    }
  }
  return results
}

export async function processReceivedSinpeEmail(emailId: string, hintedFrom = '') {
  const mail = await fetchReceivedEmail(emailId)
  const text = emailPlainText({
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })
  if (!text.trim()) {
    throw new Error('Resend aún no entregó el cuerpo del correo')
  }

  const from = extractEmail(mail.from) || extractEmail(hintedFrom)
  const bankFrom = bankAddressIn(from, text)
  const code = extractSinpeCodes(text).find((entry) => isSecretsCode(entry))
  const trusted =
    inboundEmailIsTrusted({
      from,
      text,
      headers: mail.headers,
      bankFrom,
    }) ||
    isCompleteSinpeCreditEmail(text) ||
    (looksLikeIncomingCredit(text) && Boolean(code))
  const sender = bankFrom || from || 'email'
  const digest = createHash('sha256').update(text).digest('hex')

  if (!looksLikeIncomingCredit(text)) {
    console.info('[sinpe-email]', {
      emailId,
      from,
      textLength: text.length,
      digest,
      status: 'ignored',
      reason: 'not_a_credit',
    })
    return {
      status: 'ignored' as const,
      reason: 'not_a_credit',
      emailId,
      from,
      textLength: text.length,
      digest,
    }
  }

  const result = await processSinpeSmsWebhook(
    {
      sender,
      message: text,
      timestamp: Date.parse(mail.created_at) || Date.now(),
    },
    trusted ? { trustedSender: true } : { manualOnly: true },
  )

  console.info('[sinpe-email]', {
    emailId,
    from: sender,
    textLength: text.length,
    digest,
    trusted,
    code: code ?? '',
    status: (result as { status?: string }).status,
  })

  return {
    ...result,
    emailId,
    from: sender,
    textLength: text.length,
    digest,
    trusted,
    code: code ?? '',
  }
}

export function verifyResendSignature(
  rawBody: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  nowMs = Date.now(),
): boolean {
  const id = headers.id?.trim()
  const timestamp = headers.timestamp?.trim()
  const signature = headers.signature?.trim()
  if (!id || !timestamp || !signature || !rawBody) {
    return false
  }
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds)) {
    return false
  }
  if (Math.abs(nowMs / 1000 - seconds) > WEBHOOK_TOLERANCE_SEC) {
    return false
  }
  const secretPart = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const key = Buffer.from(secretPart, 'base64')
  if (key.length === 0) {
    return false
  }
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64')
  return signature.split(' ').some((part) => {
    if (!part.startsWith('v1,')) {
      return false
    }
    const value = part.slice(3)
    const actual = Buffer.from(value)
    const wanted = Buffer.from(expected)
    return actual.length === wanted.length && timingSafeEqual(actual, wanted)
  })
}

export function emailPlainText(input: {
  subject?: string | null
  text?: string | null
  html?: string | null
}): string {
  const text = (input.text ?? '').trim()
  const fromHtml = input.html ? htmlToText(input.html) : ''
  const body = scoreSinpeText(fromHtml) > scoreSinpeText(text) ? fromHtml : text
  const subject = (input.subject ?? '').trim()
  if (!subject || body.toLowerCase().includes(subject.toLowerCase())) {
    return body
  }
  return `${subject}\n${body}`.trim()
}

/**
 * El comprobante del Popular (reenviado o directo) reemplaza al SMS.
 * Trae estado, movimiento, monto neto, referencia y el código en la descripción.
 */
export function isCompleteSinpeCreditEmail(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ')
  const applied = /estado\s+de\s+la\s+transacci[oó]n\s*:?\s*aplicado\b/i.test(normalized)
  const credit = /tipo\s+de\s+movimiento\s*:?\s*cr[eé]dito\b/i.test(normalized)
  const incoming = /canal\s+origen\s*:?\s*sm\s+entrante|ha\s+recibido\s+un\s+sinpe/i.test(
    normalized,
  )
  const amount = /monto\s+neto\s*:?\s*\d/i.test(normalized)
  const reference = /referencia\s+sinpe\s*:?\s*\d{8,}/i.test(normalized)
  const code = /descripci[oó]n\s*:?\s*\S*sc[a-z0-9]{8}ts\b/i.test(normalized)
  return applied && credit && incoming && amount && reference && code
}

export function inboundEmailIsTrusted(input: {
  from: string
  text: string
  headers?: Record<string, string>
  bankFrom: string
}): boolean {
  if (!looksLikeIncomingCredit(input.text)) {
    return false
  }
  const envelope = extractEmail(input.from)
  const envelopeAuthFailed = authenticationFailed(input.headers, envelope)
  const complete = isCompleteSinpeCreditEmail(input.text)
  if (matchesBank(envelope) && !envelopeAuthFailed) {
    return true
  }
  if (
    matchesForwarder(envelope) &&
    !envelopeAuthFailed &&
    (Boolean(input.bankFrom) || complete)
  ) {
    return true
  }
  // Gmail conserva el From del banco y el DKIM original falla. El reenvío
  // del buzón permitido más el comprobante completo sí acredita.
  return (
    complete &&
    (matchesBank(envelope) || Boolean(input.bankFrom)) &&
    relayedByForwarder(input.headers)
  )
}

export function looksLikeIncomingCredit(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ')
  if (isOutgoingOrUnapplied(normalized)) {
    return false
  }
  const received =
    /recibid[oa]|recibiste|recibio|recibió|cr[eé]dito|abono/i.test(normalized)
  const debit = /d[eé]bito|cargo|enviaste|transferencia enviada|retiro/i.test(normalized)
  if (debit && !received) {
    return false
  }
  if (/inicio de sesi[oó]n|ingreso exitoso/i.test(normalized) && !received) {
    return false
  }
  if (received) {
    return true
  }
  return /sinpe\s*m[oó]vil|comprobante|referencia/i.test(normalized) &&
    /colones|crc|₡|¢/i.test(normalized)
}

export function matchesBank(value: string): boolean {
  const email = extractEmail(value).toLowerCase()
  if (!email) {
    return false
  }
  return allowedBankRules().some((rule) => email === rule || email.endsWith(`@${rule}`))
}

export function matchesForwarder(value: string): boolean {
  const email = extractEmail(value).toLowerCase()
  return Boolean(email) && forwarders().includes(email)
}

function signatureOk(input: InboundEmailRequest): boolean {
  const secret = (process.env.RESEND_WEBHOOK_SECRET ?? '').trim()
  if (!secret) {
    return false
  }
  return verifyResendSignature(input.rawBody ?? '', {
    id: input.webhookId,
    timestamp: input.webhookTimestamp,
    signature: input.webhookSignature,
  }, secret)
}

async function listReceivedEmails(limit: number): Promise<Array<{ id: string; from: string; createdAt: string }>> {
  const key = resendApiKey()
  const response = await fetch(`https://api.resend.com/emails/receiving?limit=${limit}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const message = stringField(payload.message) || `Resend respondió ${response.status}`
    throw new Error(message)
  }
  const rows = Array.isArray(payload.data) ? payload.data : []
  return rows.map((row) => {
    const record = asRecord(row)
    return {
      id: stringField(record.id) || stringField(record.email_id),
      from: stringField(record.from),
      createdAt: stringField(record.created_at),
    }
  })
}

function resendApiKey(): string {
  const key = (process.env.RESEND_API_KEY ?? '').trim()
  if (!key) {
    throw new Error('Falta RESEND_API_KEY para leer el correo recibido')
  }
  return key
}

async function fetchReceivedEmail(emailId: string): Promise<{
  from: string
  to: string[]
  subject: string
  text: string
  html: string
  created_at: string
  headers?: Record<string, string>
}> {
  const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${resendApiKey()}` },
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const message = stringField(payload.message) || `Resend respondió ${response.status}`
    throw new Error(message)
  }
  const mail = asRecord(payload.data ?? payload)
  return {
    from: stringField(mail.from),
    to: emailList(mail.to),
    subject: stringField(mail.subject),
    text: stringField(mail.text),
    html: stringField(mail.html),
    created_at: stringField(mail.created_at),
    headers: headerMap(mail.headers),
  }
}

function isOutgoingOrUnapplied(normalized: string): boolean {
  const status = normalized.match(
    /estado\s+de\s+la\s+transacci[oó]n\s*:?\s*([a-záéíóúñ]+)/i,
  )?.[1]
  if (status && status.toLowerCase() !== 'aplicado') {
    return true
  }
  const movement = normalized.match(/tipo\s+de\s+movimiento\s*:?\s*([a-záéíóúñ]+)/i)?.[1]
  if (movement && !/^cr[eé]dito$/i.test(movement)) {
    return true
  }
  return false
}

function relayedByForwarder(headers: Record<string, string> | undefined): boolean {
  if (!headers) {
    return false
  }
  const blob = Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
    .toLowerCase()
  return forwarders().some((email) => blob.includes(email))
}

function authenticationFailed(
  headers: Record<string, string> | undefined,
  fromEmail: string,
): boolean {
  if (!headers || !fromEmail) {
    return false
  }
  const blob = Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
    .toLowerCase()
  if (!blob.includes('dkim=') && !blob.includes('spf=')) {
    return false
  }
  const domain = fromEmail.split('@')[1] ?? ''
  const relevant = domain ? blob.includes(domain) : true
  if (!relevant) {
    return false
  }
  return blob.includes('dkim=fail') && !blob.includes('dkim=pass')
}

function bankAddressIn(from: string, body: string): string {
  if (matchesBank(from)) {
    return extractEmail(from).toLowerCase()
  }
  const found = emailsIn(body).find((email) => matchesBank(email))
  return found ?? ''
}

function forwarders(): string[] {
  return splitList(process.env.SINPE_EMAIL_FORWARDERS ?? DEFAULT_FORWARDERS)
}

function allowedBankRules(): string[] {
  const configured = splitList(process.env.SINPE_EMAIL_ALLOWED_FROM ?? '')
  return [...new Set([...DEFAULT_BANK_DOMAINS, ...configured])]
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function emailsIn(text: string): string[] {
  return [...text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((match) =>
    match[0].toLowerCase(),
  )
}

function extractEmail(value: string): string {
  const match = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  return match?.[0]?.toLowerCase() ?? ''
}

function scoreSinpeText(text: string): number {
  if (!text) {
    return 0
  }
  let score = Math.min(text.length, 4000) / 1000
  if (/sinpe/i.test(text)) score += 3
  if (/recib/i.test(text)) score += 2
  if (/colones|crc|₡|¢/i.test(text)) score += 2
  if (/sc[a-z0-9]{8}ts/i.test(text)) score += 4
  return score
}

function htmlToText(html: string): string {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(stripped).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&ntilde;/gi, 'ñ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
}

function emailList(...values: unknown[]): string[] {
  const found: string[] = []
  for (const value of values) {
    if (typeof value === 'string') {
      found.push(value)
    } else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          found.push(entry)
        }
      }
    }
  }
  return found
}

function headerMap(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value)
  const mapped: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === 'string') {
      mapped[key] = entry
    }
  }
  return Object.keys(mapped).length > 0 ? mapped : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
