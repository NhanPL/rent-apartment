ALTER TABLE tenant
  ADD COLUMN IF NOT EXISTS privacy_erasure_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_erasure_eligible_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tenant_privacy_consent (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
  policy_version      varchar(40) NOT NULL,
  purpose             varchar(60) NOT NULL DEFAULT 'TENANCY_MANAGEMENT',
  granted             boolean NOT NULL,
  recorded_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  recorded_at         timestamptz NOT NULL DEFAULT now(),
  withdrawn_at        timestamptz,

  CONSTRAINT ck_tenant_privacy_consent_version
    CHECK (NULLIF(btrim(policy_version), '') IS NOT NULL),
  CONSTRAINT ck_tenant_privacy_consent_withdrawn
    CHECK (withdrawn_at IS NULL OR withdrawn_at >= recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_tenant_privacy_consent_history
ON tenant_privacy_consent(tenant_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_privacy_erasure_due
ON tenant(privacy_erasure_eligible_at)
WHERE privacy_erasure_requested_at IS NOT NULL AND anonymized_at IS NULL;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_document',
    'payment_proof',
    'utility_reading_evidence',
    'contract_document'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS asset_purged_at timestamptz',
      table_name
    );
  END LOOP;
END $$;

-- Identity images remain available while the profile is active. Their retention
-- clock starts only when an erasure workflow closes the tenant relationship.
UPDATE tenant_document td
SET retention_until=NULL
FROM tenant t
WHERE t.id=td.tenant_id
  AND t.status <> 'DELETED';

-- Payment evidence and contract documents are accounting/legal records. Keep the
-- asset for ten years; the database metadata remains after the asset is purged.
UPDATE payment_proof
SET retention_until=GREATEST(
  COALESCE(retention_until, '-infinity'::timestamptz),
  created_at + interval '10 years'
);

UPDATE contract_document cd
SET retention_until=GREATEST(
  COALESCE(cd.retention_until, '-infinity'::timestamptz),
  COALESCE(c.end_date::timestamptz, c.updated_at, c.created_at) + interval '10 years'
)
FROM contract c
WHERE c.id=cd.contract_id;

ALTER TABLE payment_proof
  DROP CONSTRAINT IF EXISTS payment_proof_payment_request_id_fkey;

ALTER TABLE payment_proof
  ADD CONSTRAINT payment_proof_payment_request_id_fkey
  FOREIGN KEY (payment_request_id) REFERENCES payment_request(id) ON DELETE RESTRICT;
