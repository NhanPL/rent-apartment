DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;

ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_actor_user_id_fkey;

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS actor_role varchar(20),
  ADD COLUMN IF NOT EXISTS manager_user_id uuid,
  ADD COLUMN IF NOT EXISTS request_id varchar(100),
  ADD COLUMN IF NOT EXISTS client_ip_hash char(64),
  ADD COLUMN IF NOT EXISTS user_agent varchar(300),
  ADD COLUMN IF NOT EXISTS before_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS after_snapshot jsonb;

UPDATE audit_log log
SET actor_role=COALESCE(app_user.role::text, 'SYSTEM')
FROM app_user
WHERE log.actor_user_id=app_user.id
  AND log.actor_role IS NULL;

UPDATE audit_log
SET actor_role='SYSTEM'
WHERE actor_role IS NULL;

UPDATE audit_log
SET entity_type=upper(entity_type), action=upper(action);

UPDATE audit_log log
SET manager_user_id=CASE
  WHEN log.actor_role='MANAGER' THEN log.actor_user_id
  ELSE tenant.manager_user_id
END
FROM tenant
WHERE log.manager_user_id IS NULL
  AND tenant.user_id=log.actor_user_id;

UPDATE audit_log
SET manager_user_id=actor_user_id
WHERE manager_user_id IS NULL AND actor_role='MANAGER';

ALTER TABLE audit_log
  ALTER COLUMN actor_role SET DEFAULT 'SYSTEM',
  ALTER COLUMN actor_role SET NOT NULL;

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS ck_audit_log_actor_role;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_actor_role
  CHECK (actor_role IN ('MANAGER','TENANT','SYSTEM','ANONYMOUS'));

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS ck_audit_log_snapshots;
ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_snapshots CHECK (
  (before_snapshot IS NULL OR jsonb_typeof(before_snapshot)='object')
  AND (after_snapshot IS NULL OR jsonb_typeof(after_snapshot)='object')
  AND jsonb_typeof(metadata)='object'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_manager_created
  ON audit_log(manager_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
  ON audit_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_request
  ON audit_log(request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION protect_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable'
    USING ERRCODE='55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION protect_audit_log();
