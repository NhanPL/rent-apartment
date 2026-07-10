import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { parseBody } from '../../shared/utils/validation';
import { businessStageSql, getContractBusinessStage } from '../contracts/business-stage';

const router = Router();
type DbRow = Record<string, any>;
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];
type Queryable = Pick<TxClient, 'query'>;

const nullableString = z.string().trim().nullable().optional();

const tenantDraftSchema = z.object({
  full_name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  identity_number: z.string().trim().min(1),
  email: z.string().trim().email().nullable().optional(),
  dob: nullableString,
  gender: nullableString,
  identity_issued_date: nullableString,
  identity_issued_place: nullableString,
  permanent_address: nullableString,
  note: nullableString
});

const reserveSchema = z.object({
  room_id: z.string().uuid(),
  tenant_id: z.string().uuid().optional(),
  tenant: tenantDraftSchema.optional(),
  start_date: z.string().trim().min(1),
  end_date: nullableString,
  rent_price: z.coerce.number().nonnegative(),
  deposit_amount: z.coerce.number().nonnegative(),
  billing_day: z.coerce.number().int().min(1).max(28),
  note: nullableString
}).refine((body) => Boolean(body.tenant_id || body.tenant), {
  message: 'tenant_id or tenant is required'
});

const handoverSchema = z.object({
  move_in_date: z.string().trim().min(1),
  electricity_curr: z.coerce.number().nonnegative(),
  water_curr: z.coerce.number().nonnegative(),
  persons_count: z.coerce.number().int().nonnegative(),
  vehicles_count: z.coerce.number().int().nonnegative(),
  note: nullableString
});

const cancelSchema = z.object({
  reason: z.string().trim().min(1),
  cancel_date: z.string().trim().min(1).optional()
});

const firstDayOfMonth = (date: string): string => `${date.slice(0, 7)}-01`;

const generateContractCode = async (client: Queryable): Promise<string> => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 5; i += 1) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `CONTRACT-${datePart}-${random}`;
    const exists = await client.query('SELECT 1 FROM contract WHERE contract_code = $1 LIMIT 1', [code]);
    if (exists.rows.length === 0) return code;
  }
  throw new AppError(500, 'Unable to generate unique contract code', 'CONTRACT_CODE_ERROR');
};

const getScopedContract = async (client: Queryable, contractId: string, managerId: string, lock = false) => {
  const lockClause = lock ? 'FOR UPDATE OF c' : '';
  const { rows } = await client.query<DbRow>(
    `SELECT c.*, r.code AS room_code, r.max_occupants, b.id AS building_id, b.name AS building_name,
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
     ${lockClause}`,
    [contractId, managerId]
  );
  const contract = rows[0];
  if (!contract) throw new AppError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  return contract;
};

const assertRoomAvailable = async (client: Queryable, roomId: string, managerId: string) => {
  const { rows } = await client.query<DbRow>(
    `SELECT r.*
     FROM room r
     JOIN building b ON b.id=r.building_id
     WHERE r.id=$1 AND b.manager_user_id=$2
     FOR UPDATE OF r`,
    [roomId, managerId]
  );
  const room = rows[0];
  if (!room) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');
  if (room.status !== 'ACTIVE') throw new AppError(409, 'Room is not available for reservation', 'ROOM_NOT_AVAILABLE');

  const active = await client.query<{ id: string }>(
    `SELECT id
     FROM contract
     WHERE room_id=$1 AND status='ACTIVE'
     LIMIT 1`,
    [roomId]
  );
  if (active.rows[0]) throw new AppError(409, 'Selected room already has an active contract', 'ROOM_ALREADY_OCCUPIED');

  return room;
};

const assertTenantCanBeUsed = async (client: Queryable, tenantId: string, managerId: string, options: { allowBlacklistForDraft?: boolean } = {}) => {
  const { rows } = await client.query<DbRow>(
    `SELECT *
     FROM tenant
     WHERE id=$1 AND manager_user_id=$2 AND status <> 'DELETED'
     LIMIT 1`,
    [tenantId, managerId]
  );
  const tenant = rows[0];
  if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  if (!options.allowBlacklistForDraft && tenant.status === 'BLACKLIST') {
    throw new AppError(409, 'Blacklisted tenants cannot be activated', 'TENANT_BLACKLISTED');
  }
  return tenant;
};

