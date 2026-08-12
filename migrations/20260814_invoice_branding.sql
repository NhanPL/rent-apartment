CREATE TABLE IF NOT EXISTS invoice_branding (
  manager_user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  display_name varchar(120) NOT NULL,
  business_address varchar(500),
  tax_code varchar(50),
  logo_url text,
  accent_color varchar(7) NOT NULL DEFAULT '#1677FF',
  invoice_title varchar(100) NOT NULL DEFAULT 'Monthly Invoice',
  default_note varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_invoice_branding_accent_color CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_invoice_branding_logo_url CHECK (logo_url IS NULL OR logo_url ~ '^https://')
);

DROP TRIGGER IF EXISTS trg_invoice_branding_updated_at ON invoice_branding;
CREATE TRIGGER trg_invoice_branding_updated_at
BEFORE UPDATE ON invoice_branding
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS branding_snapshot jsonb;

COMMENT ON COLUMN invoice.branding_snapshot IS
  'Immutable manager branding captured when the invoice is first issued.';
