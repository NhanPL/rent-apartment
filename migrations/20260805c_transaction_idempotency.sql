CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_code
ON contract(lower(btrim(contract_code)))
WHERE NULLIF(btrim(contract_code), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_proof_pending
ON payment_proof(payment_request_id)
WHERE status='PENDING';
