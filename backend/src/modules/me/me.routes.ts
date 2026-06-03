import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { firstDayOfMonth } from '../../shared/utils/date';
import { AppError } from '../../shared/errors/app-error';
import { parseBody } from '../../shared/utils/validation';
import { validateStoredUpload } from '../uploads/uploads.service';

const router = Router();
router.use(requireRole('TENANT'));

const tenantDocumentSchema = z.object({
  doc_type: z.enum(['IDENTITY_FRONT', 'IDENTITY_BACK', 'RESIDENCE', 'OTHER']),
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().url(),
  mime_type: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive(),
  note: z.string().trim().nullable().optional()
});

const getCurrentTenantId = async (userId: string): Promise<string> => {
  const tenantRs = await query<{ id: string }>(
    `SELECT id
     FROM tenant
     WHERE user_id=$1 AND status <> 'DELETED'
     LIMIT 1`,
    [userId]
  );
  const tenant = tenantRs.rows[0];
  if (!tenant) throw new AppError(404, 'Tenant profile not found', 'TENANT_NOT_FOUND');
  return tenant.id;
};

const tenantInvoiceProjection = `
  i.*,
  COALESCE(room_rent.amount, 0)::float AS rent_amount,
  COALESCE(electricity.amount, 0)::float AS electric_amount,
  COALESCE(water.amount, 0)::float AS water_amount,
  COALESCE(other_fee.amount, GREATEST(i.subtotal - COALESCE(room_rent.amount, 0) - COALESCE(electricity.amount, 0) - COALESCE(water.amount, 0), 0), 0)::float AS other_amount,
  COALESCE(paid_payment.amount, 0)::float AS paid_amount,
  COALESCE(latest_success_payment.status, latest_payment.status) AS payment_status,
  latest_success_payment.paid_at
`;

const tenantInvoiceJoins = `
  LEFT JOIN LATERAL (
    SELECT * FROM invoice_item WHERE invoice_id=i.id AND code='ROOM_RENT' ORDER BY created_at DESC LIMIT 1
  ) room_rent ON true
  LEFT JOIN LATERAL (
    SELECT * FROM invoice_item WHERE invoice_id=i.id AND code='ELECTRICITY' ORDER BY created_at DESC LIMIT 1
  ) electricity ON true
  LEFT JOIN LATERAL (
    SELECT * FROM invoice_item WHERE invoice_id=i.id AND code='WATER' ORDER BY created_at DESC LIMIT 1
  ) water ON true
  LEFT JOIN LATERAL (
    SELECT * FROM invoice_item WHERE invoice_id=i.id AND code='OTHER' ORDER BY created_at DESC LIMIT 1
  ) other_fee ON true
  LEFT JOIN LATERAL (
    SELECT p.status, p.paid_at
    FROM payment p
    WHERE p.invoice_id=i.id
    ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
    LIMIT 1
  ) latest_payment ON true
  LEFT JOIN LATERAL (
    SELECT p.status, p.paid_at
    FROM payment p
    WHERE p.invoice_id=i.id AND p.status='SUCCEEDED'
    ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
    LIMIT 1
  ) latest_success_payment ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount), 0) AS amount
    FROM payment p
    WHERE p.invoice_id=i.id AND p.status='SUCCEEDED'
  ) paid_payment ON true
`;

router.get('/room', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT
       t.id AS tenant_id,
       t.user_id AS tenant_user_id,
       t.full_name AS tenant_name,
       t.gender AS tenant_gender,
       t.phone AS tenant_phone,
       t.status AS tenant_status,
       r.id AS room_id,
       r.building_id,
       r.code AS room_code,
       r.floor AS room_floor,
       r.area_m2 AS room_area_m2,
       r.status AS room_status,
       r.base_rent,
       r.max_occupants,
       r.note AS room_note,
       b.code AS building_code,
       b.name AS building_name,
       b.manager_user_id,
       c.id AS contract_id,
       c.status AS contract_status,
       c.start_date,
       c.move_in_date,
       c.rent_price
     FROM tenant t
     JOIN contract_tenant ct ON ct.tenant_id=t.id AND ct.left_at IS NULL
     JOIN contract c ON c.id=ct.contract_id AND c.status='ACTIVE'
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE t.user_id=$1
     ORDER BY ct.joined_at DESC
     LIMIT 1`,
    [req.auth!.userId]
  );
  res.json(rows[0] ?? null);
}));

router.get('/documents', asyncHandler(async (req, res) => {
  const tenantId = await getCurrentTenantId(req.auth!.userId);
  const { rows } = await query(
    `SELECT *
     FROM tenant_document
     WHERE tenant_id=$1
     ORDER BY uploaded_at DESC, created_at DESC`,
    [tenantId]
  );
  res.json(rows);
}));

router.post('/documents', asyncHandler(async (req, res) => {
  const body = parseBody(tenantDocumentSchema, req.body);
  validateStoredUpload('TENANT_DOCUMENT', body, req.auth!.role);

  const tenantId = await getCurrentTenantId(req.auth!.userId);
  const { rows } = await query(
    `INSERT INTO tenant_document(tenant_id,doc_type,file_name,file_url,mime_type,file_size,uploaded_by_user_id,note)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      tenantId,
      body.doc_type,
      body.file_name ?? null,
      body.file_url,
      body.mime_type,
      body.file_size,
      req.auth!.userId,
      body.note ?? null
    ]
  );
  res.status(201).json(rows[0]);
}));

