import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { parseBody } from '../../shared/utils/validation';
import { validateStoredUpload } from '../uploads/uploads.service';
import {
  createPaymentRequest,
  getPaymentRequestForInvoice,
  getPaymentRequestDetail,
  listPaymentRequests,
  reviewPaymentProof,
  submitPaymentProof,
  updatePaymentRequestStatus
} from './payments.service';

const router = Router();

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
  transfer_amount: z.coerce.number().positive().nullable().optional(),
  transfer_time: z.string().trim().nullable().optional(),
  payer_note: z.string().trim().nullable().optional()
});

const paymentRejectSchema = z.object({
  reason: z.string().trim().min(1).optional()
});

const paymentRequestFiltersSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  building_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  request_status: z.enum(['DRAFT', 'WAITING_TRANSFER', 'TRANSFER_SUBMITTED', 'VERIFIED', 'REJECTED', 'CANCELLED', 'EXPIRED']).optional(),
  latest_proof_status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NONE']).optional()
});

router.get('/requests', asyncHandler(async (req, res) => {
  const parsed = paymentRequestFiltersSchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, 'Invalid payment request filters', 'VALIDATION_ERROR');
  res.json(await listPaymentRequests(req.auth!, {
    month: parsed.data.month,
    buildingId: parsed.data.building_id,
    roomId: parsed.data.room_id,
    tenantId: parsed.data.tenant_id,
    requestStatus: parsed.data.request_status,
    latestProofStatus: parsed.data.latest_proof_status
  }));
}));

router.get('/requests/:id', asyncHandler(async (req, res) => {
  res.json(await getPaymentRequestDetail(req.params.id, req.auth!));
}));

router.get('/invoices/:invoiceId/request', asyncHandler(async (req, res) => {
  res.json(await getPaymentRequestForInvoice(req.params.invoiceId, req.auth!));
}));

router.post('/requests', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(paymentRequestSchema, req.body);
  res.status(201).json(await createPaymentRequest(body.invoice_id, req.auth!.userId, body));
}));

router.post('/requests/:id/cancel', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await updatePaymentRequestStatus(req.params.id, req.auth!.userId, 'CANCELLED'));
}));

router.post('/requests/:id/expire', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await updatePaymentRequestStatus(req.params.id, req.auth!.userId, 'EXPIRED'));
}));

router.post('/requests/:id/proofs', requireRole('TENANT'), asyncHandler(async (req, res) => {
  const body = parseBody(paymentProofSchema, req.body);
  validateStoredUpload('PAYMENT_PROOF', body, req.auth!.role);
  res.status(201).json(await submitPaymentProof(req.params.id, body, req.auth!.userId));
}));

router.post('/proofs/:id/approve', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await reviewPaymentProof(req.params.id, true, req.auth!.userId));
}));

router.post('/proofs/:id/reject', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { reason } = parseBody(paymentRejectSchema, req.body);
  res.json(await reviewPaymentProof(req.params.id, false, req.auth!.userId, reason));
}));

export default router;
