import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseQuery } from '../../shared/utils/validation';
import { listMonthlyBilling } from './monthly-billing.service';

const router = Router();

const monthlyBillingQuerySchema = z.object({
  building_id: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])(?:-01)?$/).optional()
});

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const filters = parseQuery(monthlyBillingQuerySchema, req.query);
  res.json(await listMonthlyBilling(
    req.auth!.userId,
    filters.building_id,
    filters.month
  ));
}));

export default router;
