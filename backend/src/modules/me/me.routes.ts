import { Router } from 'express';
import { query } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { firstDayOfMonth } from '../../shared/utils/date';

const router = Router();
router.use(requireRole('TENANT'));

const tenantInvoiceProjection = `
  i.*,
  COALESCE(room_rent.amount, 0)::float AS rent_amount,
  COALESCE(electricity.amount, 0)::float AS electric_amount,
  COALESCE(water.amount, 0)::float AS water_amount,
  COALESCE(other_fee.amount, GREATEST(i.subtotal - COALESCE(room_rent.amount, 0) - COALESCE(electricity.amount, 0) - COALESCE(water.amount, 0), 0), 0)::float AS other_amount,
  latest_payment.status AS payment_status,
  latest_payment.paid_at
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
`;

router.get('/room', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM vw_tenant_current_room WHERE tenant_id = (SELECT id FROM tenant WHERE user_id=$1)`,
    [req.auth!.userId]
  );
  res.json(rows[0] ?? null);
}));

router.get('/roommates', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT t.* FROM tenant t
     JOIN contract_tenant ct ON ct.tenant_id=t.id AND ct.left_at IS NULL
     WHERE ct.contract_id = (
      SELECT contract_id FROM vw_tenant_current_room WHERE tenant_id = (SELECT id FROM tenant WHERE user_id=$1)
     )`,
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

export default router;
