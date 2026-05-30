import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
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
  qr_image_url: z.string().trim().nullable().optional(),
  bank_code: z.string().trim().nullable().optional(),
  bank_account_no: z.string().trim().nullable().optional(),
  bank_account_name: z.string().trim().nullable().optional(),
  transfer_note: z.string().trim().nullable().optional(),
  expires_at: z.string().trim().nullable().optional()
});

const paymentProofSchema = z.object({
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().min(1),
  mime_type: z.string().trim().nullable().optional(),
  file_size: z.coerce.number().int().nonnegative().nullable().optional(),
  transfer_amount: z.coerce.number().positive().nullable().optional(),
  transfer_time: z.string().trim().nullable().optional(),
  payer_note: z.string().trim().nullable().optional()
});

const paymentRejectSchema = z.object({
  reason: z.string().trim().min(1).optional()
});

router.get('/requests', asyncHandler(async (req, res) => {
  res.json(await listPaymentRequests(req.auth!));
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
