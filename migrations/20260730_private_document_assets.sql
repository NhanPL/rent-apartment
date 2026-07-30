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
      'ALTER TABLE %I
         ADD COLUMN IF NOT EXISTS cloudinary_asset_id text,
         ADD COLUMN IF NOT EXISTS cloudinary_public_id text,
         ADD COLUMN IF NOT EXISTS cloudinary_resource_type varchar(10),
         ADD COLUMN IF NOT EXISTS cloudinary_version bigint,
         ADD COLUMN IF NOT EXISTS cloudinary_format varchar(20),
         ADD COLUMN IF NOT EXISTS cloudinary_delivery_type varchar(20),
         ADD COLUMN IF NOT EXISTS retention_until timestamptz',
      table_name
    );
  END LOOP;
END $$;

ALTER TABLE tenant_document ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE payment_proof ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE utility_reading_evidence ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE contract_document ALTER COLUMN file_url DROP NOT NULL;

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
      $sql$
      UPDATE %I
      SET cloudinary_resource_type = COALESCE(
            cloudinary_resource_type,
            substring(file_url FROM '/(image|raw)/(?:upload|authenticated|private)/')
          ),
          cloudinary_delivery_type = COALESCE(
            cloudinary_delivery_type,
            substring(file_url FROM '/(?:image|raw)/(upload|authenticated|private)/')
          ),
          cloudinary_version = COALESCE(
            cloudinary_version,
            NULLIF(substring(file_url FROM '/v([0-9]+)/'), '')::bigint
          ),
          cloudinary_format = COALESCE(
            cloudinary_format,
            CASE
              WHEN mime_type = 'image/jpeg' THEN 'jpg'
              WHEN mime_type = 'image/png' THEN 'png'
              WHEN mime_type = 'image/webp' THEN 'webp'
              WHEN mime_type = 'application/pdf' THEN 'pdf'
              ELSE NULL
            END
          )
      WHERE file_url IS NOT NULL
      $sql$,
      table_name
    );

    EXECUTE format(
      $sql$
      UPDATE %I
      SET cloudinary_public_id = CASE
        WHEN cloudinary_resource_type = 'image' THEN
          regexp_replace(
            split_part(
              regexp_replace(
                file_url,
                '^https://res[.]cloudinary[.]com/[^/]+/(?:image|raw)/(?:upload|authenticated|private)/(?:v[0-9]+/)?',
                ''
              ),
              '?',
              1
            ),
            '[.][^./]+$',
            ''
          )
        ELSE
          split_part(
            regexp_replace(
              file_url,
              '^https://res[.]cloudinary[.]com/[^/]+/(?:image|raw)/(?:upload|authenticated|private)/(?:v[0-9]+/)?',
              ''
            ),
            '?',
            1
          )
        END
      WHERE cloudinary_public_id IS NULL
        AND file_url LIKE 'https://res.cloudinary.com/%%'
      $sql$,
      table_name
    );
  END LOOP;
END $$;

UPDATE tenant_document
SET retention_until = COALESCE(retention_until, created_at + interval '10 years');

UPDATE payment_proof
SET retention_until = COALESCE(retention_until, created_at + interval '5 years');

UPDATE utility_reading_evidence
SET retention_until = COALESCE(retention_until, created_at + interval '2 years');

UPDATE contract_document
SET retention_until = COALESCE(retention_until, created_at + interval '10 years');

DO $$
DECLARE
  table_name text;
  constraint_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_document',
    'payment_proof',
    'utility_reading_evidence',
    'contract_document'
  ]
  LOOP
    constraint_name := format('ck_%s_cloudinary_resource_type', table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = constraint_name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I
         CHECK (cloudinary_resource_type IS NULL OR cloudinary_resource_type IN (''image'', ''raw''))',
        table_name,
        constraint_name
      );
    END IF;

    constraint_name := format('ck_%s_cloudinary_delivery_type', table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = constraint_name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I
         CHECK (cloudinary_delivery_type IS NULL OR cloudinary_delivery_type IN (''upload'', ''private'', ''authenticated''))',
        table_name,
        constraint_name
      );
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS cloudinary_asset_job (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action                varchar(30) NOT NULL,
  source_kind           varchar(40),
  source_id             uuid,
  public_id             text NOT NULL,
  resource_type         varchar(10) NOT NULL,
  delivery_type         varchar(20) NOT NULL,
  asset_version         bigint,
  asset_format          varchar(20),
  reason                varchar(80) NOT NULL,
  status                varchar(20) NOT NULL DEFAULT 'PENDING',
  attempts              integer NOT NULL DEFAULT 0,
  next_attempt_at       timestamptz NOT NULL DEFAULT now(),
  last_error_code       varchar(100),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,

  CONSTRAINT ck_cloudinary_asset_job_action
    CHECK (action IN ('DELETE', 'MIGRATE_AUTHENTICATED')),
  CONSTRAINT ck_cloudinary_asset_job_source_kind
    CHECK (source_kind IS NULL OR source_kind IN ('TENANT_DOCUMENT', 'PAYMENT_PROOF', 'UTILITY_EVIDENCE', 'CONTRACT_DOCUMENT')),
  CONSTRAINT ck_cloudinary_asset_job_resource_type
    CHECK (resource_type IN ('image', 'raw')),
  CONSTRAINT ck_cloudinary_asset_job_delivery_type
    CHECK (delivery_type IN ('upload', 'private', 'authenticated')),
  CONSTRAINT ck_cloudinary_asset_job_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'RETRY', 'COMPLETED', 'FAILED')),
  CONSTRAINT ck_cloudinary_asset_job_attempts
    CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_cloudinary_asset_job_due
