import { Router } from 'express';
import { query, withTransaction } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { AppError } from '../../shared/errors/app-error';
import { createTenant as createTenantService } from './tenants.service';

const router = Router();

const parseIntParam = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

router.get('/', requireRole('MANAGER'), async (req, res) => {
  const page = parseIntParam(req.query.page, 1);
  const pageSize = Math.min(parseIntParam(req.query.pageSize, 10), 100);
  const offset = (page - 1) * pageSize;

  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const buildingId = String(req.query.building_id ?? '').trim();
  const roomId = String(req.query.room_id ?? '').trim();

  const conditions: string[] = [];
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

  const countRs = await query(
    `SELECT COUNT(*)::int AS total
     FROM tenant t
     LEFT JOIN vw_tenant_current_room v ON v.tenant_id = t.id
     ${whereClause}`,
    params
  );

  params.push(pageSize, offset);

  const dataRs = await query(
    `SELECT t.*, v.room_id, v.room_code, v.building_id, v.building_name, v.contract_id, v.start_date,
            c.status AS contract_status
     FROM tenant t
     LEFT JOIN vw_tenant_current_room v ON v.tenant_id = t.id
     LEFT JOIN contract c ON c.id = v.contract_id
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
});

router.get('/:id', requireRole('MANAGER'), async (req, res) => {
  const tenantRs = await query('SELECT * FROM tenant WHERE id=$1', [req.params.id]);
  const tenant = tenantRs.rows[0];
  if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

  const [roomRs, contractRs] = await Promise.all([
    query('SELECT * FROM vw_tenant_current_room WHERE tenant_id=$1', [req.params.id]),
    query(`SELECT c.* FROM contract c JOIN contract_tenant ct ON ct.contract_id=c.id WHERE ct.tenant_id=$1 AND ct.left_at IS NULL ORDER BY c.created_at DESC LIMIT 1`, [req.params.id])
  ]);

  res.json({ ...tenant, current_room: roomRs.rows[0] ?? null, current_contract: contractRs.rows[0] ?? null });
});

router.post('/', requireRole('MANAGER'), async (req, res) => {
  const result = await createTenantService(req.body as Record<string, unknown>);
  res.status(201).json({
    message: 'Tenant created successfully',
    tenantId: result.tenantId,
    emailSent: result.emailSent
  });
});

router.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  const b = req.body as Record<string, unknown>;
  const tenantPayload = (b.tenant ?? b) as Record<string, unknown>;
  const allowed = ['full_name', 'dob', 'gender', 'identity_number', 'identity_issued_date', 'identity_issued_place', 'email', 'phone', 'permanent_address', 'status', 'note'];
  const entries = allowed.filter((field) => Object.prototype.hasOwnProperty.call(tenantPayload, field) && tenantPayload[field] !== undefined);
  if (entries.length === 0) throw new AppError(400, 'No fields to update', 'VALIDATION_ERROR');

  const params: unknown[] = [];
  const sets = entries.map((field) => {
    params.push(tenantPayload[field] ?? null);
    return `${field}=$${params.length}`;
  });
  params.push(req.params.id);

  const updated = await query(`UPDATE tenant SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`, params);
  if (!updated.rows[0]) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  res.json(updated.rows[0]);
});

router.delete('/:id', requireRole('MANAGER'), async (req, res) => {
  const rs = await query(`UPDATE tenant SET status='MOVED_OUT' WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!rs.rows[0]) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  res.status(204).send();
});

router.get('/:id/contracts', requireRole('MANAGER'), async (req, res) => {
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
});
router.get('/:id/invoices', requireRole('MANAGER'), async (req, res) => {
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
});
router.get('/:id/payments', requireRole('MANAGER'), async (req, res) => {
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
});
router.post('/:id/export-contract', requireRole('MANAGER'), async (req, res) => {
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
});

export default router;
