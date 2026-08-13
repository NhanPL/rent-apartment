CREATE TABLE IF NOT EXISTS manager_feature_flag (
  manager_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  feature_key varchar(50) NOT NULL,
  enabled boolean NOT NULL,
  updated_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(manager_user_id, feature_key),
  CONSTRAINT ck_manager_feature_flag_key CHECK (feature_key IN (
    'CSV_IMPORTS', 'BULK_BILLING_ACTIONS', 'LIVE_DASHBOARD', 'INVOICE_BRANDING'
  ))
);

DROP TRIGGER IF EXISTS trg_manager_feature_flag_updated_at ON manager_feature_flag;
CREATE TRIGGER trg_manager_feature_flag_updated_at
BEFORE UPDATE ON manager_feature_flag
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
