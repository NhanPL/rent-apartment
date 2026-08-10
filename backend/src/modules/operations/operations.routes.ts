import { Router } from 'express';
import { requireRole } from '../../shared/middleware/auth';
import { getMetricsSnapshot } from '../../shared/services/metrics.service';

const router = Router();

router.get('/metrics', requireRole('MANAGER'), (_req, res) => {
  res.json(getMetricsSnapshot());
});

export default router;
