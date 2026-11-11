import type { MerchantApplication, UserStore } from '../userStore.js'
import type { BusinessProfile, StoredUser } from '../auth.js'
import { asIso, asJson, jsonParam, type Sql } from './sql.js'

type UserRow = {
  id: string
  email: string
  password_hash: string | null
  salt: string | null
  google_id: string | null
  role: StoredUser['role']
  public_key: string
  secret_key_enc: string | null
  created_at: string | Date
  sinpe_code: string | null
  business: unknown
  welcome_regalia_at: string | Date | null
  session_epoch: number
  guest_demo: boolean
  guest_demo_claimed_at: string | Date | null
  guest_demo_funded_at: string | Date | null
  place: unknown
}

type ResetRow = {
  user_id: string
  token_hash: string
  expires_at: string | Date
  requested_at: string | Date
}

type ApplicationRow = {
  id: string
  status: MerchantApplication['status']
  created_at: string | Date
  decided_at: string | Date | null
  reviewer_id: string | null
  rejection_note: string | null
  email: string
  password_hash: string | null
  salt: string | null
  business_name: string
  contact_name: string
  phone: string
  tax_id: string
  category: string
  address: string
  description: string
  accepts_rojos: boolean
  user_id: string | null
}

const UPSERT_USER = `
INSERT INTO users (
  id, email, password_hash, salt, google_id, role, public_key, secret_key_enc,
  created_at, sinpe_code, business, welcome_regalia_at, session_epoch,
  guest_demo, guest_demo_claimed_at, guest_demo_funded_at, place
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8,
  $9, $10, $11::jsonb, $12, $13,
  $14, $15, $16, $17::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  salt = EXCLUDED.salt,
  google_id = EXCLUDED.google_id,
  role = EXCLUDED.role,
  public_key = EXCLUDED.public_key,
  secret_key_enc = EXCLUDED.secret_key_enc,
  created_at = EXCLUDED.created_at,
  sinpe_code = EXCLUDED.sinpe_code,
  business = EXCLUDED.business,
  welcome_regalia_at = EXCLUDED.welcome_regalia_at,
  session_epoch = EXCLUDED.session_epoch,
  guest_demo = EXCLUDED.guest_demo,
  guest_demo_claimed_at = EXCLUDED.guest_demo_claimed_at,
  guest_demo_funded_at = EXCLUDED.guest_demo_funded_at,
  place = EXCLUDED.place
`

const INSERT_USER = `
INSERT INTO users (
  id, email, password_hash, salt, google_id, role, public_key, secret_key_enc,
  created_at, sinpe_code, business, welcome_regalia_at, session_epoch,
  guest_demo, guest_demo_claimed_at, guest_demo_funded_at, place
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8,
  $9, $10, $11::jsonb, $12, $13,
  $14, $15, $16, $17::jsonb
)
`

export async function loadUserSnapshot(sql: Sql): Promise<UserStore> {
  const users = await sql.query<UserRow>('SELECT * FROM users')
  const resets = await sql.query<ResetRow>('SELECT * FROM password_resets')
  const applications = await sql.query<ApplicationRow>(
    'SELECT * FROM merchant_applications ORDER BY created_at ASC',
  )
  const resetByUser = new Map(resets.rows.map((row) => [row.user_id, row]))
  return {
    users: users.rows.map((row) => toUser(row, resetByUser.get(row.id))),
    merchantApplications: applications.rows.map(toApplication),
  }
}

