import type {
  SinpeCodeIssue,
  SinpeStoreData,
  SinpeTransaction,
  UnassignedDeposit,
} from '../sinpe/types.js'
import { asIso, asNumber, type Sql } from './sql.js'

type TransactionRow = {
  id: string
  reference_id: string
  crc_amount: unknown
  calculated_rojos: unknown
  promo_applied: boolean
  comment: string
  sender: string
  raw_message: string
  timestamp_ms: unknown
  status: SinpeTransaction['status']
  user_id: string | null
  public_key: string | null
  stellar_hash: string | null
  notification: string | null
  error: string | null
  created_at: unknown
  updated_at: unknown
}

type DepositRow = Omit<TransactionRow, 'status'> & {
  last_error: string | null
  assigned_user_id: string | null
  assigned_public_key: string | null
  resolved_by_admin_id: string | null
  resolved_at: unknown
  status: UnassignedDeposit['status']
}

type CodeRow = {
  id: string
  code: string
  user_id: string
  public_key: string
  issued_at: unknown
  expires_at: unknown
}

const UPSERT_TRANSACTION = `
INSERT INTO sinpe_transactions (
  id, reference_id, reference_key, crc_amount, calculated_rojos, promo_applied,
  comment, sender, raw_message, timestamp_ms, status, user_id, public_key,
  stellar_hash, notification, error, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12, $13,
  $14, $15, $16, $17, $18
)
ON CONFLICT (reference_key) DO UPDATE SET
  reference_id = EXCLUDED.reference_id,
  crc_amount = EXCLUDED.crc_amount,
  calculated_rojos = EXCLUDED.calculated_rojos,
  promo_applied = EXCLUDED.promo_applied,
  comment = EXCLUDED.comment,
  sender = EXCLUDED.sender,
  raw_message = EXCLUDED.raw_message,
  timestamp_ms = EXCLUDED.timestamp_ms,
  status = EXCLUDED.status,
  user_id = EXCLUDED.user_id,
  public_key = EXCLUDED.public_key,
  stellar_hash = EXCLUDED.stellar_hash,
  notification = EXCLUDED.notification,
  error = EXCLUDED.error,
  updated_at = EXCLUDED.updated_at
RETURNING id, reference_id, crc_amount, calculated_rojos, promo_applied, comment,
  sender, raw_message, timestamp_ms, status, user_id, public_key, stellar_hash,
  notification, error, created_at, updated_at
`

const INSERT_TRANSACTION = `
INSERT INTO sinpe_transactions (
  id, reference_id, reference_key, crc_amount, calculated_rojos, promo_applied,
  comment, sender, raw_message, timestamp_ms, status, user_id, public_key,
  stellar_hash, notification, error, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12, $13,
  $14, $15, $16, $17, $18
)
`

const UPSERT_DEPOSIT = `
INSERT INTO sinpe_deposits (
  id, reference_id, reference_key, crc_amount, calculated_rojos, promo_applied,
  comment, sender, raw_message, timestamp_ms, status, last_error, assigned_user_id,
  assigned_public_key, stellar_hash, resolved_by_admin_id, resolved_at, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12, $13,
  $14, $15, $16, $17, $18, $19
)
ON CONFLICT (reference_key) DO UPDATE SET
  reference_id = EXCLUDED.reference_id,
  crc_amount = EXCLUDED.crc_amount,
  calculated_rojos = EXCLUDED.calculated_rojos,
  promo_applied = EXCLUDED.promo_applied,
  comment = EXCLUDED.comment,
  sender = EXCLUDED.sender,
  raw_message = EXCLUDED.raw_message,
  timestamp_ms = EXCLUDED.timestamp_ms,
  status = EXCLUDED.status,
  last_error = EXCLUDED.last_error,
  assigned_user_id = EXCLUDED.assigned_user_id,
  assigned_public_key = EXCLUDED.assigned_public_key,
  stellar_hash = EXCLUDED.stellar_hash,
  resolved_by_admin_id = EXCLUDED.resolved_by_admin_id,
  resolved_at = EXCLUDED.resolved_at,
  updated_at = EXCLUDED.updated_at
RETURNING id, reference_id, crc_amount, calculated_rojos, promo_applied, comment,
  sender, raw_message, timestamp_ms, status, last_error, assigned_user_id,
  assigned_public_key, stellar_hash, resolved_by_admin_id, resolved_at, created_at, updated_at
`

const INSERT_DEPOSIT = `
INSERT INTO sinpe_deposits (
  id, reference_id, reference_key, crc_amount, calculated_rojos, promo_applied,
  comment, sender, raw_message, timestamp_ms, status, last_error, assigned_user_id,
  assigned_public_key, stellar_hash, resolved_by_admin_id, resolved_at, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7, $8, $9, $10, $11, $12, $13,
  $14, $15, $16, $17, $18, $19
)
`

export function referenceKey(referenceId: string): string {
  return referenceId.trim()
}

export async function loadSinpeSnapshot(sql: Sql): Promise<SinpeStoreData> {
  const transactions = await sql.query<TransactionRow>(
    'SELECT * FROM sinpe_transactions ORDER BY created_at DESC',
  )
  const deposits = await sql.query<DepositRow>(
    'SELECT * FROM sinpe_deposits ORDER BY created_at DESC',
  )
  const codes = await sql.query<CodeRow>(
    'SELECT * FROM sinpe_code_issues ORDER BY issued_at DESC',
  )
  return {
    sinpeTransactions: transactions.rows.map(toTransaction),
    unassignedDeposits: deposits.rows.map(toDeposit),
    codeIssues: codes.rows.map(toCode),
  }
}

