import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody, parseEmptyBody, parseQuery, registerUuidParams } from '../../shared/utils/validation';
import { paymentProofRateLimit } from '../../config/rate-limit';
import { PAYMENT_PROOF_STATUSES, PAYMENT_REQUEST_STATUSES } from '../../shared/types/database';
import {
  cloudinaryDeliveryTypeValues,
  normalizeStoredUpload,
  uploadResourceTypeValues
} from '../uploads/uploads.service';
import { presentDocumentAsset } from '../documents/document-assets.service';
import {
  createPaymentRequest,
  getPaymentRequestForInvoice,
  getPaymentRequestDetail,
  listPaymentRequests,
  reversePayment,
  reviewPaymentProof,
  submitPaymentProof,
  updatePaymentRequestStatus,
  type PaymentRequestDetail
} from './payments.service';

const router = Router();
registerUuidParams(router, ['id', 'invoiceId', 'paymentId']);

const paymentRequestSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.coerce.number().positive().nullable().optional(),
  currency: z.string().trim().min(1).optional(),
  bank_code: z.string().trim().nullable().optional(),
  bank_account_no: z.string().trim().nullable().optional(),
  bank_account_name: z.string().trim().nullable().optional(),
  transfer_note: z.string().trim().nullable().optional(),
  expires_at: z.string().trim().nullable().optional()
});

const paymentProofSchema = z.object({
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().url(),
  mime_type: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive(),
  resource_type: z.enum(uploadResourceTypeValues).optional(),
  public_id: z.string().trim().min(1).optional(),
  asset_id: z.string().trim().min(1).optional(),
  version: z.coerce.number().int().positive().optional(),
  format: z.string().trim().min(1).max(20).optional(),
  delivery_type: z.enum(cloudinaryDeliveryTypeValues).optional(),
  transfer_amount: z.coerce.number().positive().nullable().optional(),
  transfer_time: z.string().trim().nullable().optional(),
  payer_note: z.string().trim().nullable().optional()
});

const paymentRejectSchema = z.object({
  reason: z.string().trim().min(1).optional()
});

const paymentReverseSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

const idempotencyKeySchema = z.string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

const paymentRequestFiltersSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  building_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  request_status: z.enum(PAYMENT_REQUEST_STATUSES).optional(),
  latest_proof_status: z.enum([...PAYMENT_PROOF_STATUSES, 'NONE']).optional()
});

const presentPaymentRequestDetail = async (
  req: Parameters<typeof presentDocumentAsset>[0],
  detail: PaymentRequestDetail | null
) => {
  if (!detail) return detail;
  return {
    ...detail,
    proofs: await Promise.all(
      detail.proofs.map((proof) => {
        if (typeof proof.id !== 'string') throw new Error('Payment proof row is missing id');
        return presentDocumentAsset(req, 'PAYMENT_PROOF', { ...proof, id: proof.id }, req.auth!);
      })
    )
  };
};

router.get('/requests', asyncHandler(async (req, res) => {
  const filters = parseQuery(paymentRequestFiltersSchema, req.query);
  res.json(await listPaymentRequests(req.auth!, {
    month: filters.month,
    buildingId: filters.building_id,
    roomId: filters.room_id,
    tenantId: filters.tenant_id,
    requestStatus: filters.request_status,
    latestProofStatus: filters.latest_proof_status
  }));
}));

router.get('/requests/:id', asyncHandler(async (req, res) => {
  res.json(await presentPaymentRequestDetail(req, await getPaymentRequestDetail(req.params.id, req.auth!)));
}));

router.get('/invoices/:invoiceId/request', asyncHandler(async (req, res) => {
  res.json(await presentPaymentRequestDetail(req, await getPaymentRequestForInvoice(req.params.invoiceId, req.auth!)));
}));

router.post('/requests', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(paymentRequestSchema, req.body);
  res.status(201).json(await createPaymentRequest(body.invoice_id, req.auth!.userId, body));
}));

router.post('/requests/:id/cancel', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  res.json(await updatePaymentRequestStatus(req.params.id, req.auth!.userId, 'CANCELLED'));
}));

router.post('/requests/:id/expire', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  res.json(await updatePaymentRequestStatus(req.params.id, req.auth!.userId, 'EXPIRED'));
}));

router.post('/requests/:id/proofs', paymentProofRateLimit, requireRole('TENANT'), asyncHandler(async (req, res) => {
  const body = parseBody(paymentProofSchema, req.body);
  const asset = normalizeStoredUpload('PAYMENT_PROOF', body, req.auth!.role, req.auth!.userId);
  const suppliedIdempotencyKey = req.get('Idempotency-Key');
  const idempotencyKey = suppliedIdempotencyKey
    ? parseBody(z.object({ idempotency_key: idempotencyKeySchema }), {
        idempotency_key: suppliedIdempotencyKey
      }).idempotency_key
    : `submit-proof:${req.params.id}:${asset.publicId}`;
  const proof = await submitPaymentProof(req.params.id, {
    ...body,
    public_id: asset.publicId,
    asset_id: asset.assetId ?? undefined,
    resource_type: asset.resourceType,
    version: asset.version ?? undefined,
    format: asset.format ?? undefined,
    delivery_type: asset.deliveryType
  }, req.auth!.userId, idempotencyKey);
  res.status(201).json(await presentDocumentAsset(
    req,
    'PAYMENT_PROOF',
    proof as { id: string },
    req.auth!
  ));
}));

router.post('/proofs/:id/approve', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  const result = await reviewPaymentProof(req.params.id, true, req.auth!.userId);
  res.json({
    ...result,
    proof: await presentDocumentAsset(req, 'PAYMENT_PROOF', result.proof as { id: string }, req.auth!)
  });
}));

router.post('/proofs/:id/reject', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { reason } = parseBody(paymentRejectSchema, req.body);
  const result = await reviewPaymentProof(req.params.id, false, req.auth!.userId, reason);
  res.json(await presentDocumentAsset(req, 'PAYMENT_PROOF', result as { id: string }, req.auth!));
}));

router.post('/ledger/:paymentId/reverse', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { reason } = parseBody(paymentReverseSchema, req.body);
  res.status(201).json(await reversePayment(req.params.paymentId, req.auth!.userId, reason));
}));

export default router;