export async function saveUserSnapshot(sql: Sql, store: UserStore): Promise<void> {
  for (const user of store.users) {
    await sql.query(UPSERT_USER, userParams(user))
  }
  for (const user of store.users) {
    if (user.passwordReset) {
      await sql.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at, requested_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET
           token_hash = EXCLUDED.token_hash,
           expires_at = EXCLUDED.expires_at,
           requested_at = EXCLUDED.requested_at`,
        [
          user.id,
          user.passwordReset.tokenHash,
          user.passwordReset.expiresAt,
          user.passwordReset.requestedAt,
        ],
      )
    } else {
      await sql.query('DELETE FROM password_resets WHERE user_id = $1', [user.id])
    }
  }
  for (const application of store.merchantApplications ?? []) {
    await upsertApplication(sql, application)
  }
}

export async function insertUserRow(sql: Sql, user: StoredUser): Promise<void> {
  await sql.query(INSERT_USER, userParams(user))
}

function userParams(user: StoredUser): unknown[] {
  return [
    user.id,
    user.email,
    user.passwordHash ?? null,
    user.salt ?? null,
    user.googleId ?? null,
    user.role,
    user.publicKey,
    user.secretKeyEnc ?? null,
    user.createdAt,
    user.sinpeCode ?? null,
    jsonParam(user.business),
    user.welcomeRegaliaAt ?? null,
    user.sessionEpoch ?? 0,
    Boolean(user.guestDemo),
    user.guestDemoClaimedAt ?? null,
    user.guestDemoFundedAt ?? null,
    jsonParam(user.place),
  ]
}

function toUser(row: UserRow, reset: ResetRow | undefined): StoredUser {
  const createdAt = asIso(row.created_at)
  if (!createdAt) {
    throw new Error(`Usuario ${row.id} sin fecha de alta`)
  }
  const user: StoredUser = {
    id: row.id,
    email: row.email,
    role: row.role,
    publicKey: row.public_key,
    createdAt,
  }
  if (row.password_hash) user.passwordHash = row.password_hash
  if (row.salt) user.salt = row.salt
  if (row.google_id) user.googleId = row.google_id
  if (row.secret_key_enc) user.secretKeyEnc = row.secret_key_enc
  if (row.sinpe_code) user.sinpeCode = row.sinpe_code
  const business = asJson<BusinessProfile>(row.business)
  if (business) user.business = business
  const welcome = asIso(row.welcome_regalia_at)
  if (welcome) user.welcomeRegaliaAt = welcome
  if (row.session_epoch > 0) user.sessionEpoch = row.session_epoch
  if (row.guest_demo) user.guestDemo = true
  const claimed = asIso(row.guest_demo_claimed_at)
  if (claimed) user.guestDemoClaimedAt = claimed
  const funded = asIso(row.guest_demo_funded_at)
  if (funded) user.guestDemoFundedAt = funded
  const place = asJson<StoredUser['place']>(row.place)
  if (place) user.place = place
  if (reset) {
    const expiresAt = asIso(reset.expires_at)
    const requestedAt = asIso(reset.requested_at)
    if (expiresAt && requestedAt) {
      user.passwordReset = {
        tokenHash: reset.token_hash,
        expiresAt,
        requestedAt,
      }
    }
  }
  return user
}

async function upsertApplication(sql: Sql, application: MerchantApplication): Promise<void> {
  await sql.query(
    `INSERT INTO merchant_applications (
       id, status, created_at, decided_at, reviewer_id, rejection_note, email,
       password_hash, salt, business_name, contact_name, phone, tax_id, category,
       address, description, accepts_rojos, user_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18
     )
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       created_at = EXCLUDED.created_at,
       decided_at = EXCLUDED.decided_at,
       reviewer_id = EXCLUDED.reviewer_id,
       rejection_note = EXCLUDED.rejection_note,
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       salt = EXCLUDED.salt,
       business_name = EXCLUDED.business_name,
       contact_name = EXCLUDED.contact_name,
       phone = EXCLUDED.phone,
       tax_id = EXCLUDED.tax_id,
       category = EXCLUDED.category,
       address = EXCLUDED.address,
       description = EXCLUDED.description,
       accepts_rojos = EXCLUDED.accepts_rojos,
       user_id = EXCLUDED.user_id`,
    [
      application.id,
      application.status,
      application.createdAt,
      application.decidedAt ?? null,
      application.reviewerId ?? null,
      application.rejectionNote ?? null,
      application.email,
      application.passwordHash ?? null,
      application.salt ?? null,
      application.businessName,
      application.contactName,
      application.phone,
      application.taxId,
      application.category,
      application.address,
      application.description,
      application.acceptsRojos,
      application.userId ?? null,
    ],
  )
}

function toApplication(row: ApplicationRow): MerchantApplication {
  const createdAt = asIso(row.created_at)
  if (!createdAt) {
    throw new Error(`Solicitud ${row.id} sin fecha`)
  }
  const application: MerchantApplication = {
    id: row.id,
    status: row.status,
    createdAt,
    email: row.email,
    businessName: row.business_name,
    contactName: row.contact_name,
    phone: row.phone,
    taxId: row.tax_id,
    category: row.category,
    address: row.address,
    description: row.description,
    acceptsRojos: row.accepts_rojos,
  }
  const decidedAt = asIso(row.decided_at)
  if (decidedAt) application.decidedAt = decidedAt
  if (row.reviewer_id) application.reviewerId = row.reviewer_id
  if (row.rejection_note) application.rejectionNote = row.rejection_note
  if (row.password_hash) application.passwordHash = row.password_hash
  if (row.salt) application.salt = row.salt
  if (row.user_id) application.userId = row.user_id
  return application
}
