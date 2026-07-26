CREATE TABLE IF NOT EXISTS audit_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  action          varchar(80) NOT NULL,
  entity_type     varchar(50) NOT NULL,
  entity_id       uuid,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON audit_log(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS account_activation_token (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash           char(64) NOT NULL UNIQUE,
  expires_at           timestamptz NOT NULL,
  used_at              timestamptz,
  revoked_at           timestamptz,
  created_by_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_account_activation_token_hash
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_account_activation_token_expiry
    CHECK (expires_at > created_at),
  CONSTRAINT chk_account_activation_token_state
    CHECK (used_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_account_activation_token_user
  ON account_activation_token(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_activation_token_active
  ON account_activation_token(user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
