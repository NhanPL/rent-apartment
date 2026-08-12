import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseQuery } from '../../shared/utils/validation';
import { getReportDetails, getReportsCsv, getReportsSummary } from './reports.service';
import { buildCsvContentDisposition } from '../../shared/utils/csv';
import { INVOICE_STATUSES } from '../../shared/types/database';
import { paginationQueryFields } from '../../shared/utils/pagination';

const router = Router();

const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
const reportSectionSchema = z.enum(['revenue', 'debt', 'occupancy', 'reconciliation']);

const reportsQuerySchema = z.object({
  month_from: z.string().trim().min(1).optional(),
  monthFrom: z.string().trim().min(1).optional(),
  month_to: z.string().trim().min(1).optional(),
  monthTo: z.string().trim().min(1).optional(),
  building_id: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  room_id: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  status: invoiceStatusSchema.optional()
});

const reportsExportQuerySchema = reportsQuerySchema.extend({
  section: reportSectionSchema.default('revenue'),
  locale: z.enum(['en', 'vi']).default('en')
});

const reportDetailSortFields = [
  'building', 'month', 'invoiceCount', 'billed', 'collected', 'unpaid', 'dueDate',
  'outstandingAmount', 'totalRooms', 'occupiedRooms', 'vacantRooms', 'activeTenants', 'occupancyRate',
  'paymentDate', 'entryType', 'amount'
] as const;
const detailSortDefaults = {
  revenue: 'billed',
  debt: 'dueDate',
  occupancy: 'occupancyRate',
  reconciliation: 'paymentDate'
} as const;
const detailSortFieldsBySection: Record<z.infer<typeof reportSectionSchema>, readonly string[]> = {
  revenue: ['building', 'invoiceCount', 'billed', 'collected', 'unpaid'],
  debt: ['building', 'month', 'dueDate', 'outstandingAmount'],
  occupancy: ['building', 'totalRooms', 'occupiedRooms', 'vacantRooms', 'activeTenants', 'occupancyRate'],
  reconciliation: ['building', 'month', 'paymentDate', 'entryType', 'amount']
};
const reportsDetailQuerySchema = reportsQuerySchema.extend({
  ...paginationQueryFields,
  section: reportSectionSchema,
  sortBy: z.enum(reportDetailSortFields).optional()
}).superRefine((value, context) => {
  if (value.sortBy && !detailSortFieldsBySection[value.section].includes(value.sortBy)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sortBy'],
      message: `sortBy is not supported for ${value.section} reports`
    });
  }
});

const toFilters = (query: z.infer<typeof reportsQuerySchema>) => ({
  monthFrom: query.month_from ?? query.monthFrom,
  monthTo: query.month_to ?? query.monthTo,
  buildingId: query.building_id ?? query.buildingId,
  roomId: query.room_id ?? query.roomId,
  tenantId: query.tenant_id ?? query.tenantId,
  status: query.status
});

router.get('/summary', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const query = parseQuery(reportsQuerySchema, req.query);
  res.json(await getReportsSummary(req.auth!.userId, toFilters(query)));
}));

router.get('/details', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const query = parseQuery(reportsDetailQuerySchema, req.query);
  res.json(await getReportDetails(req.auth!.userId, toFilters(query), query.section, {
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy ?? detailSortDefaults[query.section],
    sortOrder: query.sortOrder
  }));
}));

router.get('/export.csv', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const query = parseQuery(reportsExportQuerySchema, req.query);
  const csv = await getReportsCsv(req.auth!.userId, toFilters(query), query.section, query.locale);

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': buildCsvContentDisposition(csv.filename),
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff'
  });
  res.send(csv.content);
}));

export default router;
