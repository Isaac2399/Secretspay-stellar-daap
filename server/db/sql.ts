export type Sql = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = 'code' in error ? String(error.code) : ''
  if (code !== '23505') {
    return false
  }
  if (!constraint) {
    return true
  }
  const named = 'constraint' in error ? String(error.constraint) : ''
  const message = error instanceof Error ? error.message : ''
  return named === constraint || message.includes(constraint)
}

export function asIso(value: unknown): string | undefined {
  if (value == null || value === '') {
    return undefined
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) {
    return undefined
  }
  return parsed.toISOString()
}

export function asNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  return Number(value)
}

export function asJson<T>(value: unknown): T | undefined {
  if (value == null) {
    return undefined
  }
  if (typeof value === 'string') {
    return JSON.parse(value) as T
  }
  return value as T
}

export function jsonParam(value: unknown): string | null {
  if (value == null) {
    return null
  }
  return JSON.stringify(value)
}
