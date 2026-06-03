import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { getDashboardSummary } from './dashboard.service';
import { parseBody } from '../../shared/utils/validation';

const router = Router();

const dashboardQuerySchema = z.object({
  month: z.string().trim().min(1).optional(),
  building_id: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional()
});

router.get('/summary', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const query = parseBody(dashboardQuerySchema, req.query);
  res.json(await getDashboardSummary(req.auth!.userId, {
    month: query.month,
    buildingId: query.building_id ?? query.buildingId
  }));
}));

export default router;
