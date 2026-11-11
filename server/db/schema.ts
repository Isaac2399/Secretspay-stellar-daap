export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL,
  password_hash text,
  salt text,
  google_id text,
  role text NOT NULL,
  public_key text NOT NULL,
  secret_key_enc text,
  created_at timestamptz NOT NULL,
  sinpe_code text,
  business jsonb,
  welcome_regalia_at timestamptz,
  session_epoch integer NOT NULL DEFAULT 0,
  guest_demo boolean NOT NULL DEFAULT false,
  guest_demo_claimed_at timestamptz,
  guest_demo_funded_at timestamptz,
  place jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS merchant_applications (
  id text PRIMARY KEY,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  decided_at timestamptz,
  reviewer_id text,
  rejection_note text,
  email text NOT NULL,
  password_hash text,
  salt text,
  business_name text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  tax_id text NOT NULL,
  category text NOT NULL,
  address text NOT NULL,
  description text NOT NULL,
  accepts_rojos boolean NOT NULL,
  user_id text
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  user_id text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  requested_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sinpe_transactions (
  id text PRIMARY KEY,
  reference_id text NOT NULL,
  reference_key text NOT NULL,
  crc_amount double precision NOT NULL,
  calculated_rojos double precision NOT NULL,
  promo_applied boolean NOT NULL,
  comment text NOT NULL,
  sender text NOT NULL,
  raw_message text NOT NULL,
  timestamp_ms bigint NOT NULL,
  status text NOT NULL,
  user_id text,
  public_key text,
  stellar_hash text,
  notification text,
  error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS sinpe_transactions_reference_unique
  ON sinpe_transactions (reference_key);

CREATE TABLE IF NOT EXISTS sinpe_deposits (
  id text PRIMARY KEY,
  reference_id text NOT NULL,
  reference_key text NOT NULL,
  crc_amount double precision NOT NULL,
  calculated_rojos double precision NOT NULL,
  promo_applied boolean NOT NULL,
  comment text NOT NULL,
  sender text NOT NULL,
  raw_message text NOT NULL,
  timestamp_ms bigint NOT NULL,
  status text NOT NULL,
  last_error text,
  assigned_user_id text,
  assigned_public_key text,
  stellar_hash text,
  resolved_by_admin_id text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS sinpe_deposits_reference_unique
  ON sinpe_deposits (reference_key);

CREATE TABLE IF NOT EXISTS sinpe_code_issues (
  id text PRIMARY KEY,
  code text NOT NULL,
  user_id text NOT NULL,
  public_key text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
`

export function schemaStatements(): string[] {
  return SCHEMA_SQL.split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map((statement) => `${statement};`)
}
