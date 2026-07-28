CREATE TABLE IF NOT EXISTS auth_login_throttle (
  scope               varchar(16) NOT NULL,
  key_hash            char(64) NOT NULL,
  failed_count        integer NOT NULL DEFAULT 0,
  window_started_at   timestamptz NOT NULL DEFAULT now(),
  last_failed_at      timestamptz NOT NULL DEFAULT now(),
  locked_until        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY(scope, key_hash),
  CONSTRAINT chk_auth_login_throttle_scope
    CHECK (scope IN ('IDENTIFIER', 'IP')),
  CONSTRAINT chk_auth_login_throttle_key_hash
    CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_auth_login_throttle_failed_count
    CHECK (failed_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_auth_login_throttle_cleanup
  ON auth_login_throttle(updated_at, locked_until);

COMMENT ON TABLE auth_login_throttle IS
  'Hashed, temporary login-failure counters shared by all API instances.';
