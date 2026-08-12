import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { firstDayOfMonth } from '../../shared/utils/date';
import { AppError } from '../../shared/errors/app-error';
import { parseBody, registerUuidParams } from '../../shared/utils/validation';
import {
  cloudinaryDeliveryTypeValues,
  getDocumentRetentionUntil,
  normalizeStoredUpload,
  uploadResourceTypeValues
} from '../uploads/uploads.service';
import { presentDocumentAsset } from '../documents/document-assets.service';
import { getTenantDataExport } from '../tenants/tenant-privacy.service';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import type {
  ContractStatus,
  DatabaseDate,
  DatabaseNumeric,
  DatabaseTimestamp,
  InvoiceStatus,
  PaymentEntryType,
  PaymentRequestStatus,
  PaymentStatus,
  RoomStatus,
  TenantStatus,
  UtilityReadingStatus
} from '../../shared/types/database';
import { getInvoiceBranding, type InvoiceBranding } from '../invoice-branding/invoice-branding.service';

const router = Router();
registerUuidParams(router, ['id']);
router.use(requireRole('TENANT'));

interface TenantRoomRow {
  tenant_id: string;
  tenant_user_id: string;
  tenant_name: string;
  tenant_gender: string | null;
  tenant_phone: string;
  tenant_status: TenantStatus;
  room_id: string;
  building_id: string;
  room_code: string;
  room_floor: number | null;
  room_area_m2: DatabaseNumeric | null;
  room_status: RoomStatus;
  base_rent: DatabaseNumeric;
  max_occupants: number;
  room_note: string | null;
  building_code: string;
  building_name: string;
  manager_user_id: string;
  contract_id: string;
  contract_status: ContractStatus;
  start_date: DatabaseDate;
  move_in_date: DatabaseDate | null;
  rent_price: DatabaseNumeric;
}

interface TenantDocumentRow {
  id: string;
  tenant_id: string;
  doc_type: string;
  file_name: string | null;
  file_url: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by_user_id: string;
  uploaded_at: DatabaseTimestamp;
  note: string | null;
  cloudinary_asset_id: string | null;
  cloudinary_public_id: string | null;
  cloudinary_resource_type: string | null;
  cloudinary_version: number | null;
  cloudinary_format: string | null;
  cloudinary_delivery_type: string | null;
  retention_until: DatabaseTimestamp | null;
  created_at: DatabaseTimestamp;
}

interface RoommateRow {
  tenant_id: string;
  full_name: string;
  gender: string | null;
  phone: string;
  joined_at: DatabaseDate;
  is_primary: boolean;
}

interface TenantInvoiceRow {
  id: string;
  contract_id: string;
  room_id: string;
  utility_reading_id: string | null;
  month: DatabaseDate;
  status: InvoiceStatus;
  issued_at: DatabaseTimestamp | null;
  due_date: DatabaseDate | null;
  note: string | null;
  subtotal: DatabaseNumeric;
  discount: DatabaseNumeric;
  total: DatabaseNumeric;
  void_reason: string | null;
  voided_at: DatabaseTimestamp | null;
  replaces_invoice_id: string | null;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
  rent_amount: DatabaseNumeric;
  electric_amount: DatabaseNumeric;
  water_amount: DatabaseNumeric;
  other_amount: DatabaseNumeric;
  paid_amount: DatabaseNumeric;
  payment_status: PaymentStatus | null;
  paid_at: DatabaseTimestamp | null;
  payment_request_id: string | null;
  payment_request_status: PaymentRequestStatus | null;
  branding_snapshot: InvoiceBranding | null;
  manager_user_id: string;
}

interface UtilityReadingRow {
  id: string;
  room_id: string;
  month: DatabaseDate;
  electricity_prev: DatabaseNumeric;
  electricity_curr: DatabaseNumeric;
  water_prev: DatabaseNumeric;
  water_curr: DatabaseNumeric;
  status: UtilityReadingStatus;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  code: string;
  name: string;
  quantity: DatabaseNumeric;
  unit_price: DatabaseNumeric;
  amount: DatabaseNumeric;
  meta: Record<string, unknown> | null;
  created_at: DatabaseTimestamp;
}

