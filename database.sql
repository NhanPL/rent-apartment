-- ============================================================
-- 0) Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ============================================================
-- 1) Helper: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2) Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('MANAGER', 'TENANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE room_status AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID', 'OVERDUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('CASH', 'BANK_TRANSFER', 'E_WALLET', 'CARD', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE charge_type AS ENUM ('FLAT', 'PER_PERSON', 'PER_VEHICLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gateway_provider AS ENUM ('VNPAY', 'MOMO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE txn_status AS ENUM ('CREATED', 'REDIRECTED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 3) Users (account login) - cả manager và tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS app_user (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  role            user_role NOT NULL,

  email           citext UNIQUE,
  phone           varchar(20) UNIQUE,
  username        citext UNIQUE,
  password_hash   text NOT NULL,

  is_active       boolean NOT NULL DEFAULT true,
  last_login_at   timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_app_user_updated_at ON app_user;
CREATE TRIGGER trg_app_user_updated_at
BEFORE UPDATE ON app_user
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Manager profile (thông tin thêm cho manager)
CREATE TABLE IF NOT EXISTS manager_profile (
  user_id     uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  full_name   text NOT NULL,
  note        text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_manager_profile_updated_at ON manager_profile;
CREATE TRIGGER trg_manager_profile_updated_at
BEFORE UPDATE ON manager_profile
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 4) Tenant (hồ sơ người thuê) + liên kết tài khoản login
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               uuid UNIQUE REFERENCES app_user(id) ON DELETE SET NULL,

  full_name             text NOT NULL,
  dob                   date,
  gender                varchar(10),
  identity_number       varchar(20) NOT NULL,
  identity_issued_date  date,
  identity_issued_place text,

  email                 citext,
  phone                 varchar(20) NOT NULL,
  permanent_address     text,

  status                varchar(20) NOT NULL DEFAULT 'ACTIVE',
  note                  text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_tenant_identity UNIQUE (identity_number),
  CONSTRAINT ck_tenant_status CHECK (status IN ('ACTIVE','MOVED_OUT','BLACKLIST'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_phone ON tenant(phone);
CREATE INDEX IF NOT EXISTS idx_tenant_user_id ON tenant(user_id);

DROP TRIGGER IF EXISTS trg_tenant_updated_at ON tenant;
CREATE TRIGGER trg_tenant_updated_at
BEFORE UPDATE ON tenant
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 5) Buildings & Rooms
-- ============================================================
CREATE TABLE IF NOT EXISTS building (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,

  code            varchar(50) NOT NULL,
  name            text NOT NULL,
  address         text NOT NULL,
  note            text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_building_manager_code UNIQUE (manager_user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_building_manager ON building(manager_user_id);

DROP TRIGGER IF EXISTS trg_building_updated_at ON building;
CREATE TRIGGER trg_building_updated_at
BEFORE UPDATE ON building
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS room (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id     uuid NOT NULL REFERENCES building(id) ON DELETE CASCADE,

  code            varchar(50) NOT NULL,
  floor           integer,
  area_m2         numeric(10,2),
  status          room_status NOT NULL DEFAULT 'ACTIVE',

  base_rent       numeric(14,2) NOT NULL DEFAULT 0,
  deposit_default numeric(14,2) NOT NULL DEFAULT 0,
  max_occupants   integer NOT NULL DEFAULT 1,

  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_room_building_code UNIQUE (building_id, code),
  CONSTRAINT ck_room_money CHECK (base_rent >= 0 AND deposit_default >= 0),
  CONSTRAINT ck_room_occupants CHECK (max_occupants >= 1)
);

CREATE INDEX IF NOT EXISTS idx_room_building ON room(building_id);

DROP TRIGGER IF EXISTS trg_room_updated_at ON room;
CREATE TRIGGER trg_room_updated_at
BEFORE UPDATE ON room
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 6) Contract (hợp đồng) + Contract tenants (ở ghép)
-- ============================================================
CREATE TABLE IF NOT EXISTS contract (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id         uuid NOT NULL REFERENCES room(id) ON DELETE RESTRICT,

  contract_code   varchar(50),
  status          contract_status NOT NULL DEFAULT 'DRAFT',

  start_date      date NOT NULL,
  end_date        date,
  move_in_date    date,
  move_out_date   date,

  rent_price      numeric(14,2) NOT NULL DEFAULT 0,
  deposit_amount  numeric(14,2) NOT NULL DEFAULT 0,

  billing_day     integer NOT NULL DEFAULT 1, -- 1..28
  note            text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_contract_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT ck_contract_money CHECK (rent_price >= 0 AND deposit_amount >= 0),
  CONSTRAINT ck_contract_billing_day CHECK (billing_day BETWEEN 1 AND 28)
);

CREATE INDEX IF NOT EXISTS idx_contract_room ON contract(room_id);
CREATE INDEX IF NOT EXISTS idx_contract_status ON contract(status);
CREATE INDEX IF NOT EXISTS idx_contract_start_date ON contract(start_date);

DROP TRIGGER IF EXISTS trg_contract_updated_at ON contract;
CREATE TRIGGER trg_contract_updated_at
BEFORE UPDATE ON contract
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS contract_tenant (
  contract_id  uuid NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,

  is_primary   boolean NOT NULL DEFAULT false,
  joined_at    date NOT NULL DEFAULT current_date,
  left_at      date,

  PRIMARY KEY (contract_id, tenant_id),
  CONSTRAINT ck_contract_tenant_dates CHECK (left_at IS NULL OR left_at >= joined_at)
);

CREATE INDEX IF NOT EXISTS idx_contract_tenant_tenant ON contract_tenant(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contract_tenant_primary ON contract_tenant(contract_id, is_primary);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_primary_tenant
ON contract_tenant(contract_id)
WHERE is_primary = true;

-- 1 phòng chỉ có tối đa 1 hợp đồng ACTIVE
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_active_contract
ON contract(room_id)
WHERE status = 'ACTIVE';

-- ============================================================
-- 7) Utility rates & monthly readings (điện/nước theo chỉ số)
-- ============================================================
CREATE TABLE IF NOT EXISTS utility_rate (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id             uuid NOT NULL REFERENCES building(id) ON DELETE CASCADE,

  effective_from          date NOT NULL,
  electricity_unit_price  numeric(14,2) NOT NULL DEFAULT 0,
  water_unit_price        numeric(14,2) NOT NULL DEFAULT 0,

  note                    text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_utility_rate_money CHECK (electricity_unit_price >= 0 AND water_unit_price >= 0),
  CONSTRAINT uq_utility_rate_effective UNIQUE (building_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_utility_rate_building
ON utility_rate(building_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_utility_rate_updated_at ON utility_rate;
CREATE TRIGGER trg_utility_rate_updated_at
BEFORE UPDATE ON utility_rate
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS utility_reading (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id               uuid NOT NULL REFERENCES room(id) ON DELETE CASCADE,

  month                 date NOT NULL, -- YYYY-MM-01
  electricity_prev      numeric(14,3),
  electricity_curr      numeric(14,3),
  water_prev            numeric(14,3),
  water_curr            numeric(14,3),

  reported_by_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  reported_at           timestamptz,
  verified_by_user_id   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  verified_at           timestamptz,

  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_reading_room_month UNIQUE (room_id, month),
  CONSTRAINT ck_reading_month_is_first_day CHECK (extract(day from month) = 1),
  CONSTRAINT ck_reading_elec CHECK (electricity_prev IS NULL OR electricity_curr IS NULL OR electricity_curr >= electricity_prev),
  CONSTRAINT ck_reading_water CHECK (water_prev IS NULL OR water_curr IS NULL OR water_curr >= water_prev)
);

CREATE INDEX IF NOT EXISTS idx_utility_reading_room_month
ON utility_reading(room_id, month DESC);

DROP TRIGGER IF EXISTS trg_utility_reading_updated_at ON utility_reading;
CREATE TRIGGER trg_utility_reading_updated_at
BEFORE UPDATE ON utility_reading
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 8) Flexible fixed charges: WIFI/RAC/XE... (có hoặc không)
-- ============================================================
CREATE TABLE IF NOT EXISTS charge_catalog (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code         varchar(50) NOT NULL UNIQUE, -- WIFI/TRASH/PARKING...
  name         text NOT NULL,
  charge_type  charge_type NOT NULL,        -- FLAT/PER_PERSON/PER_VEHICLE
  is_active    boolean NOT NULL DEFAULT true,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_charge_catalog_updated_at ON charge_catalog;
CREATE TRIGGER trg_charge_catalog_updated_at
BEFORE UPDATE ON charge_catalog
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- default theo Building
CREATE TABLE IF NOT EXISTS building_charge (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id     uuid NOT NULL REFERENCES building(id) ON DELETE CASCADE,
  charge_id       uuid NOT NULL REFERENCES charge_catalog(id) ON DELETE RESTRICT,

  unit_price      numeric(14,2) NOT NULL DEFAULT 0,
  effective_from  date NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_building_charge_price CHECK (unit_price >= 0),
  CONSTRAINT uq_building_charge UNIQUE (building_id, charge_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_building_charge_lookup
ON building_charge(building_id, charge_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_building_charge_updated_at ON building_charge;
CREATE TRIGGER trg_building_charge_updated_at
BEFORE UPDATE ON building_charge
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- override theo Room (nếu phòng có phí riêng / giá riêng)
CREATE TABLE IF NOT EXISTS room_charge_override (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id         uuid NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  charge_id       uuid NOT NULL REFERENCES charge_catalog(id) ON DELETE RESTRICT,

  unit_price      numeric(14,2) NOT NULL DEFAULT 0,
  effective_from  date NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_room_charge_price CHECK (unit_price >= 0),
  CONSTRAINT uq_room_charge UNIQUE (room_id, charge_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_room_charge_lookup
ON room_charge_override(room_id, charge_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_room_charge_override_updated_at ON room_charge_override;
CREATE TRIGGER trg_room_charge_override_updated_at
BEFORE UPDATE ON room_charge_override
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- override theo Contract (mạnh nhất - deal riêng theo hợp đồng)
CREATE TABLE IF NOT EXISTS contract_charge_override (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id     uuid NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  charge_id       uuid NOT NULL REFERENCES charge_catalog(id) ON DELETE RESTRICT,

  unit_price      numeric(14,2) NOT NULL DEFAULT 0,
  effective_from  date NOT NULL,
  effective_to    date,
  is_active       boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_contract_charge_price CHECK (unit_price >= 0),
  CONSTRAINT ck_contract_charge_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT uq_contract_charge UNIQUE (contract_id, charge_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_contract_charge_lookup
ON contract_charge_override(contract_id, charge_id, effective_from DESC);

DROP TRIGGER IF EXISTS trg_contract_charge_override_updated_at ON contract_charge_override;
CREATE TRIGGER trg_contract_charge_override_updated_at
BEFORE UPDATE ON contract_charge_override
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- dữ liệu phát sinh theo tháng cho phòng: số người/số xe (để tính PER_PERSON/PER_VEHICLE)
CREATE TABLE IF NOT EXISTS room_month_extra (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id             uuid NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  month               date NOT NULL, -- YYYY-MM-01

  persons_count       integer,
  vehicles_count      integer,

  reported_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  reported_at         timestamptz,

  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_room_month_extra UNIQUE (room_id, month),
  CONSTRAINT ck_room_month_extra_month CHECK (extract(day from month) = 1),
  CONSTRAINT ck_room_month_extra_counts CHECK (
    (persons_count IS NULL OR persons_count >= 0)
    AND (vehicles_count IS NULL OR vehicles_count >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_room_month_extra_room_month
ON room_month_extra(room_id, month DESC);

DROP TRIGGER IF EXISTS trg_room_month_extra_updated_at ON room_month_extra;
CREATE TRIGGER trg_room_month_extra_updated_at
BEFORE UPDATE ON room_month_extra
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 9) Invoices & items (xuất hóa đơn tháng)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id   uuid NOT NULL REFERENCES contract(id) ON DELETE RESTRICT,
  room_id       uuid NOT NULL REFERENCES room(id) ON DELETE RESTRICT, -- denormalize để query nhanh
  month         date NOT NULL, -- YYYY-MM-01
  status        invoice_status NOT NULL DEFAULT 'DRAFT',

  issued_at     timestamptz,
  due_date      date,
  note          text,

  subtotal      numeric(14,2) NOT NULL DEFAULT 0,
  discount      numeric(14,2) NOT NULL DEFAULT 0,
  total         numeric(14,2) NOT NULL DEFAULT 0,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_invoice_contract_month UNIQUE (contract_id, month),
  CONSTRAINT ck_invoice_month_is_first_day CHECK (extract(day from month) = 1),
  CONSTRAINT ck_invoice_money CHECK (subtotal >= 0 AND discount >= 0 AND total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invoice_room_month ON invoice(room_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoice(status);

DROP TRIGGER IF EXISTS trg_invoice_updated_at ON invoice;
CREATE TRIGGER trg_invoice_updated_at
BEFORE UPDATE ON invoice
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS invoice_item (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  uuid NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,

  code        varchar(50) NOT NULL, -- RENT/ELECTRIC/WATER/WIFI/TRASH/PARKING/OTHER...
  name        text NOT NULL,

  quantity    numeric(14,3) NOT NULL DEFAULT 1,
  unit_price  numeric(14,2) NOT NULL DEFAULT 0,
  amount      numeric(14,2) NOT NULL DEFAULT 0,

  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_invoice_item_money CHECK (quantity >= 0 AND unit_price >= 0 AND amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invoice_item_invoice ON invoice_item(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_item_code ON invoice_item(code);

-- ============================================================
-- 10) Payments (business record) + gateway transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS payment (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id         uuid NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,

  method            payment_method NOT NULL DEFAULT 'CASH',
  status            payment_status NOT NULL DEFAULT 'PENDING',

  amount            numeric(14,2) NOT NULL,
  paid_at           timestamptz,
  reference_code    varchar(100),
  note              text,

  created_by_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_payment_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_payment_invoice ON payment(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_status ON payment(status);

DROP TRIGGER IF EXISTS trg_payment_updated_at ON payment;
CREATE TRIGGER trg_payment_updated_at
BEFORE UPDATE ON payment
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- gateway transaction lưu request/redirect/callback payload để debug VNPAY/MoMo
CREATE TABLE IF NOT EXISTS payment_transaction (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id         uuid NOT NULL REFERENCES payment(id) ON DELETE CASCADE,

  provider           gateway_provider NOT NULL,
  status             txn_status NOT NULL DEFAULT 'CREATED',

  amount             numeric(14,2) NOT NULL,
  currency           varchar(10) NOT NULL DEFAULT 'VND',

  merchant_order_id  varchar(100) NOT NULL,
  provider_txn_id    varchar(100),
  provider_ref       varchar(150),

  redirect_url       text,
  return_url         text,
  ipn_url            text,

  request_payload    jsonb,
  redirect_payload   jsonb,
  callback_payload   jsonb,

  signature_valid    boolean,
  paid_at            timestamptz,
  failed_reason      text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_txn_amount CHECK (amount > 0),
  CONSTRAINT uq_txn_merchant_order UNIQUE (merchant_order_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_txn_payment ON payment_transaction(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_txn_provider_ref ON payment_transaction(provider, provider_ref);
CREATE INDEX IF NOT EXISTS idx_payment_txn_status ON payment_transaction(status);

DROP TRIGGER IF EXISTS trg_payment_transaction_updated_at ON payment_transaction;
CREATE TRIGGER trg_payment_transaction_updated_at
BEFORE UPDATE ON payment_transaction
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 11) Contract documents (in hợp đồng / lưu file)
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_document (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id   uuid NOT NULL REFERENCES contract(id) ON DELETE CASCADE,

  doc_type      varchar(50) NOT NULL, -- SIGNED_PDF / TEMPLATE_RENDER / ...
  file_name     text,
  file_url      text,
  content_json  jsonb,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_document_contract ON contract_document(contract_id);

-- ============================================================
-- 12) Views hỗ trợ query nhanh cho quản lý
-- ============================================================

-- View: phòng đang có ai ở + số người
CREATE OR REPLACE VIEW vw_room_occupancy AS
SELECT
  r.id AS room_id,
  r.building_id,
  r.code AS room_code,
  c.id AS active_contract_id,
  c.start_date,
  c.rent_price,
  COUNT(ct.tenant_id) FILTER (WHERE ct.left_at IS NULL) AS occupants_count
FROM room r
LEFT JOIN contract c
  ON c.room_id = r.id AND c.status = 'ACTIVE'
LEFT JOIN contract_tenant ct
  ON ct.contract_id = c.id
GROUP BY r.id, r.building_id, r.code, c.id, c.start_date, c.rent_price;

-- View: tenant hiện đang ở phòng nào
CREATE OR REPLACE VIEW vw_tenant_current_room AS
SELECT
  t.id AS tenant_id,
  t.full_name,
  t.phone,
  t.identity_number,
  r.id AS room_id,
  r.code AS room_code,
  b.id AS building_id,
  b.name AS building_name,
  c.id AS contract_id,
  c.start_date
FROM tenant t
JOIN contract_tenant ct ON ct.tenant_id = t.id AND ct.left_at IS NULL
JOIN contract c ON c.id = ct.contract_id AND c.status = 'ACTIVE'
JOIN room r ON r.id = c.room_id
JOIN building b ON b.id = r.building_id;

-- View: trạng thái hóa đơn theo phòng/tháng
CREATE OR REPLACE VIEW vw_room_invoice_status AS
SELECT
  i.room_id,
  i.month,
  i.status,
  i.total
FROM invoice i;