router.get('/available-rooms', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const buildingId = String(req.query.building_id ?? '').trim();
  const params: unknown[] = [req.auth!.userId];
  const conditions = ['b.manager_user_id=$1', "r.status='ACTIVE'", 'active_contract.id IS NULL'];

  if (buildingId) {
    params.push(buildingId);
    conditions.push(`b.id=$${params.length}`);
  }

  const { rows } = await query<DbRow>(
    `SELECT r.id, r.building_id, r.code, r.floor, r.area_m2,
            r.base_rent, r.deposit_default, r.max_occupants,
            b.name AS building_name
     FROM room r
     JOIN building b ON b.id=r.building_id
     LEFT JOIN LATERAL (
       SELECT id
       FROM contract c
       WHERE c.room_id=r.id AND c.status='ACTIVE'
       LIMIT 1
     ) active_contract ON true
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.name, r.code`,
    params
  );

  res.json(rows);
}));

router.post('/reserve', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(reserveSchema, req.body);
  const data = await withTransaction(async (client) => {
    await assertRoomAvailable(client, body.room_id, req.auth!.userId);

    let tenantId = body.tenant_id;
    if (tenantId) {
      await assertTenantCanBeUsed(client, tenantId, req.auth!.userId, { allowBlacklistForDraft: true });
    } else if (body.tenant) {
      const duplicate = await client.query<{ id: string }>(
        `SELECT id
         FROM tenant
         WHERE manager_user_id=$1
           AND status <> 'DELETED'
           AND (phone=$2 OR identity_number=$3)
         LIMIT 1`,
        [req.auth!.userId, body.tenant.phone, body.tenant.identity_number]
      );
      if (duplicate.rows[0]) throw new AppError(409, 'Tenant phone or identity number already exists', 'TENANT_DUPLICATE');

      const createdTenant = await client.query<{ id: string }>(
        `INSERT INTO tenant(manager_user_id,full_name,dob,gender,identity_number,identity_issued_date,identity_issued_place,email,phone,permanent_address,status,note)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE',$11)
         RETURNING id`,
        [
          req.auth!.userId,
          body.tenant.full_name,
          body.tenant.dob ?? null,
          body.tenant.gender ?? null,
          body.tenant.identity_number,
          body.tenant.identity_issued_date ?? null,
          body.tenant.identity_issued_place ?? null,
          body.tenant.email ?? null,
          body.tenant.phone,
          body.tenant.permanent_address ?? null,
          body.tenant.note ?? null
        ]
      );
      tenantId = createdTenant.rows[0].id;
    }

    if (!tenantId) throw new AppError(400, 'tenant_id or tenant is required', 'VALIDATION_ERROR');

    const code = await generateContractCode(client);
    const note = `[RR_STAGE=RESERVED] ${body.note ?? ''}`.trim();
    const contract = await client.query<DbRow>(
      `INSERT INTO contract(room_id,contract_code,status,start_date,end_date,move_in_date,move_out_date,rent_price,deposit_amount,billing_day,note)
       VALUES($1,$2,'DRAFT',$3,$4,NULL,NULL,$5,$6,$7,$8)
       RETURNING *`,
      [body.room_id, code, body.start_date, body.end_date ?? null, body.rent_price, body.deposit_amount, body.billing_day, note]
    );

    await client.query(
      `INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at,left_at)
       VALUES($1,$2,true,$3,NULL)`,
      [contract.rows[0].id, tenantId, body.start_date]
    );

    return { ...contract.rows[0], tenant_id: tenantId, business_stage: getContractBusinessStage(contract.rows[0]) };
  });

  res.status(201).json(data);
}));

