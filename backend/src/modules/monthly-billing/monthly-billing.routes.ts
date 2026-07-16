import { Router } from 'express';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { listMonthlyBilling } from './monthly-billing.service';

const router = Router();

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await listMonthlyBilling(
    req.auth!.userId,
    String(req.query.building_id ?? '').trim() || undefined,
    String(req.query.month ?? '').trim() || undefined
  ));
}));

export default router;
