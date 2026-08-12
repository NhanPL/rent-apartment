import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import {
  addInvoiceAdjustment,
  createInvoiceFromReading,
  createManualInvoice,
  createReplacementInvoice,
  deleteManualInvoice,
  generateInvoicesForScope,
  getInvoiceDetail,
  getInvoicePrefill,
  getInvoiceSummary,
  listInvoices,
  updateInvoiceStatus,
  updateManualInvoice
} from './invoices.service';
import { parseBody, parseEmptyBody, parseQuery, registerUuidParams } from '../../shared/utils/validation';
import { createPaginationQuerySchema } from '../../shared/utils/pagination';
import { INVOICE_STATUSES, PAYMENT_STATUSES } from '../../shared/types/database';
import { requireFeatureFlag } from '../../shared/middleware/feature-flag';

const router = Router();
registerUuidParams(router, ['id', 'utilityReadingId']);

const invoicePrefillQuerySchema = z.object({
  room_id: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])(?:-01)?$/)
}).refine((value) => value.room_id || value.roomId, {
  message: 'room_id is required'
});

const invoiceUpsertSchema = z.object({
  contract_id: z.string().uuid(),
  room_id: z.string().uuid(),
  month: z.string().trim().min(1),
  status: z.literal('DRAFT').default('DRAFT'),
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
  amount: z.coerce.number().refine((value) => value !== 0, 'Amount must not be zero'),
  reason: z.string().trim().min(1)
});

const invoiceGenerateSchema = z.object({
  month: z.string().trim().min(1),
  room_id: z.string().uuid().optional(),
  building_id: z.string().uuid().optional()
});

const invoiceIssueSchema = z.object({
  bank_code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9]+$/).optional(),
  bank_account_no: z.string().trim().regex(/^\d{6,19}$/).optional(),
  bank_account_name: z.string().trim().min(2).max(100).optional(),
  transfer_note: z.string().trim().min(1).max(25).optional()
});

const invoiceVoidSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

const invoiceBulkIssueSchema = invoiceIssueSchema.extend({
  invoice_ids: z.array(z.string().uuid()).min(1).max(50)
}).superRefine((value, context) => {
  if (new Set(value.invoice_ids).size !== value.invoice_ids.length) {
    context.addIssue({ code: 'custom', path: ['invoice_ids'], message: 'Invoice IDs must be unique' });
  }
});

interface BulkActionFailure { id: string; code: string; message: string }

const bulkFailure = (id: string, error: unknown): BulkActionFailure => ({
  id,
  code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'BULK_ITEM_FAILED',
  message: error instanceof Error ? error.message : 'Invoice could not be processed.'
});

const invoiceSortFields = [
  'month', 'createdAt', 'dueDate', 'total', 'status', 'building', 'room', 'tenant'
] as const;
const invoiceListQuerySchema = createPaginationQuerySchema(invoiceSortFields, 'month').extend({
  search: z.string().trim().max(100).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  invoice_status: z.enum(INVOICE_STATUSES).optional(),
  payment_status: z.enum(PAYMENT_STATUSES).optional(),
  building_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional()
});
const invoiceSummaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()
});

router.get('/', asyncHandler(async (req, res) => {
  const filters = parseQuery(invoiceListQuerySchema, req.query);
  res.json(await listInvoices(req.auth!, {
    ...filters,
    invoiceStatus: filters.invoice_status,
    paymentStatus: filters.payment_status,
    buildingId: filters.building_id,
    roomId: filters.room_id,
    tenantId: filters.tenant_id
  }));
}));

router.get('/summary', asyncHandler(async (req, res) => {
  const filters = parseQuery(invoiceSummaryQuerySchema, req.query);
  res.json(await getInvoiceSummary(req.auth!, filters.month));
}));

router.get('/prefill', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const filters = parseQuery(invoicePrefillQuerySchema, req.query);
  res.json(await getInvoicePrefill(
    filters.room_id ?? filters.roomId!,
    filters.month,
    req.auth!.userId
  ));
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
  parseEmptyBody(req.body);
  res.status(201).json(await createInvoiceFromReading(req.params.utilityReadingId, req.auth!.userId));
}));

router.post('/generate/room', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(invoiceGenerateSchema.required({ room_id: true }).omit({ building_id: true }), req.body);
  res.status(201).json(await generateInvoicesForScope(body, req.auth!.userId));
}));

router.post('/generate/building', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(invoiceGenerateSchema.required({ building_id: true }).omit({ room_id: true }), req.body);
  res.status(201).json(await generateInvoicesForScope(body, req.auth!.userId));
}));

router.post('/generate/all', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(invoiceGenerateSchema.pick({ month: true }), req.body);
  res.status(201).json(await generateInvoicesForScope(body, req.auth!.userId));
}));

router.post('/bulk/issue', requireRole('MANAGER'), requireFeatureFlag('BULK_BILLING_ACTIONS'), asyncHandler(async (req, res) => {
  const { invoice_ids: invoiceIds, ...payment } = parseBody(invoiceBulkIssueSchema, req.body);
  const succeeded: string[] = [];
  const failed: BulkActionFailure[] = [];
  for (const invoiceId of invoiceIds) {
    try {
      await updateInvoiceStatus(invoiceId, req.auth!.userId, 'issue', payment);
      succeeded.push(invoiceId);
    } catch (error) {
      failed.push(bulkFailure(invoiceId, error));
    }
  }
  res.json({ action: 'ISSUE', succeeded, failed, total: invoiceIds.length });
}));

router.post('/:id/issue', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(invoiceIssueSchema, req.body ?? {});
  res.json(await updateInvoiceStatus(req.params.id, req.auth!.userId, 'issue', body));
}));

router.post('/:id/void', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(invoiceVoidSchema, req.body);
  res.json(await updateInvoiceStatus(req.params.id, req.auth!.userId, 'void', body));
}));

router.post('/:id/replacement', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  res.status(201).json(await createReplacementInvoice(req.params.id, req.auth!.userId));
}));

router.post('/:id/adjustments', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { amount, reason } = parseBody(invoiceAdjustmentSchema, req.body);
  res.json(await addInvoiceAdjustment(req.params.id, amount, reason, req.auth!.userId));
}));

router.delete('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  await deleteManualInvoice(req.params.id, req.auth!.userId);
  res.status(204).send();
}));

export default router;
