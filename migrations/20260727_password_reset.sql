ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS chk_app_user_session_version;

ALTER TABLE app_user
  ADD CONSTRAINT chk_app_user_session_version
  CHECK (session_version >= 0);

CREATE TABLE IF NOT EXISTS password_reset_request (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier_hash   char(64) NOT NULL,
  ip_hash           char(64) NOT NULL,
  user_id           uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_password_reset_request_identifier_hash
    CHECK (identifier_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_password_reset_request_ip_hash
    CHECK (ip_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_password_reset_request_identifier
  ON password_reset_request(identifier_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_request_ip
  ON password_reset_request(ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_token (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash   char(64) NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_password_reset_token_hash
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_password_reset_token_expiry
    CHECK (expires_at > created_at),
  CONSTRAINT chk_password_reset_token_state
    CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_user
  ON password_reset_token(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_token_active
  ON password_reset_token(user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

COMMENT ON COLUMN app_user.session_version IS
  'Incremented to revoke all previously issued access and refresh tokens.';
