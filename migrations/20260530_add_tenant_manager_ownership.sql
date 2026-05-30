-- Add explicit manager ownership for tenant records and backfill existing data.

ALTER TABLE tenant
  ADD COLUMN IF NOT EXISTS manager_user_id uuid;

DO $$ BEGIN
  ALTER TABLE tenant
    ADD CONSTRAINT fk_tenant_manager_user
    FOREIGN KEY (manager_user_id) REFERENCES app_user(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tenant_manager ON tenant(manager_user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_manager_status ON tenant(manager_user_id, status);

UPDATE tenant t
SET manager_user_id = owner.manager_user_id
FROM (
  SELECT DISTINCT ON (ct.tenant_id)
    ct.tenant_id,
    b.manager_user_id
  FROM contract_tenant ct
  JOIN contract c ON c.id = ct.contract_id
  JOIN room r ON r.id = c.room_id
  JOIN building b ON b.id = r.building_id
  ORDER BY
    ct.tenant_id,
    CASE WHEN ct.left_at IS NULL AND c.status = 'ACTIVE' THEN 0 ELSE 1 END,
    c.start_date DESC,
    c.created_at DESC
) owner
WHERE t.id = owner.tenant_id
  AND t.manager_user_id IS NULL;

UPDATE tenant t
SET manager_user_id = only_manager.id
FROM (
  SELECT MIN(id) AS id
  FROM app_user
  WHERE role = 'MANAGER'
  HAVING COUNT(*) = 1
) only_manager
WHERE t.manager_user_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenant WHERE manager_user_id IS NULL) THEN
    ALTER TABLE tenant ALTER COLUMN manager_user_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'tenant.manager_user_id remains nullable because some legacy tenants could not be backfilled';
  END IF;
END $$;