router.post('/:contractId/handover', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(handoverSchema, req.body);
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.contractId, req.auth!.userId, true);
    if (contract.status === 'ACTIVE') return { ...contract, business_stage: 'ACTIVE' };
    if (contract.status !== 'DRAFT') throw new AppError(409, 'Only draft contracts can be handed over', 'CONTRACT_NOT_DRAFT');

    await assertRoomAvailable(client, contract.room_id, req.auth!.userId);

    const tenants = await client.query<DbRow>(
      `SELECT t.*
       FROM contract_tenant ct
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE ct.contract_id=$1 AND ct.left_at IS NULL`,
      [contract.id]
    );
    if (tenants.rows.length === 0) throw new AppError(409, 'Contract must have at least one tenant', 'CONTRACT_TENANT_REQUIRED');
    if (tenants.rows.length > Number(contract.max_occupants)) {
      throw new AppError(409, 'Room max occupants exceeded', 'ROOM_MAX_OCCUPANTS_EXCEEDED');
    }
    if (tenants.rows.some((tenant) => tenant.status === 'BLACKLIST')) {
      throw new AppError(409, 'Blacklisted tenants cannot be activated', 'TENANT_BLACKLISTED');
    }

    const activeTenantConflict = await client.query<{ id: string }>(
      `SELECT c.id
       FROM contract c
       JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
       WHERE c.status='ACTIVE'
         AND c.id<>$1
         AND ct.tenant_id = ANY($2::uuid[])
       LIMIT 1`,
      [contract.id, tenants.rows.map((tenant) => tenant.id)]
    );
    if (activeTenantConflict.rows[0]) {
      throw new AppError(409, 'Tenant already has another active contract', 'TENANT_HAS_ACTIVE_CONTRACT');
    }

    const month = firstDayOfMonth(body.move_in_date);
    await client.query(
      `INSERT INTO utility_reading(room_id,month,electricity_prev,electricity_curr,water_prev,water_curr,status,reported_by_user_id,reported_at,verified_by_user_id,verified_at,approved_by_user_id,approved_at,note)
       VALUES($1,$2,$3,$3,$4,$4,'APPROVED',$5,now(),$5,now(),$5,now(),$6)
       ON CONFLICT (room_id, month) DO UPDATE SET
         electricity_prev=EXCLUDED.electricity_prev,
         electricity_curr=EXCLUDED.electricity_curr,
         water_prev=EXCLUDED.water_prev,
         water_curr=EXCLUDED.water_curr,
         status='APPROVED',
         verified_by_user_id=EXCLUDED.verified_by_user_id,
         verified_at=now(),
         approved_by_user_id=EXCLUDED.approved_by_user_id,
         approved_at=now(),
         note=EXCLUDED.note`,
      [contract.room_id, month, body.electricity_curr, body.water_curr, req.auth!.userId, body.note ?? 'Initial handover reading']
    );

    await client.query(
      `INSERT INTO room_month_extra(room_id,month,persons_count,vehicles_count,reported_by_user_id,reported_at,note)
       VALUES($1,$2,$3,$4,$5,now(),$6)
       ON CONFLICT (room_id, month) DO UPDATE SET
         persons_count=EXCLUDED.persons_count,
         vehicles_count=EXCLUDED.vehicles_count,
         reported_by_user_id=EXCLUDED.reported_by_user_id,
         reported_at=now(),
         note=EXCLUDED.note`,
      [contract.room_id, month, body.persons_count, body.vehicles_count, req.auth!.userId, body.note ?? null]
    );

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET status='ACTIVE',
           start_date=$2,
           move_in_date=$2,
           note=CASE WHEN $3::text IS NULL THEN note ELSE CONCAT(COALESCE(note, ''), E'\n', $3::text) END
       WHERE id=$1
       RETURNING *`,
      [contract.id, body.move_in_date, body.note ? `Handover: ${body.note}` : null]
    );

    return { ...updated.rows[0], business_stage: 'ACTIVE' };
  });

  res.json(data);
}));

router.post('/:contractId/cancel', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(cancelSchema, req.body);
  const closeDate = body.cancel_date ?? new Date().toISOString().slice(0, 10);
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.contractId, req.auth!.userId, true);
    if (contract.status === 'ACTIVE') throw new AppError(409, 'Active contracts should be ended instead of cancelled', 'CONTRACT_ACTIVE');
    if (contract.status === 'ENDED') throw new AppError(409, 'Ended contracts cannot be cancelled', 'CONTRACT_ENDED');
    if (contract.status === 'CANCELLED') return { ...contract, business_stage: 'CANCELLED' };

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET status='CANCELLED',
           move_out_date=$2,
           note=CONCAT(COALESCE(note, ''), E'\nCancel reason: ', $3::text)
       WHERE id=$1
       RETURNING *`,
      [contract.id, closeDate, body.reason]
    );
    await client.query(
      `UPDATE contract_tenant
       SET left_at=COALESCE(left_at, GREATEST(joined_at, $1::date))
       WHERE contract_id=$2 AND left_at IS NULL`,
      [closeDate, contract.id]
    );

    return { ...updated.rows[0], business_stage: 'CANCELLED' };
  });

  res.json(data);
}));

export default router;
