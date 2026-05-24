import { Router } from 'express';
import { query, withTransaction } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import {
  createTenant as createTenantService,
  createTenantContract,
  normalizeTenantContractInput,
  validateTenantContractRoom
} from './tenants.service';

const router = Router();

interface TenantListRow {
  id: string;
  user_id: string | null;
  full_name: string;
  dob: string | null;
  gender: string | null;
  identity_number: string;
  identity_issued_date: string | null;
  identity_issued_place: string | null;
  email: string | null;
  phone: string;
  permanent_address: string | null;
  status: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  room_id: string | null;
  room_code: string | null;
  building_id: string | null;
  building_name: string | null;
  contract_id: string | null;
  start_date: string | null;
  contract_status: string | null;
}

interface CountRow {
  total: number;
}

interface TenantDeleteRow {
  id: string;
  user_id: string | null;
}

const upsertTenantContract = async (client: Parameters<Parameters<typeof withTransaction>[0]>[0], tenantId: string, contractInput: Record<string, unknown> | null) => {
  if (!contractInput) return;

  const payload = normalizeTenantContractInput(contractInput);

  const activeRs = await client.query<{ contract_id: string; room_id: string; joined_at: string }>(
    `SELECT ct.contract_id, c.room_id, ct.joined_at::text
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     WHERE ct.tenant_id=$1 AND ct.left_at IS NULL AND c.status NOT IN ('ENDED','CANCELLED')
     ORDER BY (c.status='ACTIVE') DESC, ct.joined_at DESC, c.created_at DESC
     LIMIT 1`,
    [tenantId]
  );

  const current = activeRs.rows[0];
  if (!current) {
    await createTenantContract(client, tenantId, contractInput);
    return;
  }

  if (current.room_id !== payload.room_id) {
    await validateTenantContractRoom(client, payload);
    const leftAt = payload.start_date > current.joined_at ? payload.start_date : current.joined_at;
    await client.query(
      'UPDATE contract_tenant SET left_at=$1 WHERE contract_id=$2 AND tenant_id=$3 AND left_at IS NULL',
      [leftAt, current.contract_id, tenantId]
    );
    await client.query(
      `UPDATE contract
       SET status='ENDED', end_date=COALESCE(end_date, $1), move_out_date=COALESCE(move_out_date, $1)
       WHERE id=$2`,
      [leftAt, current.contract_id]
    );
    await createTenantContract(client, tenantId, contractInput);
    return;
  }

  await validateTenantContractRoom(client, payload, current.contract_id);
  await client.query(
    `UPDATE contract SET room_id=$1,status=$2,start_date=$3,end_date=$4,move_in_date=$5,move_out_date=$6,rent_price=$7,deposit_amount=$8,billing_day=$9,note=$10
     WHERE id=$11`,
    [payload.room_id, payload.status, payload.start_date, payload.end_date, payload.move_in_date, payload.move_out_date, payload.rent_price, payload.deposit_amount, payload.billing_day, payload.note, current.contract_id]
  );
  await client.query(
    'UPDATE contract_tenant SET joined_at=$1 WHERE contract_id=$2 AND tenant_id=$3 AND left_at IS NULL',
    [payload.start_date, current.contract_id, tenantId]
  );
};

