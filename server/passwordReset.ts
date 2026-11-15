import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { sealPassword } from './auth.js'
import { AuthError } from './errors.js'
import { postgresReady } from './db/client.js'
import { revokeUserSessions } from './db/sessions.js'
import { loadStore, saveStore } from './userStore.js'

const RESET_TTL_MS = 30 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

export const PASSWORD_RESET_MESSAGE =
  'Si ese email está registrado, te enviamos un enlace para elegir una contraseña nueva. Revisa la bandeja y el spam. El enlace vence en 30 minutos.'

type ResetRequestResult = {
  devResetUrl?: string
  devHint?: string
}

export async function requestPasswordReset(emailRaw: string): Promise<ResetRequestResult> {
  const email = normalizeEmail(emailRaw)
  if (!isEmail(email)) {
    throw new AuthError('El email no es válido', 400)
  }

  const mode = mailMode()
  if (mode === 'resend') {
    await senderAddress()
  }
  const store = await loadStore()
  const user = store.users.find((entry) => entry.email === email)
  if (!user || user.guestDemo) {
    return {}
  }

  if (user.googleId && !user.passwordHash) {
    if (mode === 'resend') {
      await sendPasswordMail({
        to: email,
        subject: 'Tu cuenta de Stellar Pay entra con Google',
        text: [
          'Recibimos una solicitud para cambiar la contraseña de tu cuenta en Stellar Pay.',
          '',
          'Esa cuenta entra con Google, así que no hay una contraseña que restablecer.',
          'En el inicio de sesión usa el botón de Google.',
          '',
          'Si no pediste este cambio, puedes ignorar este correo.',
        ].join('\n'),
      })
    }
    return mode === 'preview'
      ? { devHint: 'Esta cuenta entra con Google. Usa el botón de Google para entrar.' }
      : {}
  }

  if (!user.passwordHash || !user.salt) {
    return {}
  }

  const requestedAt = Date.parse(user.passwordReset?.requestedAt ?? '')
  if (
    mode === 'resend' &&
    Number.isFinite(requestedAt) &&
    Date.now() - requestedAt < RESEND_COOLDOWN_MS
  ) {
    return {}
  }

  const token = randomBytes(32).toString('base64url')
  user.passwordReset = {
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    requestedAt: new Date().toISOString(),
  }
  await saveStore(store)

  const url = `${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`
  if (mode === 'preview') {
    console.info('[password-reset] enlace de prueba emitido, sin token en el log')
    return { devResetUrl: url }
  }

  try {
    await sendPasswordMail({
      to: email,
      subject: 'Restablece tu contraseña de Stellar Pay',
      text: [
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta en Stellar Pay.',
        '',
        'Abre este enlace para elegir una contraseña nueva. Vence en 30 minutos y solo se puede usar una vez:',
        url,
        '',
        'Si no pediste este cambio, puedes ignorar este correo. Tu contraseña sigue igual.',
      ].join('\n'),
    })
  } catch (error) {
    await clearResetToken(user.id)
    throw error
  }
  return {}
}

export async function completePasswordReset(tokenRaw: string, password: string): Promise<void> {
  const token = tokenRaw.trim()
  if (!token || token.length > 200) {
    throw new AuthError('El enlace no es válido o ya venció. Pide uno nuevo.', 400)
  }
  if (password.length > 128) {
    throw new AuthError('La contraseña es demasiado larga', 400)
  }

  const tokenHash = hashToken(token)
  const store = await loadStore()
  const user = store.users.find(
    (entry) => entry.passwordReset && hashesEqual(entry.passwordReset.tokenHash, tokenHash),
  )
  if (!user?.passwordReset) {
    throw new AuthError('El enlace no es válido o ya venció. Pide uno nuevo.', 400)
  }
  if (Date.parse(user.passwordReset.expiresAt) < Date.now()) {
    delete user.passwordReset
    await saveStore(store)
    throw new AuthError('El enlace no es válido o ya venció. Pide uno nuevo.', 400)
  }

  const sealed = sealPassword(password)
  user.salt = sealed.salt
  user.passwordHash = sealed.passwordHash
  user.sessionEpoch = (user.sessionEpoch ?? 0) + 1
  delete user.passwordReset
  await saveStore(store)
  if (await postgresReady()) {
    await revokeUserSessions(user.id)
  }
}

async function clearResetToken(userId: string): Promise<void> {
  const store = await loadStore()
  const user = store.users.find((entry) => entry.id === userId)
  if (!user?.passwordReset) {
    return
  }
  delete user.passwordReset
  await saveStore(store)
}

function mailMode(): 'resend' | 'preview' {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
  if (apiKey) {
    return 'resend'
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new AuthError(
      'El correo de recuperación no está configurado. Añade RESEND_API_KEY y un dominio verificado en Resend.',
      503,
    )
  }
  return 'preview'
}

async function sendPasswordMail(input: {
  to: string
  subject: string
  text: string
}): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
  const from = await senderAddress()
  if (!apiKey || !from) {
    throw new AuthError('El correo de recuperación no está configurado.', 503)
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    console.error('[password-reset] resend', response.status, detail.slice(0, 400))
    throw new AuthError(
      'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.',
      502,
    )
  }
}

let cachedSender: { at: number; from: string } | null = null

async function senderAddress(): Promise<string> {
  const configured = (process.env.EMAIL_FROM ?? '').trim()
  if (configured) {
    return configured
  }
  if (cachedSender && Date.now() - cachedSender.at < 10 * 60 * 1000) {
    return cachedSender.from
  }
  const domain = await verifiedSendingDomain()
  if (!domain) {
    throw new AuthError(
      'Falta un dominio verificado en Resend para enviar el correo de recuperación.',
      503,
    )
  }
  const from = `Stellar Pay <no-reply@${domain}>`
  cachedSender = { at: Date.now(), from }
  return from
}

async function verifiedSendingDomain(): Promise<string | null> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim()
  if (!apiKey) {
    return null
  }
  const response = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    console.error('[password-reset] domains', response.status)
    return null
  }
  const body = (await response.json()) as {
    data?: Array<{ name?: string; status?: string }>
  }
  const verified = (body.data ?? [])
    .map((row) => ({ name: (row.name ?? '').trim().toLowerCase(), status: row.status }))
    .filter((row) => row.status === 'verified' && row.name && !row.name.endsWith('.resend.app'))
  return verified[0]?.name ?? null
}

function appOrigin(): string {
  const configured = (process.env.APP_URL ?? '').trim().replace(/\/$/, '')
  if (configured) {
    return configured
  }
  const production = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim().replace(/\/$/, '')
  if (production && process.env.VERCEL_ENV === 'production') {
    return production.startsWith('http') ? production : `https://${production}`
  }
  const vercel = (process.env.VERCEL_URL ?? '').trim().replace(/\/$/, '')
  if (vercel) {
    return vercel.startsWith('http') ? vercel : `https://${vercel}`
  }
  return 'http://localhost:5173'
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function hashesEqual(stored: string, incoming: string): boolean {
  const left = Buffer.from(stored)
  const right = Buffer.from(incoming)
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
