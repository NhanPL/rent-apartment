import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import {
  addInvoiceAdjustment,
  createInvoiceFromReading,
  createManualInvoice,
  deleteManualInvoice,
  getInvoiceDetail,
  getInvoicePrefill,
  listInvoices,
  updateManualInvoice
} from './invoices.service';
import { parseBody } from '../../shared/utils/validation';

const router = Router();

const invoiceStatusSchema = z.enum(['DRAFT', 'ISSUED', 'PAID', 'VOID', 'OVERDUE']);

const invoiceUpsertSchema = z.object({
  contract_id: z.string().uuid(),
  room_id: z.string().uuid(),
  month: z.string().trim().min(1),
  status: invoiceStatusSchema,
  issued_at: z.string().trim().nullable().optional(),
  due_date: z.string().trim().nullable().optional(),
  note: z.string().trim().nullable().optional(),
  discount: z.coerce.number().nonnegative(),
  rent_amount: z.coerce.number().nonnegative(),
  other_fees: z.coerce.number().nonnegative(),
  electricity_prev: z.coerce.number().nonnegative(),
  electricity_curr: z.coerce.number().nonnegative(),
  water_prev: z.coerce.number().nonnegative(),
  water_curr: z.coerce.number().nonnegative(),
  electric_unit_price: z.coerce.number().nonnegative(),
  water_unit_price: z.coerce.number().nonnegative()
});

const invoiceAdjustmentSchema = z.object({
  amount: z.coerce.number(),
  reason: z.string().trim().min(1)
});

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listInvoices(req.auth!));
}));

router.get('/prefill', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const roomId = String(req.query.room_id ?? req.query.roomId ?? '').trim();
  if (!roomId) {
    res.status(400).json({ message: 'room_id is required', code: 'VALIDATION_ERROR' });
    return;
  }
  res.json(await getInvoicePrefill(roomId, String(req.query.month ?? ''), req.auth!.userId));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getInvoiceDetail(req.params.id, req.auth!));
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(invoiceUpsertSchema, req.body);
  res.status(201).json(await createManualInvoice(body, req.auth!.userId));
}));

router.put('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(invoiceUpsertSchema, req.body);
  res.json(await updateManualInvoice(req.params.id, body, req.auth!.userId));
}));

router.post('/from-reading/:utilityReadingId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.status(201).json(await createInvoiceFromReading(req.params.utilityReadingId, req.auth!.userId));
}));

router.post('/:id/adjustments', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { amount, reason } = parseBody(invoiceAdjustmentSchema, req.body);
  res.json(await addInvoiceAdjustment(req.params.id, amount, reason, req.auth!.userId));
}));

router.delete('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  await deleteManualInvoice(req.params.id, req.auth!.userId);
  res.status(204).send();
}));

export default router;
