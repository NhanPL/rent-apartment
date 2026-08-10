-- DB-002: enforce core rental invariants and consolidate query indexes.

-- A lower current reading is valid only when the corresponding meter was
-- replaced/reset. For reset months, usage starts again from zero.
ALTER TABLE utility_reading
  ADD COLUMN IF NOT EXISTS electricity_meter_reset boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS water_meter_reset boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meter_reset_note text;

ALTER TABLE utility_reading
  DROP CONSTRAINT IF EXISTS ck_reading_elec,
  DROP CONSTRAINT IF EXISTS ck_reading_water,
  DROP CONSTRAINT IF EXISTS ck_reading_nonnegative,
  DROP CONSTRAINT IF EXISTS ck_reading_meter_reset_note;

ALTER TABLE utility_reading
  ADD CONSTRAINT ck_reading_elec CHECK (
    electricity_prev IS NULL
    OR electricity_curr IS NULL
    OR electricity_curr >= electricity_prev
    OR electricity_meter_reset
  ),
  ADD CONSTRAINT ck_reading_water CHECK (
    water_prev IS NULL
    OR water_curr IS NULL
    OR water_curr >= water_prev
    OR water_meter_reset
  ),
  ADD CONSTRAINT ck_reading_nonnegative CHECK (
    (electricity_prev IS NULL OR electricity_prev >= 0)
    AND (electricity_curr IS NULL OR electricity_curr >= 0)
    AND (water_prev IS NULL OR water_prev >= 0)
    AND (water_curr IS NULL OR water_curr >= 0)
  ),
  ADD CONSTRAINT ck_reading_meter_reset_note CHECK (
    (NOT electricity_meter_reset AND NOT water_meter_reset)
    OR NULLIF(btrim(meter_reset_note), '') IS NOT NULL
  );

-- Preserve scheduled contract dates while requiring actual occupancy dates to
-- follow the contract start and each other.
UPDATE contract
SET move_out_date=NULL
WHERE status='CANCELLED'
  AND move_in_date IS NULL
  AND move_out_date < start_date;

ALTER TABLE contract DROP CONSTRAINT IF EXISTS ck_contract_dates;
ALTER TABLE contract ADD CONSTRAINT ck_contract_dates CHECK (
  (end_date IS NULL OR end_date >= start_date)
  AND (move_in_date IS NULL OR move_in_date >= start_date)
  AND (move_out_date IS NULL OR move_out_date >= COALESCE(move_in_date, start_date))
);

-- Normalize legacy invoices that were issued after their provisional draft due
-- date. New issue operations also clamp due_date to the issue date.
UPDATE invoice
SET due_date=(issued_at AT TIME ZONE 'UTC')::date
WHERE issued_at IS NOT NULL
  AND due_date IS NOT NULL
  AND due_date < (issued_at AT TIME ZONE 'UTC')::date;

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS ck_invoice_due_date;
ALTER TABLE invoice ADD CONSTRAINT ck_invoice_due_date CHECK (
  due_date IS NULL
  OR issued_at IS NULL
  OR due_date >= (issued_at AT TIME ZONE 'UTC')::date
);

-- Existing unique business rules are intentionally retained:
-- uq_room_active_contract, uq_contract_primary_tenant, uq_reading_room_month,
-- and uq_invoice_contract_month_active.

-- Manager ownership queries start at building/tenant and then join rooms and
-- contracts. These indexes cover the join key and its common status predicate.
CREATE INDEX IF NOT EXISTS idx_room_building_status
ON room(building_id, status) INCLUDE (id);

CREATE INDEX IF NOT EXISTS idx_contract_room_status
ON contract(room_id, status) INCLUDE (id);

-- Keep the composite month/status and payment request/proof indexes introduced
-- by 20260809_api_pagination_indexes.sql. Remove only indexes whose complete
-- lookup prefix is already covered by a unique or wider composite index.
DROP INDEX IF EXISTS idx_tenant_user_id;
DROP INDEX IF EXISTS idx_tenant_manager;
DROP INDEX IF EXISTS idx_room_building;
DROP INDEX IF EXISTS idx_contract_room;
DROP INDEX IF EXISTS idx_contract_tenant_primary;
DROP INDEX IF EXISTS idx_utility_reading_room_month;
DROP INDEX IF EXISTS idx_utility_reading_status;
DROP INDEX IF EXISTS idx_invoice_status;
DROP INDEX IF EXISTS idx_payment_request_status;
DROP INDEX IF EXISTS idx_payment_proof_request;
DROP INDEX IF EXISTS idx_payment_invoice;
DROP INDEX IF EXISTS idx_payment_proof_id;
