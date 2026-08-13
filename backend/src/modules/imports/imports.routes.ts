import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
import { commitImport, importEntityValues, previewImport } from './imports.service';
import { requireFeatureFlag } from '../../shared/middleware/feature-flag';

const router = Router();
router.use(requireRole('MANAGER'), requireFeatureFlag('CSV_IMPORTS'));
const importSchema = z.object({
  entity: z.enum(importEntityValues),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500)
});

router.post('/preview', asyncHandler(async (req, res) => {
  const body = parseBody(importSchema, req.body);
  res.json(await previewImport(req.auth!.userId, body.entity, body.rows));
}));

router.post('/commit', asyncHandler(async (req, res) => {
  const body = parseBody(importSchema, req.body);
  res.status(201).json(await commitImport(req.auth!.userId, body.entity, body.rows));
}));

export default router;
