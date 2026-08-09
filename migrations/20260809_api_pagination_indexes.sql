-- Composite indexes for the bounded list and report queries introduced by BE-004.
CREATE INDEX IF NOT EXISTS idx_invoice_month_created_page
ON invoice(month DESC, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_invoice_status_month_created_page
ON invoice(status, month DESC, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_invoice_contract_month_created_page
ON invoice(contract_id, month DESC, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_payment_request_created_page
ON payment_request(created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_payment_request_status_created_page
ON payment_request(status, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_payment_request_invoice_created_page
ON payment_request(invoice_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_payment_proof_request_created_page
ON payment_proof(payment_request_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_payment_invoice_status_created_page
ON payment(invoice_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_utility_reading_month_created_page
ON utility_reading(month DESC, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_utility_reading_status_month_created_page
ON utility_reading(status, month DESC, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_contract_tenant_active_primary
ON contract_tenant(contract_id, is_primary DESC, joined_at DESC)
WHERE left_at IS NULL;
