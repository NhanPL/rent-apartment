import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { addInvoiceAdjustment, createInvoiceFromReading, getInvoiceDetail, listInvoices } from './invoices.service';
import { parseBody } from '../../shared/utils/validation';

const router = Router();

const invoiceAdjustmentSchema = z.object({
  amount: z.coerce.number(),
  reason: z.string().trim().min(1)
});

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listInvoices(req.auth!));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getInvoiceDetail(req.params.id, req.auth!));
}));

router.post('/from-reading/:utilityReadingId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.status(201).json(await createInvoiceFromReading(req.params.utilityReadingId, req.auth!.userId));
}));

router.post('/:id/adjustments', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { amount, reason } = parseBody(invoiceAdjustmentSchema, req.body);
  res.json(await addInvoiceAdjustment(req.params.id, amount, reason, req.auth!.userId));
}));

export default router;