router.get('/roommates', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT
       t.id AS tenant_id,
       t.full_name,
       t.gender,
       t.phone,
       ct.joined_at,
       ct.is_primary
     FROM tenant t
     JOIN contract_tenant ct ON ct.tenant_id=t.id AND ct.left_at IS NULL
     WHERE ct.contract_id = (
      SELECT contract_id
      FROM vw_tenant_current_room
      WHERE tenant_id = (SELECT id FROM tenant WHERE user_id=$1)
      ORDER BY start_date DESC
      LIMIT 1
     )
     ORDER BY ct.is_primary DESC, ct.joined_at ASC, t.full_name ASC`,
    [req.auth!.userId]
  );
  res.json(rows);
}));

router.get('/current-bill', asyncHandler(async (req, res) => {
  const month = firstDayOfMonth();
  const { rows } = await query(
    `SELECT ${tenantInvoiceProjection}, pr.id as payment_request_id, pr.status as payment_request_status
     FROM invoice i
     JOIN vw_tenant_current_room v ON v.contract_id=i.contract_id
     ${tenantInvoiceJoins}
     LEFT JOIN payment_request pr ON pr.invoice_id=i.id
     WHERE v.tenant_id=(SELECT id FROM tenant WHERE user_id=$1) AND i.month=$2`,
    [req.auth!.userId, month]
  );
  res.json(rows[0] ?? null);
}));

router.get('/utility-readings', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ur.* FROM utility_reading ur
     JOIN vw_tenant_current_room v ON v.room_id=ur.room_id
     WHERE v.tenant_id=(SELECT id FROM tenant WHERE user_id=$1)
     ORDER BY month DESC LIMIT 12`,
    [req.auth!.userId]
  );
  res.json(rows);
}));

router.get('/payment-status', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${tenantInvoiceProjection}, pr.id AS payment_request_id, pr.status AS payment_request_status
     FROM invoice i
     JOIN vw_tenant_current_room v ON v.contract_id=i.contract_id
     ${tenantInvoiceJoins}
     LEFT JOIN payment_request pr ON pr.invoice_id=i.id
     WHERE v.tenant_id=(SELECT id FROM tenant WHERE user_id=$1)
     ORDER BY i.month DESC LIMIT 12`,
    [req.auth!.userId]
  );
  res.json(rows);
}));

router.get('/invoices/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${tenantInvoiceProjection}, pr.id AS payment_request_id, pr.status AS payment_request_status
     FROM invoice i
     JOIN vw_tenant_current_room v ON v.contract_id=i.contract_id
     ${tenantInvoiceJoins}
     LEFT JOIN payment_request pr ON pr.invoice_id=i.id
     WHERE v.tenant_id=(SELECT id FROM tenant WHERE user_id=$1) AND i.id=$2`,
    [req.auth!.userId, req.params.id]
  );
  const invoice = rows[0];
  if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');

  const [items, payments] = await Promise.all([
    query('SELECT * FROM invoice_item WHERE invoice_id=$1 ORDER BY created_at', [req.params.id]),
    query(
      `SELECT *
       FROM payment
       WHERE invoice_id=$1
       ORDER BY paid_at DESC NULLS LAST, created_at DESC`,
      [req.params.id]
    )
  ]);

  res.json({ ...invoice, items: items.rows, payments: payments.rows });
}));

export default router;
