CREATE TABLE IF NOT EXISTS auth_session (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  session_version   integer NOT NULL,
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  revocation_reason varchar(40),
  ip_hash           char(64),
  user_agent        text,
  last_used_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_auth_session_version CHECK (session_version >= 0),
  CONSTRAINT chk_auth_session_expiry CHECK (expires_at > created_at),
  CONSTRAINT chk_auth_session_ip_hash CHECK (
    ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_auth_session_user
  ON auth_session(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_session_cleanup
  ON auth_session(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS auth_refresh_token (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id             uuid NOT NULL REFERENCES auth_session(id) ON DELETE CASCADE,
  token_hash             char(64) NOT NULL UNIQUE,
  expires_at             timestamptz NOT NULL,
  revoked_at             timestamptz,
  revocation_reason      varchar(40),
  replaced_by_token_id   uuid REFERENCES auth_refresh_token(id) ON DELETE SET NULL,
  last_used_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_auth_refresh_token_hash
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_auth_refresh_token_expiry
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_token_session
  ON auth_refresh_token(session_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_refresh_token_active
  ON auth_refresh_token(session_id)
  WHERE revoked_at IS NULL;

UPDATE app_user
SET session_version = session_version + 1;

COMMENT ON TABLE auth_session IS
  'One revocable authentication session per browser or device.';

COMMENT ON TABLE auth_refresh_token IS
  'Hashed refresh-token rotation history used to detect token reuse.';
