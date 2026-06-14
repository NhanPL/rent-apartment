-- ============================================================
-- 000001_demo_data
-- Optional local demo seed data.
--
-- Login credentials:
-- - manager@example.com / password
-- - tenant@example.com / password
-- ============================================================

INSERT INTO app_user (id, role, email, phone, username, password_hash, is_active)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'MANAGER',
    'manager@example.com',
    NULL,
    'manager',
    '$2b$04$RZ/Pem/zCCtR4hslSVW4f.XIAVqnbx0rMyLPB5Anboo./Y1bt3cVu',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'TENANT',
    'tenant@example.com',
    NULL,
    'tenant',
    '$2b$04$RZ/Pem/zCCtR4hslSVW4f.XIAVqnbx0rMyLPB5Anboo./Y1bt3cVu',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  username = EXCLUDED.username,
  password_hash = EXCLUDED.password_hash,
  is_active = EXCLUDED.is_active;

INSERT INTO manager_profile (user_id, full_name, note)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Demo Manager', 'Local seed manager')
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  note = EXCLUDED.note;

INSERT INTO tenant (
  id,
  user_id,
  full_name,
  dob,
  gender,
  identity_number,
  identity_issued_date,
  identity_issued_place,
  email,
  phone,
  permanent_address,
  status,
  note
)
VALUES (
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000002',
  'Demo Tenant',
  '1996-05-20',
  'OTHER',
  'DEMO-TENANT-001',
  '2020-01-10',
  'Demo City',
  'tenant@example.com',
  '0900000001',
  'Demo permanent address',
  'ACTIVE',
  'Local seed tenant'
)
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  full_name = EXCLUDED.full_name,
  dob = EXCLUDED.dob,
  gender = EXCLUDED.gender,
  identity_number = EXCLUDED.identity_number,
  identity_issued_date = EXCLUDED.identity_issued_date,
  identity_issued_place = EXCLUDED.identity_issued_place,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  permanent_address = EXCLUDED.permanent_address,
  status = EXCLUDED.status,
  note = EXCLUDED.note;

INSERT INTO building (id, manager_user_id, code, name, address, note)
VALUES (
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000001',
  'BLD-DEMO',
  'Demo Building',
  '123 Demo Street',
  'Local seed building'
)
ON CONFLICT (id) DO UPDATE SET
  manager_user_id = EXCLUDED.manager_user_id,
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  note = EXCLUDED.note;

INSERT INTO room (
  id,
  building_id,
  code,
  floor,
  area_m2,
  status,
  base_rent,
  deposit_default,
  max_occupants,
  note
)
VALUES (
  '10000000-0000-4000-8000-000000000301',
  '10000000-0000-4000-8000-000000000201',
  '101',
  1,
  25.00,
  'ACTIVE',
  3500000,
  3500000,
  2,
  'Local seed room'
)
ON CONFLICT (id) DO UPDATE SET
  building_id = EXCLUDED.building_id,
  code = EXCLUDED.code,
  floor = EXCLUDED.floor,
  area_m2 = EXCLUDED.area_m2,
  status = EXCLUDED.status,
  base_rent = EXCLUDED.base_rent,
  deposit_default = EXCLUDED.deposit_default,
  max_occupants = EXCLUDED.max_occupants,
  note = EXCLUDED.note;

INSERT INTO contract (
  id,
  room_id,
  contract_code,
  status,
  start_date,
  end_date,
  move_in_date,
  rent_price,
  deposit_amount,
  billing_day,
  note
)
VALUES (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000301',
  'HD-DEMO-001',
  'ACTIVE',
  '2026-01-01',
  NULL,
  '2026-01-01',
  3500000,
  3500000,
  5,
  'Local seed active contract'
)
ON CONFLICT (id) DO UPDATE SET
  room_id = EXCLUDED.room_id,
  contract_code = EXCLUDED.contract_code,
  status = EXCLUDED.status,
  start_date = EXCLUDED.start_date,
  end_date = EXCLUDED.end_date,
  move_in_date = EXCLUDED.move_in_date,
  rent_price = EXCLUDED.rent_price,
  deposit_amount = EXCLUDED.deposit_amount,
  billing_day = EXCLUDED.billing_day,
  note = EXCLUDED.note;

INSERT INTO contract_tenant (contract_id, tenant_id, is_primary, joined_at, left_at)
VALUES (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000101',
  true,
  '2026-01-01',
  NULL
)
ON CONFLICT (contract_id, tenant_id) DO UPDATE SET
  is_primary = EXCLUDED.is_primary,
  joined_at = EXCLUDED.joined_at,
  left_at = EXCLUDED.left_at;

INSERT INTO utility_rate (
  id,
  building_id,
  effective_from,
  electricity_unit_price,
  water_unit_price,
  note
)
VALUES (
  '10000000-0000-4000-8000-000000000501',
  '10000000-0000-4000-8000-000000000201',
  '2026-01-01',
  4000,
  15000,
  'Local seed utility rate'
)
ON CONFLICT (id) DO UPDATE SET
  building_id = EXCLUDED.building_id,
  effective_from = EXCLUDED.effective_from,
  electricity_unit_price = EXCLUDED.electricity_unit_price,
  water_unit_price = EXCLUDED.water_unit_price,
  note = EXCLUDED.note;

INSERT INTO charge_catalog (id, code, name, charge_type, is_active, note)
VALUES
  ('10000000-0000-4000-8000-000000000601', 'WIFI', 'Wifi', 'FLAT', true, 'Local seed charge'),
  ('10000000-0000-4000-8000-000000000602', 'TRASH', 'Trash collection', 'FLAT', true, 'Local seed charge'),
  ('10000000-0000-4000-8000-000000000603', 'PARKING', 'Parking', 'PER_VEHICLE', true, 'Local seed charge')
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  charge_type = EXCLUDED.charge_type,
  is_active = EXCLUDED.is_active,
  note = EXCLUDED.note;

INSERT INTO building_charge (id, building_id, charge_id, unit_price, effective_from, is_active)
VALUES
  (
    '10000000-0000-4000-8000-000000000701',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000601',
    100000,
    '2026-01-01',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000702',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000602',
    50000,
    '2026-01-01',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000703',
    '10000000-0000-4000-8000-000000000201',
    '10000000-0000-4000-8000-000000000603',
    150000,
    '2026-01-01',
    true
  )
ON CONFLICT (id) DO UPDATE SET
  building_id = EXCLUDED.building_id,
  charge_id = EXCLUDED.charge_id,
  unit_price = EXCLUDED.unit_price,
  effective_from = EXCLUDED.effective_from,
  is_active = EXCLUDED.is_active;
