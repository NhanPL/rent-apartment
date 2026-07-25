-- Allow one invoice to receive multiple verified bank-transfer payments.
ALTER TABLE payment DROP CONSTRAINT IF EXISTS payment_payment_request_id_key;

-- A cancelled or expired request should not block a new request for the same invoice.
ALTER TABLE payment_request DROP CONSTRAINT IF EXISTS uq_payment_request_invoice;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_request_invoice_active
ON payment_request(invoice_id)
WHERE status NOT IN ('CANCELLED', 'EXPIRED');
