import { Pool, neonConfig } from '@neondatabase/serverless'
import { WebSocket } from 'ws'
import { schemaStatements } from './schema.js'
import type { Sql } from './sql.js'

neonConfig.webSocketConstructor = WebSocket

const IMPORTED_KEY = 'kv_imported_at'

let pool: Pool | undefined
let schemaReady: Promise<void> | undefined
let imported = false

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) {
    throw new Error('Falta DATABASE_URL')
  }
  if (!pool) {
    pool = new Pool({ connectionString, max: 1 })
  }
  return pool
}

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = applySchema().catch((error: unknown) => {
      schemaReady = undefined
      throw error
    })
  }
  await schemaReady
}

async function applySchema(): Promise<void> {
  const db = getPool()
  for (const statement of schemaStatements()) {
    await db.query(statement)
  }
}

export async function postgresReady(): Promise<boolean> {
  if (imported) {
    return true
  }
  if (!databaseConfigured()) {
    return false
  }
  await ensureSchema()
  const result = await getPool().query<{ value: string }>(
    'SELECT value FROM schema_meta WHERE key = $1',
    [IMPORTED_KEY],
  )
  imported = result.rows.length > 0
  if (imported) {
    console.info('[db] cuentas, sesiones y SINPE leen Postgres')
  }
  return imported
}

export async function withDb<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  await ensureSchema()
  const db = getPool()
    return fn({
      query: async <T>(text: string, params?: unknown[]) => {
        const result = await db.query(text, params)
        return { rows: result.rows as T[] }
      },
    })
}

export async function withDbTransaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  await ensureSchema()
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn({
      query: async <T>(text: string, params?: unknown[]) => {
        const queryResult = await client.query(text, params)
        return { rows: queryResult.rows as T[] }
      },
    })
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // The original error is the one the caller needs.
    }
    throw error
  } finally {
    client.release()
  }
}

export const KV_IMPORTED_KEY = IMPORTED_KEY
