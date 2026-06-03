CREATE TABLE IF NOT EXISTS tenant_document (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,

  doc_type              varchar(50) NOT NULL,
  file_name             text,
  file_url              text NOT NULL,
  mime_type             varchar(100) NOT NULL,
  file_size             bigint NOT NULL,

  uploaded_by_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  uploaded_at           timestamptz NOT NULL DEFAULT now(),

  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_tenant_document_type
    CHECK (doc_type IN ('IDENTITY_FRONT', 'IDENTITY_BACK', 'RESIDENCE', 'OTHER')),
  CONSTRAINT ck_tenant_document_file_size
    CHECK (file_size > 0)
);

CREATE INDEX IF NOT EXISTS idx_tenant_document_tenant
ON tenant_document(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_document_type
ON tenant_document(doc_type);

ALTER TABLE contract_document
  ADD COLUMN IF NOT EXISTS mime_type varchar(100),
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS uploaded_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_contract_document_file_size'
  ) THEN
    ALTER TABLE contract_document
      ADD CONSTRAINT ck_contract_document_file_size
      CHECK (file_size IS NULL OR file_size > 0);
  END IF;
END $$;