const parseIntParam = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const page = parseIntParam(req.query.page, 1);
  const pageSize = Math.min(parseIntParam(req.query.pageSize, 10), 100);
  const offset = (page - 1) * pageSize;

  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const buildingId = String(req.query.building_id ?? '').trim();
  const roomId = String(req.query.room_id ?? '').trim();

  const conditions: string[] = [`t.status <> 'DELETED'`];
  const params: unknown[] = [];

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(`(t.full_name ILIKE $${idx} OR t.phone ILIKE $${idx} OR COALESCE(t.email::text,'') ILIKE $${idx} OR t.identity_number ILIKE $${idx} OR COALESCE(v.room_code,'') ILIKE $${idx} OR COALESCE(v.building_name,'') ILIKE $${idx})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (buildingId) {
    params.push(buildingId);
    conditions.push(`v.building_id = $${params.length}`);
  }
  if (roomId) {
    params.push(roomId);
    conditions.push(`v.room_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const currentRentalJoin = `
     LEFT JOIN LATERAL (
       SELECT c.room_id, r.code AS room_code, b.id AS building_id, b.name AS building_name,
              c.id AS contract_id, c.start_date, c.status AS contract_status
       FROM contract_tenant ct
       JOIN contract c ON c.id=ct.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ct.tenant_id=t.id AND ct.left_at IS NULL AND c.status NOT IN ('ENDED','CANCELLED')
       ORDER BY (c.status='ACTIVE') DESC, c.start_date DESC, c.created_at DESC
       LIMIT 1
     ) v ON true`;

  const countRs = await query<CountRow>(
    `SELECT COUNT(*)::int AS total
     FROM tenant t
     ${currentRentalJoin}
     ${whereClause}`,
    params
  );

  params.push(pageSize, offset);

  const dataRs = await query<TenantListRow>(
    `SELECT t.*, v.room_id, v.room_code, v.building_id, v.building_name, v.contract_id, v.start_date,
            v.contract_status
     FROM tenant t
     ${currentRentalJoin}
     ${whereClause}
     ORDER BY t.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const items = dataRs.rows.map((row) => ({
    ...row,
    current_room: row.room_id
      ? {
          tenant_id: row.id,
          room_id: row.room_id,
          room_code: row.room_code,
          building_id: row.building_id,
          building_name: row.building_name,
          contract_id: row.contract_id,
          start_date: row.start_date,
          contract_status: row.contract_status
        }
      : null
  }));

  res.json({ items, page, pageSize, total: countRs.rows[0]?.total ?? 0 });
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const tenantRs = await query('SELECT * FROM tenant WHERE id=$1 AND status <> $2', [req.params.id, 'DELETED']);
  const tenant = tenantRs.rows[0];
  if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

  const [roomRs, contractRs] = await Promise.all([
    query(
      `SELECT t.id AS tenant_id, t.full_name, t.phone, t.identity_number,
              c.room_id, r.code AS room_code, b.id AS building_id, b.name AS building_name,
              c.id AS contract_id, c.start_date, c.status AS contract_status
       FROM tenant t
       JOIN contract_tenant ct ON ct.tenant_id=t.id AND ct.left_at IS NULL
       JOIN contract c ON c.id=ct.contract_id AND c.status NOT IN ('ENDED','CANCELLED')
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE t.id=$1
       ORDER BY (c.status='ACTIVE') DESC, c.start_date DESC, c.created_at DESC
       LIMIT 1`,
      [req.params.id]
    ),
    query(
      `SELECT c.* FROM contract c
       JOIN contract_tenant ct ON ct.contract_id=c.id
       WHERE ct.tenant_id=$1 AND ct.left_at IS NULL AND c.status NOT IN ('ENDED','CANCELLED')
       ORDER BY (c.status='ACTIVE') DESC, c.created_at DESC
       LIMIT 1`,
      [req.params.id]
    )
  ]);

  res.json({ ...tenant, current_room: roomRs.rows[0] ?? null, current_contract: contractRs.rows[0] ?? null });
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const result = await createTenantService(req.body as Record<string, unknown>);
  res.status(201).json({
    message: 'Tenant created successfully',
    tenantId: result.tenantId,
    userId: result.userId,
    emailSent: result.emailSent
  });
}));

router.patch('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const tenantPayload = (b.tenant ?? b) as Record<string, unknown>;
  const allowed = ['full_name', 'dob', 'gender', 'identity_number', 'identity_issued_date', 'identity_issued_place', 'email', 'phone', 'permanent_address', 'status', 'note'];
  const entries = allowed.filter((field) => Object.prototype.hasOwnProperty.call(tenantPayload, field) && tenantPayload[field] !== undefined);
  const contractPayload = (b.contract as Record<string, unknown> | null | undefined) ?? null;
  if (entries.length === 0 && !contractPayload) throw new AppError(400, 'No fields to update', 'VALIDATION_ERROR');

  const params: unknown[] = [];
  const sets = entries.map((field) => {
    params.push(tenantPayload[field] ?? null);
    return `${field}=$${params.length}`;
  });
  params.push(req.params.id);

  const result = await withTransaction(async (client) => {
    const updated =
      entries.length > 0
        ? await client.query(`UPDATE tenant SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`, params)
        : await client.query('SELECT * FROM tenant WHERE id=$1', [req.params.id]);
    if (!updated.rows[0]) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
    await upsertTenantContract(client, req.params.id, contractPayload);
    return updated.rows[0];
  });
  res.json(result);
}));

router.delete('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  await withTransaction(async (client) => {
    const tenantRs = await client.query<TenantDeleteRow>(
      'SELECT id, user_id FROM tenant WHERE id=$1 AND status <> $2 FOR UPDATE',
      [req.params.id, 'DELETED']
    );
    const tenant = tenantRs.rows[0];
    if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

    const activeAssignmentRs = await client.query<{ id: string }>(
      `SELECT c.id
       FROM contract_tenant ct
       JOIN contract c ON c.id=ct.contract_id
       WHERE ct.tenant_id=$1
         AND ct.left_at IS NULL
         AND c.status NOT IN ('ENDED','CANCELLED')
       LIMIT 1`,
      [tenant.id]
    );
    if (activeAssignmentRs.rows[0]) {
      throw new AppError(400, 'Không thể xóa người thuê đang có hợp đồng hoặc phòng đang thuê', 'TENANT_HAS_ACTIVE_CONTRACT');
    }

    const unpaidInvoiceRs = await client.query<{ id: string }>(
      `SELECT i.id
       FROM contract_tenant ct
       JOIN invoice i ON i.contract_id=ct.contract_id
       WHERE ct.tenant_id=$1
         AND i.status NOT IN ('PAID','VOID')
       LIMIT 1`,
      [tenant.id]
    );
    if (unpaidInvoiceRs.rows[0]) {
      throw new AppError(400, 'Không thể xóa người thuê còn hóa đơn chưa thanh toán', 'TENANT_HAS_UNPAID_INVOICE');
    }

    await client.query(
      `UPDATE tenant
       SET status='DELETED', user_id=NULL
       WHERE id=$1`,
      [tenant.id]
    );

    if (tenant.user_id) {
      await client.query('UPDATE app_user SET is_active=false WHERE id=$1', [tenant.user_id]);
    }
  });

  res.status(204).send();
}));

router.get('/:id/contracts', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const rs = await query(
    `SELECT c.*, r.code AS room_code, b.id AS building_id, b.name AS building_name, ct.is_primary, ct.joined_at, ct.left_at
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ct.tenant_id=$1
     ORDER BY c.start_date DESC`,
    [req.params.id]
  );
  res.json(rs.rows);
}));
router.get('/:id/invoices', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const rs = await query(
    `SELECT i.*, c.contract_code, r.code AS room_code, b.name AS building_name
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     JOIN invoice i ON i.contract_id=c.id
     JOIN room r ON r.id=i.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ct.tenant_id=$1
     ORDER BY i.month DESC, i.created_at DESC`,
    [req.params.id]
  );
  res.json(rs.rows);
}));
router.get('/:id/payments', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const rs = await query(
    `SELECT p.*, i.month, i.total AS invoice_total, i.status AS invoice_status, i.due_date, i.id AS invoice_id
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     JOIN invoice i ON i.contract_id=c.id
     JOIN payment p ON p.invoice_id=i.id
     WHERE ct.tenant_id=$1
     ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC`,
    [req.params.id]
  );
  res.json(rs.rows);
}));
router.post('/:id/export-contract', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const detailRs = await query(
    `SELECT t.full_name tenant_name,t.phone,t.email,t.identity_number,t.permanent_address,
            c.contract_code,c.start_date,c.end_date,c.rent_price,c.deposit_amount,c.billing_day,c.note contract_note,
            r.code room_code,r.floor,r.area_m2,b.name building_name,b.address
     FROM tenant t
     JOIN contract_tenant ct ON ct.tenant_id=t.id AND ct.left_at IS NULL
     JOIN contract c ON c.id=ct.contract_id AND c.status='ACTIVE'
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE t.id=$1
     LIMIT 1`,
    [req.params.id]
  );
  const row = detailRs.rows[0];
  if (!row) throw new AppError(400, 'Missing active contract/room/building data for export', 'EXPORT_DATA_MISSING');
  res.json(row);
}));

export default router;