ON cloudinary_asset_job(status, next_attempt_at)
WHERE status IN ('PENDING', 'RETRY');

CREATE UNIQUE INDEX IF NOT EXISTS uq_cloudinary_asset_job_active
ON cloudinary_asset_job(action, source_kind, source_id, public_id)
WHERE status IN ('PENDING', 'PROCESSING', 'RETRY');

CREATE TABLE IF NOT EXISTS cloudinary_orphan_issue (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_type            varchar(30) NOT NULL,
  source_kind           varchar(40),
  source_id             uuid,
  public_id             text,
  resource_type         varchar(10),
  delivery_type         varchar(20),
  status                varchar(20) NOT NULL DEFAULT 'OPEN',
  first_detected_at     timestamptz NOT NULL DEFAULT now(),
  last_detected_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,

  CONSTRAINT ck_cloudinary_orphan_issue_type
    CHECK (issue_type IN ('ORPHAN_CLOUDINARY_ASSET', 'ORPHAN_DATABASE_RECORD', 'LEGACY_PUBLIC_ASSET')),
  CONSTRAINT ck_cloudinary_orphan_issue_status
    CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cloudinary_orphan_issue_database
ON cloudinary_orphan_issue(issue_type, source_kind, source_id)
WHERE source_id IS NOT NULL AND status='OPEN';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cloudinary_orphan_issue_cloudinary
ON cloudinary_orphan_issue(issue_type, public_id, resource_type, delivery_type)
WHERE source_id IS NULL AND status='OPEN';

INSERT INTO cloudinary_asset_job(
  action,
  source_kind,
  source_id,
  public_id,
  resource_type,
  delivery_type,
  asset_version,
  asset_format,
  reason
)
SELECT 'MIGRATE_AUTHENTICATED', source_kind, id, cloudinary_public_id,
       cloudinary_resource_type, cloudinary_delivery_type,
       cloudinary_version, cloudinary_format, 'SEC_004_LEGACY_ASSET'
FROM (
  SELECT 'TENANT_DOCUMENT'::varchar AS source_kind, id, cloudinary_public_id,
         cloudinary_resource_type, cloudinary_delivery_type, cloudinary_version, cloudinary_format
  FROM tenant_document
  UNION ALL
  SELECT 'PAYMENT_PROOF', id, cloudinary_public_id,
         cloudinary_resource_type, cloudinary_delivery_type, cloudinary_version, cloudinary_format
  FROM payment_proof
  UNION ALL
  SELECT 'UTILITY_EVIDENCE', id, cloudinary_public_id,
         cloudinary_resource_type, cloudinary_delivery_type, cloudinary_version, cloudinary_format
  FROM utility_reading_evidence
  UNION ALL
  SELECT 'CONTRACT_DOCUMENT', id, cloudinary_public_id,
         cloudinary_resource_type, cloudinary_delivery_type, cloudinary_version, cloudinary_format
  FROM contract_document
) legacy_assets
WHERE cloudinary_public_id IS NOT NULL
  AND cloudinary_resource_type IN ('image', 'raw')
  AND cloudinary_delivery_type = 'upload'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION enqueue_cloudinary_delete_after_document_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_kind_value varchar(40);
BEGIN
  source_kind_value := CASE TG_TABLE_NAME
    WHEN 'tenant_document' THEN 'TENANT_DOCUMENT'
    WHEN 'payment_proof' THEN 'PAYMENT_PROOF'
    WHEN 'utility_reading_evidence' THEN 'UTILITY_EVIDENCE'
    WHEN 'contract_document' THEN 'CONTRACT_DOCUMENT'
    ELSE NULL
  END;

  IF source_kind_value IS NOT NULL
     AND OLD.cloudinary_public_id IS NOT NULL
     AND OLD.cloudinary_resource_type IN ('image', 'raw') THEN
    INSERT INTO cloudinary_asset_job(
      action,
      source_kind,
      source_id,
      public_id,
      resource_type,
      delivery_type,
      asset_version,
      asset_format,
      reason
    )
    VALUES(
      'DELETE',
      source_kind_value,
      OLD.id,
      OLD.cloudinary_public_id,
      OLD.cloudinary_resource_type,
      COALESCE(OLD.cloudinary_delivery_type, 'upload'),
      OLD.cloudinary_version,
      OLD.cloudinary_format,
      'DATABASE_ROW_DELETED'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN OLD;
END $$;

DO $$
DECLARE
  table_name text;
  trigger_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_document',
    'payment_proof',
    'utility_reading_evidence',
    'contract_document'
  ]
  LOOP
    trigger_name := format('trg_%s_cloudinary_cleanup', table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER %I
       BEFORE DELETE ON %I
       FOR EACH ROW EXECUTE FUNCTION enqueue_cloudinary_delete_after_document_row()',
      trigger_name,
      table_name
    );
  END LOOP;
END $$;
