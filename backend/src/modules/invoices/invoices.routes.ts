import { Router } from 'express';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { addInvoiceAdjustment, createInvoiceFromReading, getInvoiceDetail, listInvoices } from './invoices.service';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  res.json(await listInvoices());
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getInvoiceDetail(req.params.id));
}));

router.post('/from-reading/:utilityReadingId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.status(201).json(await createInvoiceFromReading(req.params.utilityReadingId, req.auth!.userId));
}));

router.post('/:id/adjustments', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;
  res.json(await addInvoiceAdjustment(req.params.id, Number(amount), reason, req.auth!.userId));
}));

export default router;
