ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS two_factor_pending_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS two_factor_enabled_at timestamptz;

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS chk_app_user_manager_two_factor;

ALTER TABLE app_user
  ADD CONSTRAINT chk_app_user_manager_two_factor CHECK (
    two_factor_enabled = false
    OR (
      role = 'MANAGER'
      AND two_factor_secret_encrypted IS NOT NULL
      AND two_factor_enabled_at IS NOT NULL
    )
  );

COMMENT ON COLUMN app_user.two_factor_secret_encrypted IS
  'AES-GCM encrypted TOTP secret. Never return this value from profile APIs.';

COMMENT ON COLUMN app_user.two_factor_pending_secret_encrypted IS
  'Temporary encrypted TOTP secret awaiting verification during setup.';
