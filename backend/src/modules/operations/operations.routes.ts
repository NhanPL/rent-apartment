import { Router } from 'express';
import { requireRole } from '../../shared/middleware/auth';
import { getMetricsSnapshot } from '../../shared/services/metrics.service';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseQuery } from '../../shared/utils/validation';
import { listBackgroundJobRuns } from './background-jobs.service';

const router = Router();

router.get('/metrics', requireRole('MANAGER'), (_req, res) => {
  res.json(getMetricsSnapshot());
});

router.get('/jobs', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { limit } = parseQuery(z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50)
  }), req.query);
  res.json({ items: await listBackgroundJobRuns(limit) });
}));

export default router;
