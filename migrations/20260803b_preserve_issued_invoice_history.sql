UPDATE invoice i
SET status = CASE
  WHEN COALESCE(paid.amount, 0) >= i.total
    THEN 'PAID'::invoice_status
  WHEN COALESCE(paid.amount, 0) > 0
    THEN 'PARTIALLY_PAID'::invoice_status
  ELSE 'ISSUED'::invoice_status
END
FROM (
  SELECT invoice_id, SUM(amount) AS amount
  FROM payment
  WHERE status='SUCCEEDED'
  GROUP BY invoice_id
) paid
WHERE i.id=paid.invoice_id
  AND i.status IN ('ISSUED', 'OVERDUE');

UPDATE invoice
SET status='ISSUED'
WHERE status='OVERDUE';

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS replaces_invoice_id uuid REFERENCES invoice(id) ON DELETE RESTRICT;

UPDATE invoice
SET void_reason=COALESCE(NULLIF(btrim(void_reason), ''), 'Legacy void before reason tracking'),
    voided_at=COALESCE(voided_at, updated_at, now())
WHERE status='VOID';

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS uq_invoice_contract_month;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_contract_month_active
ON invoice(contract_id, month)
WHERE status <> 'VOID';

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_replaces_invoice
ON invoice(replaces_invoice_id)
WHERE replaces_invoice_id IS NOT NULL;

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS ck_invoice_status_current;
ALTER TABLE invoice ADD CONSTRAINT ck_invoice_status_current CHECK (
  status::text IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID')
);

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS ck_invoice_void_metadata;
ALTER TABLE invoice ADD CONSTRAINT ck_invoice_void_metadata CHECK (
  status <> 'VOID'
  OR (NULLIF(btrim(void_reason), '') IS NOT NULL AND voided_at IS NOT NULL)
);

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS ck_invoice_not_self_replacement;
ALTER TABLE invoice ADD CONSTRAINT ck_invoice_not_self_replacement CHECK (
  replaces_invoice_id IS NULL OR replaces_invoice_id <> id
);

UPDATE utility_reading ur
SET status='INVOICED'
WHERE ur.status='APPROVED'
  AND EXISTS (
    SELECT 1
    FROM invoice i
    WHERE i.utility_reading_id=ur.id
      AND i.status='VOID'
      AND (
        i.issued_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM payment_request pr WHERE pr.invoice_id=i.id)
        OR EXISTS (SELECT 1 FROM payment p WHERE p.invoice_id=i.id)
      )
  );
