import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
import { FEATURE_KEYS, listFeatureFlags, updateFeatureFlag } from './feature-flags.service';

const router = Router();
router.use(requireRole('MANAGER'));
const updateSchema = z.object({ key: z.enum(FEATURE_KEYS), enabled: z.boolean() });

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listFeatureFlags(req.auth!.userId));
}));

router.patch('/', asyncHandler(async (req, res) => {
  const body = parseBody(updateSchema, req.body);
  res.json(await updateFeatureFlag(req.auth!.userId, body.key, body.enabled));
}));

export default router;
