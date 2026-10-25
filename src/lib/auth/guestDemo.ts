/** Client flag for a judge session. The cookie is the real session; this only drives the banner. */
const STORAGE_KEY = 'stellar-pay:guest-demo'

export type GuestDemoRecord = {
  isGuestDemo: true
  publicKey: string
  startedAt: string
}

export function readGuestDemo(): GuestDemoRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (!isGuestDemoRecord(parsed)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeGuestDemo(publicKey: string): void {
  const record: GuestDemoRecord = {
    isGuestDemo: true,
    publicKey,
    startedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // private mode
  }
}

export function clearGuestDemo(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // private mode
  }
}

export function syncGuestFlag(
  user: { isGuestDemo?: boolean; publicKey: string } | null,
): boolean {
  if (!user) {
    clearGuestDemo()
    return false
  }
  if (user.isGuestDemo) {
    writeGuestDemo(user.publicKey)
    return true
  }
  const stored = readGuestDemo()
  if (stored?.isGuestDemo && stored.publicKey === user.publicKey) {
    return true
  }
  clearGuestDemo()
  return false
}

function isGuestDemoRecord(value: unknown): value is GuestDemoRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<GuestDemoRecord>
  return record.isGuestDemo === true && typeof record.publicKey === 'string'
}
