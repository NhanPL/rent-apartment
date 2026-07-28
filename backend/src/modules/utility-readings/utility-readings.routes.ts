import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody, parseQuery, registerUuidParams } from '../../shared/utils/validation';
import { validateStoredUpload } from '../uploads/uploads.service';
import {
  approveUtilityReading,
  attachUtilityReadingEvidence,
  createUtilityReading,
  getUtilityReadingById,
  listUtilityReadings,
  rejectUtilityReading,
  requestUtilityReadingCorrection
} from './utility-readings.service';

const router = Router();
registerUuidParams(router, ['id']);

const utilityEvidenceFileSchema = z.object({
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().url(),
  mime_type: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive()
});

const utilityReadingCreateSchema = z.object({
  room_id: z.string().uuid(),
  month: z.string().trim().nullable().optional(),
  electricity_curr: z.coerce.number().nonnegative(),
  water_curr: z.coerce.number().nonnegative(),
  note: z.string().trim().nullable().optional(),
  evidence: z.object({
    electricity: utilityEvidenceFileSchema,
    water: utilityEvidenceFileSchema
  }).optional()
});

const utilityEvidenceSchema = z.object({
  evidence_type: z.enum(['ELECTRIC', 'WATER', 'OTHER']),
  ...utilityEvidenceFileSchema.shape,
  note: z.string().trim().nullable().optional()
});

const utilityRejectSchema = z.object({
  reason: z.string().trim().min(1)
});

const utilityReadingStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED']);
const utilityReadingListQuerySchema = z.object({
  building_id: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])(?:-01)?$/).optional(),
  status: utilityReadingStatusSchema.optional()
});

router.get('/', asyncHandler(async (req, res) => {
  const filters = parseQuery(utilityReadingListQuerySchema, req.query);
  res.json(await listUtilityReadings(req.auth!, {
    buildingId: filters.building_id ?? filters.buildingId,
    roomId: filters.room_id ?? filters.roomId,
    month: filters.month,
    status: filters.status
  }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getUtilityReadingById(req.params.id, req.auth!));
}));

router.post('/', requireRole('TENANT'), asyncHandler(async (req, res) => {
  const body = parseBody(utilityReadingCreateSchema, req.body);
  if (body.evidence) {
    validateStoredUpload('UTILITY_EVIDENCE', body.evidence.electricity, req.auth!.role);
    validateStoredUpload('UTILITY_EVIDENCE', body.evidence.water, req.auth!.role);
  }
  res.status(201).json(await createUtilityReading(body, req.auth!.userId));
}));

router.post('/:id/evidence', asyncHandler(async (req, res) => {
  const body = parseBody(utilityEvidenceSchema, req.body);
  validateStoredUpload('UTILITY_EVIDENCE', body, req.auth!.role);
  res.status(201).json(await attachUtilityReadingEvidence(req.params.id, body, req.auth!));
}));

router.post('/:id/approve', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await approveUtilityReading(req.params.id, req.auth!.userId));
}));

router.post('/:id/reject', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { reason } = parseBody(utilityRejectSchema, req.body);
  res.json(await rejectUtilityReading(req.params.id, req.auth!.userId, reason));
}));

router.post('/:id/request-correction', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { reason } = parseBody(utilityRejectSchema, req.body);
  res.json(await requestUtilityReadingCorrection(req.params.id, req.auth!.userId, reason));
}));

export default router;
