ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS account_status varchar(32);

UPDATE app_user
SET
  password_hash = CASE
    WHEN password_hash IS NULL OR btrim(password_hash) = '' THEN NULL
    ELSE password_hash
  END,
  account_status = CASE
    WHEN password_hash IS NULL OR btrim(password_hash) = '' THEN 'PENDING_ACTIVATION'
    WHEN is_active THEN 'ACTIVE'
    ELSE 'DISABLED'
  END,
  is_active = CASE
    WHEN password_hash IS NULL OR btrim(password_hash) = '' THEN false
    ELSE is_active
  END;

ALTER TABLE app_user
  ALTER COLUMN account_status SET DEFAULT 'ACTIVE',
  ALTER COLUMN account_status SET NOT NULL;

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS chk_app_user_account_status;

ALTER TABLE app_user
  ADD CONSTRAINT chk_app_user_account_status
  CHECK (account_status IN ('PENDING_ACTIVATION', 'ACTIVE', 'DISABLED'));

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS chk_app_user_authentication_state;

ALTER TABLE app_user
  ADD CONSTRAINT chk_app_user_authentication_state
  CHECK (
    (account_status = 'ACTIVE' AND is_active AND password_hash IS NOT NULL AND btrim(password_hash) <> '')
    OR (account_status = 'PENDING_ACTIVATION' AND NOT is_active)
    OR (account_status = 'DISABLED' AND NOT is_active)
  );

CREATE OR REPLACE FUNCTION enforce_app_user_authentication_state()
RETURNS trigger AS $$
BEGIN
  IF NEW.password_hash IS NULL OR btrim(NEW.password_hash) = '' THEN
    NEW.password_hash := NULL;
    NEW.account_status := 'PENDING_ACTIVATION';
    NEW.is_active := false;
  ELSIF NEW.account_status = 'PENDING_ACTIVATION' THEN
    NEW.is_active := false;
  ELSIF NEW.account_status = 'DISABLED' OR NOT NEW.is_active THEN
    NEW.account_status := 'DISABLED';
    NEW.is_active := false;
  ELSE
    NEW.account_status := 'ACTIVE';
    NEW.is_active := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_user_authentication_state ON app_user;
CREATE TRIGGER trg_app_user_authentication_state
BEFORE INSERT OR UPDATE OF password_hash, is_active, account_status ON app_user
FOR EACH ROW EXECUTE FUNCTION enforce_app_user_authentication_state();

COMMENT ON COLUMN app_user.account_status IS
  'Authentication lifecycle status: PENDING_ACTIVATION, ACTIVE, or DISABLED.';