export async function upsertSinpeTransactionRow(
  sql: Sql,
  record: SinpeTransaction,
): Promise<SinpeTransaction> {
  const result = await sql.query<TransactionRow>(UPSERT_TRANSACTION, transactionParams(record))
  const row = result.rows[0]
  if (!row) {
    throw new Error('La recarga SINPE no quedó escrita')
  }
  return toTransaction(row)
}

export async function insertSinpeTransactionRow(
  sql: Sql,
  record: SinpeTransaction,
): Promise<void> {
  await sql.query(INSERT_TRANSACTION, transactionParams(record))
}

export async function upsertUnassignedDepositRow(
  sql: Sql,
  record: UnassignedDeposit,
): Promise<UnassignedDeposit> {
  const result = await sql.query<DepositRow>(UPSERT_DEPOSIT, depositParams(record))
  const row = result.rows[0]
  if (!row) {
    throw new Error('El depósito SINPE no quedó escrito')
  }
  return toDeposit(row)
}

export async function insertUnassignedDepositRow(
  sql: Sql,
  record: UnassignedDeposit,
): Promise<void> {
  await sql.query(INSERT_DEPOSIT, depositParams(record))
}

export async function insertCodeIssueRow(sql: Sql, issue: SinpeCodeIssue): Promise<void> {
  await sql.query(
    `INSERT INTO sinpe_code_issues (id, code, user_id, public_key, issued_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [issue.id, issue.code, issue.userId, issue.publicKey, issue.issuedAt, issue.expiresAt],
  )
}

export async function issueCodeRow(
  sql: Sql,
  issue: SinpeCodeIssue,
  cutoffIso: string,
): Promise<void> {
  await sql.query(
    `UPDATE sinpe_code_issues
     SET expires_at = $2
     WHERE user_id = $1 AND expires_at > $2`,
    [issue.userId, issue.issuedAt],
  )
  await insertCodeIssueRow(sql, issue)
  await sql.query('DELETE FROM sinpe_code_issues WHERE issued_at < $1', [cutoffIso])
}

function transactionParams(record: SinpeTransaction): unknown[] {
  return [
    record.id,
    record.referenceId,
    referenceKey(record.referenceId),
    record.crcAmount,
    record.calculatedRojos,
    record.promoApplied,
    record.comment,
    record.sender,
    record.rawMessage,
    record.timestamp,
    record.status,
    record.userId ?? null,
    record.publicKey ?? null,
    record.stellarHash ?? null,
    record.notification ?? null,
    record.error ?? null,
    record.createdAt,
    record.updatedAt,
  ]
}

function depositParams(record: UnassignedDeposit): unknown[] {
  return [
    record.id,
    record.referenceId,
    referenceKey(record.referenceId),
    record.crcAmount,
    record.calculatedRojos,
    record.promoApplied,
    record.comment,
    record.sender,
    record.rawMessage,
    record.timestamp,
    record.status,
    record.lastError ?? null,
    record.assignedUserId ?? null,
    record.assignedPublicKey ?? null,
    record.stellarHash ?? null,
    record.resolvedByAdminId ?? null,
    record.resolvedAt ?? null,
    record.createdAt,
    record.updatedAt,
  ]
}

function toTransaction(row: TransactionRow): SinpeTransaction {
  const createdAt = asIso(row.created_at)
  const updatedAt = asIso(row.updated_at)
  if (!createdAt || !updatedAt) {
    throw new Error(`Transacción SINPE ${row.id} sin fechas`)
  }
  const record: SinpeTransaction = {
    id: row.id,
    referenceId: row.reference_id,
    crcAmount: asNumber(row.crc_amount),
    calculatedRojos: asNumber(row.calculated_rojos),
    promoApplied: row.promo_applied,
    comment: row.comment,
    sender: row.sender,
    rawMessage: row.raw_message,
    timestamp: asNumber(row.timestamp_ms),
    status: row.status,
    createdAt,
    updatedAt,
  }
  if (row.user_id) record.userId = row.user_id
  if (row.public_key) record.publicKey = row.public_key
  if (row.stellar_hash) record.stellarHash = row.stellar_hash
  if (row.notification) record.notification = row.notification
  if (row.error) record.error = row.error
  return record
}

function toDeposit(row: DepositRow): UnassignedDeposit {
  const createdAt = asIso(row.created_at)
  const updatedAt = asIso(row.updated_at)
  if (!createdAt || !updatedAt) {
    throw new Error(`Depósito SINPE ${row.id} sin fechas`)
  }
  const record: UnassignedDeposit = {
    id: row.id,
    referenceId: row.reference_id,
    crcAmount: asNumber(row.crc_amount),
    calculatedRojos: asNumber(row.calculated_rojos),
    promoApplied: row.promo_applied,
    comment: row.comment,
    sender: row.sender,
    rawMessage: row.raw_message,
    timestamp: asNumber(row.timestamp_ms),
    status: row.status,
    createdAt,
    updatedAt,
  }
  if (row.last_error) record.lastError = row.last_error
  if (row.assigned_user_id) record.assignedUserId = row.assigned_user_id
  if (row.assigned_public_key) record.assignedPublicKey = row.assigned_public_key
  if (row.stellar_hash) record.stellarHash = row.stellar_hash
  if (row.resolved_by_admin_id) record.resolvedByAdminId = row.resolved_by_admin_id
  const resolvedAt = asIso(row.resolved_at)
  if (resolvedAt) record.resolvedAt = resolvedAt
  return record
}

function toCode(row: CodeRow): SinpeCodeIssue {
  const issuedAt = asIso(row.issued_at)
  const expiresAt = asIso(row.expires_at)
  if (!issuedAt || !expiresAt) {
    throw new Error(`Código SINPE ${row.id} sin fechas`)
  }
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    publicKey: row.public_key,
    issuedAt,
    expiresAt,
  }
}
