import type { PoolClient } from 'pg';
import { query } from '../../db';
import type {
  ContractStatus,
  DatabaseDate,
  DatabaseNumeric,
  DatabaseTimestamp,
  RoomStatus,
  TenantStatus
} from '../../shared/types/database';

export type RentalRegistrationClient = Pick<PoolClient, 'query'>;

export interface RentalRegistrationRow {
  id: string;
  room_id: string;
  building_id: string;
  code: string;
  room_code: string;
  building_name: string;
  floor: number | null;
  area_m2: DatabaseNumeric | null;
  base_rent: DatabaseNumeric;
  deposit_default: DatabaseNumeric;
  max_occupants: number;
  contract_code: string | null;
  status: ContractStatus | RoomStatus | TenantStatus;
  start_date: DatabaseDate;
  end_date: DatabaseDate | null;
  move_in_date: DatabaseDate | null;
  move_out_date: DatabaseDate | null;
  rent_price: DatabaseNumeric;
  deposit_amount: DatabaseNumeric;
  billing_day: number;
  note: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  identity_number: string;
  signed_document_count: number;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

export interface TenantDraftRecord {
  full_name: string;
  phone: string;
  identity_number: string;
  email?: string | null;
  dob?: string | null;
  gender?: string | null;
  identity_issued_date?: string | null;
  identity_issued_place?: string | null;
  permanent_address?: string | null;
  note?: string | null;
  privacy_policy_version?: string;
}

export interface DraftContractRecord {
  room_id: string;
  start_date: string;
  end_date?: string | null;
  rent_price: number;
  deposit_amount: number;
  billing_day: number;
}

const contractColumns = `id, room_id, contract_code, status, start_date, end_date,
  move_in_date, move_out_date, rent_price, deposit_amount, billing_day, note, created_at, updated_at`;

export const listAvailableRooms = async (managerId: string, buildingId?: string) => {
  const params: unknown[] = [managerId];
  const conditions = ['b.manager_user_id=$1', "r.status='ACTIVE'", 'occupancy.id IS NULL'];
  if (buildingId) {
    params.push(buildingId);
    conditions.push(`b.id=$${params.length}`);
  }
  return (await query<RentalRegistrationRow>(
    `SELECT r.id, r.building_id, r.code, r.floor, r.area_m2,
            r.base_rent, r.deposit_default, r.max_occupants,
            b.name AS building_name
     FROM room r
     JOIN building b ON b.id=r.building_id
     LEFT JOIN LATERAL (
       SELECT c.id
       FROM contract c
       JOIN contract_tenant ct ON ct.contract_id=c.id
       WHERE c.room_id=r.id
         AND c.status IN ('DRAFT', 'ACTIVE')
         AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
         AND (c.move_out_date IS NULL OR c.move_out_date >= CURRENT_DATE)
         AND (ct.left_at IS NULL OR ct.left_at >= CURRENT_DATE)
       LIMIT 1
     ) occupancy ON true
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.name, r.code`,
    params
  )).rows;
};

export const listAvailableTenants = async (managerId: string) => (
  await query<RentalRegistrationRow>(
    `SELECT t.id, t.full_name, t.phone, t.email, t.identity_number, t.status
     FROM tenant t
     WHERE t.manager_user_id=$1
       AND t.status='ACTIVE'
       AND NOT EXISTS (
         SELECT 1
         FROM contract_tenant ct
         JOIN contract c ON c.id=ct.contract_id
         WHERE ct.tenant_id=t.id
           AND c.status IN ('DRAFT', 'ACTIVE')
           AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
           AND (c.move_out_date IS NULL OR c.move_out_date >= CURRENT_DATE)
           AND (ct.left_at IS NULL OR ct.left_at >= CURRENT_DATE)
       )
     ORDER BY t.full_name`,
    [managerId]
  )
).rows;

export const contractCodeExists = async (client: RentalRegistrationClient, code: string) => Boolean(
  (await client.query<{ exists: 1 }>('SELECT 1 FROM contract WHERE contract_code = $1 LIMIT 1', [code])).rows[0]
);

export const findScopedContract = async (
  client: RentalRegistrationClient,
  contractId: string,
  managerId: string,
  lock = false
) => (await client.query<RentalRegistrationRow>(
  `SELECT c.id, c.room_id, c.contract_code, c.status, c.start_date, c.end_date,
          c.move_in_date, c.move_out_date, c.rent_price, c.deposit_amount, c.billing_day,
          c.note, c.created_at, c.updated_at,
          r.code AS room_code, r.max_occupants, b.id AS building_id, b.name AS building_name,
          COALESCE(contract_docs.signed_document_count, 0)::int AS signed_document_count
   FROM contract c
   JOIN room r ON r.id=c.room_id
   JOIN building b ON b.id=r.building_id
   LEFT JOIN LATERAL (
     SELECT COUNT(*)::int AS signed_document_count
     FROM contract_document cd
     WHERE cd.contract_id=c.id AND cd.doc_type='SIGNED_SCAN'
   ) contract_docs ON true
   WHERE c.id=$1 AND b.manager_user_id=$2
   ${lock ? 'FOR UPDATE OF c' : ''}`,
  [contractId, managerId]
)).rows[0] ?? null;

export const findRoomForUpdate = async (client: RentalRegistrationClient, roomId: string, managerId: string) => (
  await client.query<RentalRegistrationRow>(
    `SELECT r.id, r.building_id, r.code, r.floor, r.area_m2, r.status,
            r.base_rent, r.deposit_default, r.max_occupants, r.note, r.created_at, r.updated_at
     FROM room r JOIN building b ON b.id=r.building_id
     WHERE r.id=$1 AND b.manager_user_id=$2 FOR UPDATE OF r`,
    [roomId, managerId]
  )
).rows[0] ?? null;

export const findRoomOccupyingContract = async (
  client: RentalRegistrationClient,
  roomId: string,
  excludeContractId?: string
) => (await client.query<{ id: string }>(
  `SELECT c.id FROM contract c JOIN contract_tenant ct ON ct.contract_id=c.id
   WHERE c.room_id=$1 AND c.status IN ('DRAFT', 'ACTIVE')
     AND ($2::uuid IS NULL OR c.id<>$2)
     AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
     AND (c.move_out_date IS NULL OR c.move_out_date >= CURRENT_DATE)
     AND (ct.left_at IS NULL OR ct.left_at >= CURRENT_DATE)
   LIMIT 1`,
  [roomId, excludeContractId ?? null]
)).rows[0] ?? null;

export const findTenantForUpdate = async (client: RentalRegistrationClient, tenantId: string, managerId: string) => (
  await client.query<RentalRegistrationRow>(
    `SELECT id, user_id, manager_user_id, full_name, dob, gender, identity_number,
            identity_issued_date, identity_issued_place, email, phone, permanent_address,
            status, note, created_at, updated_at
     FROM tenant
     WHERE id=$1 AND manager_user_id=$2 AND status <> 'DELETED'
     LIMIT 1 FOR UPDATE`,
    [tenantId, managerId]
  )
).rows[0] ?? null;

export const findTenantCurrentRegistration = async (client: RentalRegistrationClient, tenantId: string) => (
  await client.query<{ id: string }>(
    `SELECT c.id FROM contract c JOIN contract_tenant ct ON ct.contract_id=c.id
     WHERE ct.tenant_id=$1 AND c.status IN ('DRAFT', 'ACTIVE')
       AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
       AND (c.move_out_date IS NULL OR c.move_out_date >= CURRENT_DATE)
       AND (ct.left_at IS NULL OR ct.left_at >= CURRENT_DATE)
     LIMIT 1`,
    [tenantId]
  )
).rows[0] ?? null;

export const findDuplicateTenant = async (
  client: RentalRegistrationClient,
  managerId: string,
  phone: string,
  identityNumber: string
) => (await client.query<{ id: string }>(
  `SELECT id FROM tenant
   WHERE manager_user_id=$1 AND status <> 'DELETED'
     AND (phone=$2 OR identity_number=$3)
   LIMIT 1`,
  [managerId, phone, identityNumber]
)).rows[0] ?? null;

export const insertTenant = async (client: RentalRegistrationClient, managerId: string, tenant: TenantDraftRecord) => (
  await client.query<{ id: string }>(
    `INSERT INTO tenant(manager_user_id,full_name,dob,gender,identity_number,identity_issued_date,identity_issued_place,email,phone,permanent_address,status,note)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11)
     RETURNING id`,
    [managerId, tenant.full_name, tenant.dob ?? null, tenant.gender ?? null, tenant.identity_number,
      tenant.identity_issued_date ?? null, tenant.identity_issued_place ?? null, tenant.email ?? null,
      tenant.phone, tenant.permanent_address ?? null, tenant.note ?? null]
  )
).rows[0];

export const insertDraftContract = async (client: RentalRegistrationClient, payload: DraftContractRecord, code: string, note: string) => (
  await client.query<RentalRegistrationRow>(
    `INSERT INTO contract(room_id,contract_code,status,start_date,end_date,move_in_date,move_out_date,rent_price,deposit_amount,billing_day,note)
     VALUES($1,$2,'DRAFT',$3,$4,NULL,NULL,$5,$6,$7,$8)
     RETURNING ${contractColumns}`,
    [payload.room_id, code, payload.start_date, payload.end_date ?? null, payload.rent_price,
      payload.deposit_amount, payload.billing_day, note]
  )
).rows[0];

export const insertPrimaryTenant = async (
  client: RentalRegistrationClient,
  contractId: string,
  tenantId: string,
  joinedAt: string
) => client.query(
  `INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at,left_at)
   VALUES($1,$2,true,$3,NULL)`,
  [contractId, tenantId, joinedAt]
);

export const listActiveContractTenants = async (client: RentalRegistrationClient, contractId: string) => (
  await client.query<RentalRegistrationRow>(
    `SELECT t.id, t.user_id, t.manager_user_id, t.full_name, t.dob, t.gender,
            t.identity_number, t.identity_issued_date, t.identity_issued_place,
            t.email, t.phone, t.permanent_address, t.status, t.note, t.created_at, t.updated_at
     FROM contract_tenant ct JOIN tenant t ON t.id=ct.tenant_id
     WHERE ct.contract_id=$1 AND ct.left_at IS NULL`,
    [contractId]
  )
).rows;

export const findOtherActiveTenantContract = async (
  client: RentalRegistrationClient,
  contractId: string,
  tenantIds: string[]
) => (await client.query<{ id: string }>(
  `SELECT c.id FROM contract c
   JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
   WHERE c.status='ACTIVE' AND c.id<>$1 AND ct.tenant_id = ANY($2::uuid[])
   LIMIT 1`,
  [contractId, tenantIds]
)).rows[0] ?? null;

export const upsertHandoverReading = async (
  client: RentalRegistrationClient,
  roomId: string,
  month: string,
  electricity: number,
  water: number,
  managerId: string,
  note: string
) => client.query(
  `INSERT INTO utility_reading(room_id,month,electricity_prev,electricity_curr,water_prev,water_curr,status,reported_by_user_id,reported_at,verified_by_user_id,verified_at,approved_by_user_id,approved_at,note)
   VALUES($1,$2,$3,$3,$4,$4,'APPROVED',$5,now(),$5,now(),$5,now(),$6)
   ON CONFLICT (room_id, month) DO UPDATE SET
     electricity_prev=EXCLUDED.electricity_prev, electricity_curr=EXCLUDED.electricity_curr,
     water_prev=EXCLUDED.water_prev, water_curr=EXCLUDED.water_curr, status='APPROVED',
     verified_by_user_id=EXCLUDED.verified_by_user_id, verified_at=now(),
     approved_by_user_id=EXCLUDED.approved_by_user_id, approved_at=now(), note=EXCLUDED.note`,
  [roomId, month, electricity, water, managerId, note]
);

export const upsertRoomMonthExtra = async (
  client: RentalRegistrationClient,
  roomId: string,
  month: string,
  personsCount: number,
  vehiclesCount: number,
  managerId: string,
  note: string | null
) => client.query(
  `INSERT INTO room_month_extra(room_id,month,persons_count,vehicles_count,reported_by_user_id,reported_at,note)
   VALUES($1,$2,$3,$4,$5,now(),$6)
   ON CONFLICT (room_id, month) DO UPDATE SET
     persons_count=EXCLUDED.persons_count, vehicles_count=EXCLUDED.vehicles_count,
     reported_by_user_id=EXCLUDED.reported_by_user_id, reported_at=now(), note=EXCLUDED.note`,
  [roomId, month, personsCount, vehiclesCount, managerId, note]
);

export const activateContract = async (
  client: RentalRegistrationClient,
  contractId: string,
  moveInDate: string,
  note: string | null
) => (await client.query<RentalRegistrationRow>(
  `UPDATE contract SET status='ACTIVE', start_date=$2, move_in_date=$2,
     note=CASE WHEN $3::text IS NULL THEN note ELSE CONCAT(COALESCE(note, ''), E'\n', $3::text) END
   WHERE id=$1 RETURNING ${contractColumns}`,
  [contractId, moveInDate, note]
)).rows[0];

export const cancelContract = async (
  client: RentalRegistrationClient,
  contractId: string,
  closeDate: string,
  reason: string
) => (await client.query<RentalRegistrationRow>(
  `UPDATE contract SET status='CANCELLED',
     move_out_date=CASE WHEN move_in_date IS NULL THEN NULL ELSE GREATEST(move_in_date, $2::date) END,
     note=CONCAT(COALESCE(note, ''), E'\nCancel reason: ', $3::text)
   WHERE id=$1 RETURNING ${contractColumns}`,
  [contractId, closeDate, reason]
)).rows[0];

export const closeContractTenants = async (client: RentalRegistrationClient, contractId: string, closeDate: string) => client.query(
  `UPDATE contract_tenant SET left_at=COALESCE(left_at, GREATEST(joined_at, $1::date))
   WHERE contract_id=$2 AND left_at IS NULL`,
  [closeDate, contractId]
);
