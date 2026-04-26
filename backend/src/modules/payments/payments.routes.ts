import { Router } from 'express';
import { requireRole } from '../../shared/middleware/auth';
import {
  createPaymentRequest,
  getPaymentRequestDetail,
  listPaymentRequests,
  reviewPaymentProof,
  submitPaymentProof
} from './payments.service';

const router = Router();

router.get('/requests', async (_req, res) => {
  res.json(await listPaymentRequests());
});

router.get('/requests/:id', async (req, res) => {
  res.json(await getPaymentRequestDetail(req.params.id));
});

router.post('/requests', requireRole('MANAGER'), async (req, res) => {
  res.status(201).json(await createPaymentRequest(req.body.invoice_id, req.auth!.userId, req.body));
});

router.post('/requests/:id/proofs', requireRole('TENANT'), async (req, res) => {
  res.status(201).json(await submitPaymentProof(req.params.id, req.body, req.auth!.userId));
});

router.post('/proofs/:id/approve', requireRole('MANAGER'), async (req, res) => {
  res.json(await reviewPaymentProof(req.params.id, true, req.auth!.userId));
});

router.post('/proofs/:id/reject', requireRole('MANAGER'), async (req, res) => {
  res.json(await reviewPaymentProof(req.params.id, false, req.auth!.userId, req.body.reason));
});

export default router;
