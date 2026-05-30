import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
import {
  approveUtilityReading,
  attachUtilityReadingEvidence,
  createUtilityReading,
  getUtilityReadingById,
  listUtilityReadings,
  rejectUtilityReading
} from './utility-readings.service';

const router = Router();

const utilityReadingCreateSchema = z.object({
  room_id: z.string().uuid(),
  month: z.string().trim().nullable().optional(),
  electricity_curr: z.coerce.number().nonnegative(),
  water_curr: z.coerce.number().nonnegative(),
  note: z.string().trim().nullable().optional()
});

const utilityEvidenceSchema = z.object({
  evidence_type: z.enum(['ELECTRIC', 'WATER', 'OTHER']),
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().min(1),
  mime_type: z.string().trim().nullable().optional(),
  file_size: z.coerce.number().int().nonnegative().nullable().optional(),
  note: z.string().trim().nullable().optional()
});

const utilityRejectSchema = z.object({
  reason: z.string().trim().min(1)
});

const utilityReadingStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED']);

router.get('/', asyncHandler(async (req, res) => {
  const status = String(req.query.status ?? '').trim();
  if (status && !utilityReadingStatusSchema.safeParse(status).success) {
    res.status(400).json({ message: 'Invalid utility reading status', code: 'VALIDATION_ERROR' });
    return;
  }

  res.json(await listUtilityReadings(req.auth!, {
    buildingId: String(req.query.building_id ?? req.query.buildingId ?? '').trim() || undefined,
    roomId: String(req.query.room_id ?? req.query.roomId ?? '').trim() || undefined,
    month: String(req.query.month ?? '').trim() || undefined,
    status: status || undefined
  }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getUtilityReadingById(req.params.id, req.auth!));
}));

router.post('/', requireRole('TENANT'), asyncHandler(async (req, res) => {
  const body = parseBody(utilityReadingCreateSchema, req.body);
  res.status(201).json(await createUtilityReading(body, req.auth!.userId));
}));

router.post('/:id/evidence', asyncHandler(async (req, res) => {
  const body = parseBody(utilityEvidenceSchema, req.body);
  res.status(201).json(await attachUtilityReadingEvidence(req.params.id, body, req.auth!));
}));

router.post('/:id/approve', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await approveUtilityReading(req.params.id, req.auth!.userId));
}));

router.post('/:id/reject', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { reason } = parseBody(utilityRejectSchema, req.body);
  res.json(await rejectUtilityReading(req.params.id, req.auth!.userId, reason));
}));

export default router;
