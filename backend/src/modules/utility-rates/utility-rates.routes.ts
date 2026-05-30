import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
import {
  createUtilityRate,
  deleteUtilityRate,
  getUtilityRate,
  listUtilityRates,
  updateUtilityRate
} from './utility-rates.service';

const router = Router();
router.use(requireRole('MANAGER'));

const utilityRateCreateSchema = z.object({
  building_id: z.string().uuid(),
  effective_from: z.string().trim().min(1),
  electricity_unit_price: z.coerce.number().nonnegative(),
  water_unit_price: z.coerce.number().nonnegative(),
  note: z.string().trim().nullable().optional()
});

const utilityRateUpdateSchema = utilityRateCreateSchema.partial();

router.get('/', asyncHandler(async (req, res) => {
  const buildingId = String(req.query.building_id ?? req.query.buildingId ?? '').trim() || undefined;
  res.json(await listUtilityRates(req.auth!.userId, buildingId));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getUtilityRate(req.params.id, req.auth!.userId));
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = parseBody(utilityRateCreateSchema, req.body);
  res.status(201).json(await createUtilityRate(body, req.auth!.userId));
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const body = parseBody(utilityRateUpdateSchema, req.body);
  res.json(await updateUtilityRate(req.params.id, body, req.auth!.userId));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await deleteUtilityRate(req.params.id, req.auth!.userId);
  res.status(204).send();
}));

export default router;