interface PaymentRow {
  id: string;
  invoice_id: string;
  payment_request_id: string | null;
  payment_proof_id: string | null;
  method: string;
  status: PaymentStatus;
  amount: DatabaseNumeric;
  paid_at: DatabaseTimestamp | null;
  entry_type: PaymentEntryType;
  signed_amount: DatabaseNumeric;
}

const invoiceColumns = `i.id, i.contract_id, i.room_id, i.utility_reading_id, i.month,
  i.status, i.issued_at, i.due_date, i.note, i.subtotal, i.discount, i.total,
  i.void_reason, i.voided_at, i.replaces_invoice_id, i.branding_snapshot,
  i.created_at, i.updated_at`;
const tenantDocumentColumns = `id, tenant_id, doc_type, file_name, file_url, mime_type,
  file_size, uploaded_by_user_id, uploaded_at, note, cloudinary_asset_id,
  cloudinary_public_id, cloudinary_resource_type, cloudinary_version, cloudinary_format,
  cloudinary_delivery_type, retention_until, created_at`;
const utilityReadingColumns = `ur.id, ur.room_id, ur.month, ur.electricity_prev,
  ur.electricity_curr, ur.water_prev, ur.water_curr, ur.status, ur.reported_by_user_id,
  ur.reported_at, ur.submitted_at, ur.verified_by_user_id, ur.verified_at,
  ur.approved_by_user_id, ur.approved_at, ur.rejected_by_user_id, ur.rejected_at,
  ur.rejection_reason, ur.manager_note, ur.note, ur.created_at, ur.updated_at`;
const invoiceItemColumns = `id, invoice_id, code, name, quantity, unit_price,
  amount, meta, created_at`;
const paymentColumns = `p.id, p.invoice_id, p.payment_request_id, p.payment_proof_id,
  p.method, p.status, p.amount, p.paid_at, p.reference_code, p.note,
  p.created_by_user_id, p.entry_type, p.original_payment_id, p.reversal_reason,
  p.idempotency_key, p.created_at, p.updated_at`;

const tenantDocumentSchema = z.object({
  doc_type: z.enum(['IDENTITY_FRONT', 'IDENTITY_BACK', 'RESIDENCE', 'OTHER']),
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().url(),
  mime_type: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive(),
  resource_type: z.enum(uploadResourceTypeValues).optional(),
  public_id: z.string().trim().min(1).optional(),
  asset_id: z.string().trim().min(1).optional(),
  version: z.coerce.number().int().positive().optional(),
  format: z.string().trim().min(1).max(20).optional(),
  delivery_type: z.enum(cloudinaryDeliveryTypeValues).optional(),
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
  ${invoiceColumns},
  b.manager_user_id,
  COALESCE(room_rent.amount, 0)::float AS rent_amount,
  COALESCE(electricity.amount, 0)::float AS electric_amount,
  COALESCE(water.amount, 0)::float AS water_amount,
  COALESCE(other_fee.amount, GREATEST(i.subtotal - COALESCE(room_rent.amount, 0) - COALESCE(electricity.amount, 0) - COALESCE(water.amount, 0), 0), 0)::float AS other_amount,
  COALESCE(paid_payment.amount, 0)::float AS paid_amount,
  COALESCE(latest_success_payment.status, latest_payment.status) AS payment_status,
  latest_success_payment.paid_at
`;

const tenantInvoiceJoins = `
  JOIN room invoice_room ON invoice_room.id=i.room_id
  JOIN building b ON b.id=invoice_room.building_id
  LEFT JOIN LATERAL (
    SELECT amount FROM invoice_item WHERE invoice_id=i.id AND code='ROOM_RENT' ORDER BY created_at DESC LIMIT 1
  ) room_rent ON true
  LEFT JOIN LATERAL (
    SELECT amount FROM invoice_item WHERE invoice_id=i.id AND code='ELECTRICITY' ORDER BY created_at DESC LIMIT 1
  ) electricity ON true
  LEFT JOIN LATERAL (
    SELECT amount FROM invoice_item WHERE invoice_id=i.id AND code='WATER' ORDER BY created_at DESC LIMIT 1
  ) water ON true
  LEFT JOIN LATERAL (
    SELECT amount FROM invoice_item WHERE invoice_id=i.id AND code='OTHER' ORDER BY created_at DESC LIMIT 1
  ) other_fee ON true
  LEFT JOIN LATERAL (
    SELECT p.status, p.paid_at
    FROM payment p
    WHERE p.invoice_id=i.id AND p.entry_type='PAYMENT'
    ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
    LIMIT 1
  ) latest_payment ON true
  LEFT JOIN LATERAL (
    SELECT p.status, p.paid_at
    FROM payment p
    WHERE p.invoice_id=i.id AND p.status='SUCCEEDED' AND p.entry_type='PAYMENT'
    ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
    LIMIT 1
  ) latest_success_payment ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(CASE WHEN p.entry_type='REVERSAL' THEN -p.amount ELSE p.amount END), 0) AS amount
    FROM payment p
    WHERE p.invoice_id=i.id AND p.status='SUCCEEDED'
  ) paid_payment ON true
