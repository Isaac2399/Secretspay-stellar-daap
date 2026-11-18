import { databaseConfigured, withDb } from './db/client.js'
import { AuthError } from './errors.js'

export const LOGIN_MAX_FAILURES = 5
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_LOCK_MS = 15 * 60 * 1000

export type LimitRow = {
  failures: number
  windowStartedAt: number
  lockedUntil: number | null
}

const memory = new Map<string, LimitRow>()

export function nextLimitState(
  current: LimitRow | undefined,
  now: number,
): { row: LimitRow; locked: boolean } {
  if (!current || now - current.windowStartedAt >= LOGIN_WINDOW_MS) {
    return {
      row: { failures: 1, windowStartedAt: now, lockedUntil: null },
      locked: false,
    }
  }
  if (current.lockedUntil != null && current.lockedUntil > now) {
    return { row: current, locked: true }
  }
  const failures = current.failures + 1
  const locked = failures >= LOGIN_MAX_FAILURES
  return {
    row: {
      failures,
      windowStartedAt: current.windowStartedAt,
      lockedUntil: locked ? now + LOGIN_LOCK_MS : null,
    },
    locked,
  }
}

export function lockActive(row: LimitRow | undefined, now: number): boolean {
  return row?.lockedUntil != null && row.lockedUntil > now
}

/**
 * El super admin no se bloquea.
 * En esta máquina (Vite, aunque .env.local tenga VERCEL=1) tampoco.
 */
export function loginLockEnforced(email: string): boolean {
  if (exemptFromLoginLock(email)) {
    return false
  }
  return process.env.VERCEL === '1' && process.env.NODE_ENV === 'production'
}

export function exemptFromLoginLock(email: string): boolean {
  return email.trim().toLowerCase() === ownerEmail()
}

export async function assertLoginAllowed(email: string, _ip?: string): Promise<void> {
  if (!loginLockEnforced(email)) {
    return
  }
  const now = Date.now()
  const row = await readLimit(subjectFor(email))
  if (lockActive(row, now)) {
    throw new AuthError(
      'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.',
      429,
      'login_locked',
    )
  }
}

export async function recordLoginFailure(email: string, _ip?: string): Promise<void> {
  if (!loginLockEnforced(email)) {
    return
  }
  const now = Date.now()
  const subject = subjectFor(email)
  const next = nextLimitState(await readLimit(subject), now)
  await writeLimit(subject, next.row)
}

export async function clearLoginFailures(email: string, _ip?: string): Promise<void> {
  await deleteLimit(subjectFor(email))
}

function ownerEmail(): string {
  const fromEnv = (process.env.SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase()
  return fromEnv || 'admin@stellarpay.local'
}

function subjectFor(email: string): string {
  return `email:${email.trim().toLowerCase()}`
}

async function readLimit(subject: string): Promise<LimitRow | undefined> {
  if (!databaseConfigured()) {
    return memory.get(subject)
  }
  const result = await withDb((sql) =>
    sql.query<{
      failures: number
      window_started_at: string | Date
      locked_until: string | Date | null
    }>(
      `SELECT failures, window_started_at, locked_until
       FROM login_limits WHERE subject = $1`,
      [subject],
    ),
  )
  const row = result.rows[0]
  if (!row) {
    return undefined
  }
  return {
    failures: Number(row.failures),
    windowStartedAt: new Date(row.window_started_at).getTime(),
    lockedUntil: row.locked_until ? new Date(row.locked_until).getTime() : null,
  }
}

async function writeLimit(subject: string, row: LimitRow): Promise<void> {
  if (!databaseConfigured()) {
    memory.set(subject, row)
    return
  }
  await withDb((sql) =>
    sql.query(
      `INSERT INTO login_limits (subject, failures, window_started_at, locked_until)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (subject) DO UPDATE
         SET failures = EXCLUDED.failures,
             window_started_at = EXCLUDED.window_started_at,
             locked_until = EXCLUDED.locked_until`,
      [
        subject,
        row.failures,
        new Date(row.windowStartedAt).toISOString(),
        row.lockedUntil ? new Date(row.lockedUntil).toISOString() : null,
      ],
    ),
  )
}

async function deleteLimit(subject: string): Promise<void> {
  if (!databaseConfigured()) {
    memory.delete(subject)
    return
  }
  await withDb((sql) => sql.query('DELETE FROM login_limits WHERE subject = $1', [subject]))
}
