import { withDbTransaction } from './client.js'

export async function insertSession(input: {
  id: string
  userId: string
  expiresAt: string
}): Promise<void> {
  await withDbTransaction(async (sql) => {
    await sql.query(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [input.id, input.userId, input.expiresAt],
    )
  })
}

export async function findLiveSession(
  id: string,
): Promise<{ userId: string } | undefined> {
  return withDbTransaction(async (sql) => {
    const result = await sql.query<{ user_id: string; expires_at: unknown }>(
      'SELECT user_id, expires_at FROM sessions WHERE id = $1',
      [id],
    )
    const row = result.rows[0]
    if (!row) {
      return undefined
    }
    const expiresAt = new Date(String(row.expires_at)).getTime()
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await sql.query('DELETE FROM sessions WHERE id = $1', [id])
      return undefined
    }
    return { userId: row.user_id }
  })
}

export async function revokeUserSessions(userId: string): Promise<void> {
  await withDbTransaction(async (sql) => {
    await sql.query('DELETE FROM sessions WHERE user_id = $1', [userId])
  })
}