`;

const latestActivePaymentRequestJoin = `
  LEFT JOIN LATERAL (
    SELECT pr_scope.id, pr_scope.status
    FROM payment_request pr_scope
    WHERE pr_scope.invoice_id=i.id
      AND pr_scope.status NOT IN ('CANCELLED', 'EXPIRED')
    ORDER BY pr_scope.created_at DESC
    LIMIT 1
  ) pr ON true
`;

router.get('/room', asyncHandler(async (req, res) => {
  const { rows } = await query<TenantRoomRow>(
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
  const { rows } = await query<TenantDocumentRow>(
    `SELECT ${tenantDocumentColumns}
     FROM tenant_document
     WHERE tenant_id=$1
     ORDER BY uploaded_at DESC, created_at DESC`,
    [tenantId]
  );
  res.json(await Promise.all(
    rows.map((document) => presentDocumentAsset(req, 'TENANT_DOCUMENT', document as { id: string }, req.auth!))
  ));
}));

router.get('/data-export', asyncHandler(async (req, res) => {
  const payload = await withTransaction(async (client) => {
    const tenant = await client.query<{ id: string }>(
      `SELECT id FROM tenant WHERE user_id=$1 AND status <> 'DELETED' LIMIT 1`,
      [req.auth!.userId]
    );
    if (!tenant.rows[0]) throw new AppError(404, 'Tenant profile not found', 'TENANT_NOT_FOUND');
    const data = await getTenantDataExport(client, tenant.rows[0].id);
    await writeAuditLog(client, {
      actorUserId: req.auth!.userId,
      action: 'TENANT_DATA_EXPORTED',
      entityType: 'TENANT',
      entityId: tenant.rows[0].id,
      metadata: { scope: 'SELF' }
    });
    return data;
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json(payload);
}));

router.post('/documents', asyncHandler(async (req, res) => {
  const body = parseBody(tenantDocumentSchema, req.body);
  const asset = normalizeStoredUpload('TENANT_DOCUMENT', body, req.auth!.role, req.auth!.userId);

  const tenantId = await getCurrentTenantId(req.auth!.userId);
  const { rows } = await query<TenantDocumentRow>(
    `INSERT INTO tenant_document(
       tenant_id,doc_type,file_name,file_url,mime_type,file_size,uploaded_by_user_id,note,
       cloudinary_asset_id,cloudinary_public_id,cloudinary_resource_type,
       cloudinary_version,cloudinary_format,cloudinary_delivery_type,retention_until
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING ${tenantDocumentColumns}`,
    [
      tenantId,
      body.doc_type,
      body.file_name ?? null,
      null,
      body.mime_type,
      body.file_size,
      req.auth!.userId,
      body.note ?? null,
      asset.assetId,
      asset.publicId,
      asset.resourceType,
      asset.version,
      asset.format,
      asset.deliveryType,
      getDocumentRetentionUntil('TENANT_DOCUMENT')
    ]
  );
  res.status(201).json(await presentDocumentAsset(
    req,
    'TENANT_DOCUMENT',
    rows[0] as { id: string },
    req.auth!
  ));
}));

router.get('/roommates', asyncHandler(async (req, res) => {
  const { rows } = await query<RoommateRow>(
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
  const { rows } = await query<TenantInvoiceRow>(
    `SELECT ${tenantInvoiceProjection}, pr.id as payment_request_id, pr.status as payment_request_status
     FROM invoice i
     JOIN vw_tenant_current_room v ON v.contract_id=i.contract_id
     ${tenantInvoiceJoins}
     ${latestActivePaymentRequestJoin}
     WHERE v.tenant_id=(SELECT id FROM tenant WHERE user_id=$1) AND i.month=$2`,
    [req.auth!.userId, month]
  );
  res.json(rows[0] ?? null);
}));

router.get('/utility-readings', asyncHandler(async (req, res) => {
  const { rows } = await query<UtilityReadingRow>(
    `SELECT ${utilityReadingColumns} FROM utility_reading ur
     JOIN vw_tenant_current_room v ON v.room_id=ur.room_id
     WHERE v.tenant_id=(SELECT id FROM tenant WHERE user_id=$1)
     ORDER BY month DESC LIMIT 12`,
    [req.auth!.userId]
  );
  res.json(rows);
}));

router.get('/payment-status', asyncHandler(async (req, res) => {
  const { rows } = await query<TenantInvoiceRow>(
    `SELECT ${tenantInvoiceProjection}, pr.id AS payment_request_id, pr.status AS payment_request_status
     FROM invoice i
     JOIN vw_tenant_current_room v ON v.contract_id=i.contract_id
     ${tenantInvoiceJoins}
     ${latestActivePaymentRequestJoin}
     WHERE v.tenant_id=(SELECT id FROM tenant WHERE user_id=$1)
     ORDER BY i.month DESC LIMIT 12`,
    [req.auth!.userId]
  );
  res.json(rows);
}));

router.get('/invoices/:id', asyncHandler(async (req, res) => {
  const { rows } = await query<TenantInvoiceRow>(
    `SELECT ${tenantInvoiceProjection}, pr.id AS payment_request_id, pr.status AS payment_request_status
     FROM invoice i
     JOIN vw_tenant_current_room v ON v.contract_id=i.contract_id
     ${tenantInvoiceJoins}
     ${latestActivePaymentRequestJoin}
     WHERE v.tenant_id=(SELECT id FROM tenant WHERE user_id=$1) AND i.id=$2`,
    [req.auth!.userId, req.params.id]
  );
  const invoice = rows[0];
  if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');

  const [items, payments] = await Promise.all([
    query<InvoiceItemRow>(`SELECT ${invoiceItemColumns} FROM invoice_item WHERE invoice_id=$1 ORDER BY created_at`, [req.params.id]),
    query<PaymentRow>(
      `SELECT ${paymentColumns},
              CASE WHEN p.entry_type='REVERSAL' THEN -p.amount ELSE p.amount END::float AS signed_amount
       FROM payment p
       WHERE invoice_id=$1
       ORDER BY p.created_at DESC`,
      [req.params.id]
    )
  ]);

  const branding = invoice.branding_snapshot ?? await getInvoiceBranding(invoice.manager_user_id);
  res.json({ ...invoice, branding, items: items.rows, payments: payments.rows });
}));

export default router;
