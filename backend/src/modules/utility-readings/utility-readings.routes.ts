import { Router } from 'express';
import { z } from 'zod';
import { UTILITY_READING_STATUSES } from '../../shared/types/database';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody, parseEmptyBody, parseQuery, registerUuidParams } from '../../shared/utils/validation';
import { createPaginationQuerySchema } from '../../shared/utils/pagination';
import {
  cloudinaryDeliveryTypeValues,
  normalizeStoredUpload,
  uploadResourceTypeValues
} from '../uploads/uploads.service';
import { presentDocumentAsset } from '../documents/document-assets.service';
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
  file_size: z.coerce.number().int().positive(),
  resource_type: z.enum(uploadResourceTypeValues).optional(),
  public_id: z.string().trim().min(1).optional(),
  asset_id: z.string().trim().min(1).optional(),
  version: z.coerce.number().int().positive().optional(),
  format: z.string().trim().min(1).max(20).optional(),
  delivery_type: z.enum(cloudinaryDeliveryTypeValues).optional()
});

const utilityReadingCreateSchema = z.object({
  room_id: z.string().uuid(),
  month: z.string().trim().nullable().optional(),
  electricity_curr: z.coerce.number().nonnegative(),
  water_curr: z.coerce.number().nonnegative(),
  electricity_meter_reset: z.boolean().default(false),
  water_meter_reset: z.boolean().default(false),
  meter_reset_note: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().nullable().optional(),
  evidence: z.object({
    electricity: utilityEvidenceFileSchema,
    water: utilityEvidenceFileSchema
  }).optional()
}).superRefine((value, context) => {
  if ((value.electricity_meter_reset || value.water_meter_reset) && !value.meter_reset_note?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['meter_reset_note'],
      message: 'A meter reset reason is required.'
    });
  }
});

const utilityEvidenceSchema = z.object({
  evidence_type: z.enum(['ELECTRIC', 'WATER', 'OTHER']),
  ...utilityEvidenceFileSchema.shape,
  note: z.string().trim().nullable().optional()
});

const utilityRejectSchema = z.object({
  reason: z.string().trim().min(1)
});

const utilityReadingStatusSchema = z.enum(UTILITY_READING_STATUSES);
const utilityReadingSortFields = [
  'month', 'createdAt', 'submittedAt', 'status', 'building', 'room', 'tenant'
] as const;
const utilityReadingListQuerySchema = createPaginationQuerySchema(utilityReadingSortFields, 'month').extend({
  search: z.string().trim().max(100).optional(),
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
    status: filters.status,
    search: filters.search,
    page: filters.page,
    pageSize: filters.pageSize,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder
  }));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const reading = await getUtilityReadingById(req.params.id, req.auth!);
  res.json({
    ...reading,
    evidence: await Promise.all(
      reading.evidence.map((item) => presentDocumentAsset(req, 'UTILITY_EVIDENCE', item as { id: string }, req.auth!))
    )
  });
}));

router.post('/', requireRole('TENANT'), asyncHandler(async (req, res) => {
  const body = parseBody(utilityReadingCreateSchema, req.body);
  let evidence;
  if (body.evidence) {
    const electricityAsset = normalizeStoredUpload('UTILITY_EVIDENCE', body.evidence.electricity, req.auth!.role, req.auth!.userId);
    const waterAsset = normalizeStoredUpload('UTILITY_EVIDENCE', body.evidence.water, req.auth!.role, req.auth!.userId);
    evidence = {
      electricity: {
        ...body.evidence.electricity,
        public_id: electricityAsset.publicId,
        asset_id: electricityAsset.assetId ?? undefined,
        resource_type: electricityAsset.resourceType,
        version: electricityAsset.version ?? undefined,
        format: electricityAsset.format ?? undefined,
        delivery_type: electricityAsset.deliveryType
      },
      water: {
        ...body.evidence.water,
        public_id: waterAsset.publicId,
        asset_id: waterAsset.assetId ?? undefined,
        resource_type: waterAsset.resourceType,
        version: waterAsset.version ?? undefined,
        format: waterAsset.format ?? undefined,
        delivery_type: waterAsset.deliveryType
      }
    };
  }
  res.status(201).json(await createUtilityReading({ ...body, evidence }, req.auth!.userId));
}));

router.post('/:id/evidence', asyncHandler(async (req, res) => {
  const body = parseBody(utilityEvidenceSchema, req.body);
  const asset = normalizeStoredUpload('UTILITY_EVIDENCE', body, req.auth!.role, req.auth!.userId);
  const evidence = await attachUtilityReadingEvidence(req.params.id, {
    ...body,
    public_id: asset.publicId,
    asset_id: asset.assetId ?? undefined,
    resource_type: asset.resourceType,
    version: asset.version ?? undefined,
    format: asset.format ?? undefined,
    delivery_type: asset.deliveryType
  }, req.auth!);
  res.status(201).json(await presentDocumentAsset(
    req,
    'UTILITY_EVIDENCE',
    evidence as { id: string },
    req.auth!
  ));
}));

router.post('/:id/approve', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  const reading = await approveUtilityReading(req.params.id, req.auth!.userId);
  res.json({
    ...reading,
    evidence: await Promise.all(
      reading.evidence.map((item) => presentDocumentAsset(req, 'UTILITY_EVIDENCE', item as { id: string }, req.auth!))
    )
  });
}));

router.post('/:id/reject', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { reason } = parseBody(utilityRejectSchema, req.body);
  const reading = await rejectUtilityReading(req.params.id, req.auth!.userId, reason);
  res.json({
    ...reading,
    evidence: await Promise.all(
      reading.evidence.map((item) => presentDocumentAsset(req, 'UTILITY_EVIDENCE', item as { id: string }, req.auth!))
    )
  });
}));

router.post('/:id/request-correction', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { reason } = parseBody(utilityRejectSchema, req.body);
  const reading = await requestUtilityReadingCorrection(req.params.id, req.auth!.userId, reason);
  res.json({
    ...reading,
    evidence: await Promise.all(
      reading.evidence.map((item) => presentDocumentAsset(req, 'UTILITY_EVIDENCE', item as { id: string }, req.auth!))
    )
  });
}));

export default router;
