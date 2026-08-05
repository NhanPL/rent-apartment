DO $$ BEGIN
  CREATE TYPE payment_entry_type AS ENUM ('PAYMENT', 'REVERSAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE payment
  ADD COLUMN IF NOT EXISTS entry_type payment_entry_type NOT NULL DEFAULT 'PAYMENT',
  ADD COLUMN IF NOT EXISTS original_payment_id uuid REFERENCES payment(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE payment_proof
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_original_reversal
ON payment(original_payment_id)
WHERE entry_type='REVERSAL';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_idempotency_key
ON payment(idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_proof_submit_idempotency
ON payment_proof(submitted_by_user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_original_payment
ON payment(original_payment_id);

ALTER TABLE payment DROP CONSTRAINT IF EXISTS ck_payment_ledger_entry;
ALTER TABLE payment ADD CONSTRAINT ck_payment_ledger_entry CHECK (
  (
    entry_type='PAYMENT'
    AND original_payment_id IS NULL
    AND reversal_reason IS NULL
  )
  OR
  (
    entry_type='REVERSAL'
    AND original_payment_id IS NOT NULL
    AND NULLIF(btrim(reversal_reason), '') IS NOT NULL
    AND payment_proof_id IS NULL
    AND status='SUCCEEDED'
  )
);

CREATE OR REPLACE FUNCTION validate_payment_reversal()
RETURNS TRIGGER AS $$
DECLARE
  original payment%ROWTYPE;
BEGIN
  IF NEW.entry_type <> 'REVERSAL' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO original
  FROM payment
  WHERE id=NEW.original_payment_id
  FOR UPDATE;

  IF NOT FOUND
     OR original.entry_type <> 'PAYMENT'
     OR original.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'Reversal requires an approved original payment'
      USING ERRCODE='23514';
  END IF;

  IF NEW.invoice_id <> original.invoice_id
     OR NEW.payment_request_id IS DISTINCT FROM original.payment_request_id
     OR NEW.amount <> original.amount THEN
    RAISE EXCEPTION 'Reversal must match the original payment scope and amount'
      USING ERRCODE='23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_validate_reversal ON payment;
CREATE TRIGGER trg_payment_validate_reversal
BEFORE INSERT ON payment
FOR EACH ROW EXECUTE FUNCTION validate_payment_reversal();

CREATE OR REPLACE FUNCTION protect_approved_payment_ledger()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status='SUCCEEDED' THEN
    RAISE EXCEPTION 'Approved payment ledger entries are immutable'
      USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_protect_approved ON payment;
CREATE TRIGGER trg_payment_protect_approved
BEFORE UPDATE OR DELETE ON payment
FOR EACH ROW EXECUTE FUNCTION protect_approved_payment_ledger();
