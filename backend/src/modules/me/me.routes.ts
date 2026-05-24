import { Router } from 'express';
import { query } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { firstDayOfMonth } from '../../shared/utils/date';

const router = Router();
router.use(requireRole('TENANT'));

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
    `SELECT i.*, pr.id as payment_request_id, pr.status as payment_request_status
     FROM invoice i
     JOIN vw_tenant_current_room v ON v.contract_id=i.contract_id
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
    `SELECT * FROM vw_invoice_payment_request_status x
     WHERE x.contract_id = (SELECT contract_id FROM vw_tenant_current_room WHERE tenant_id=(SELECT id FROM tenant WHERE user_id=$1))
     ORDER BY month DESC LIMIT 12`,
    [req.auth!.userId]
  );
  res.json(rows);
}));

export default router;
