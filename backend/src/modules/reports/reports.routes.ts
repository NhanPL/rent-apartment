import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseQuery } from '../../shared/utils/validation';
import { getReportsCsv, getReportsData } from './reports.service';
import { buildCsvContentDisposition } from '../../shared/utils/csv';

const router = Router();

const invoiceStatusSchema = z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']);
const reportSectionSchema = z.enum(['revenue', 'debt', 'occupancy']);

const reportsQuerySchema = z.object({
  month_from: z.string().trim().min(1).optional(),
  monthFrom: z.string().trim().min(1).optional(),
  month_to: z.string().trim().min(1).optional(),
  monthTo: z.string().trim().min(1).optional(),
  building_id: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  status: invoiceStatusSchema.optional()
});

const reportsExportQuerySchema = reportsQuerySchema.extend({
  section: reportSectionSchema.default('revenue')
});

const toFilters = (query: z.infer<typeof reportsQuerySchema>) => ({
  monthFrom: query.month_from ?? query.monthFrom,
  monthTo: query.month_to ?? query.monthTo,
  buildingId: query.building_id ?? query.buildingId,
  status: query.status
});

router.get('/summary', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const query = parseQuery(reportsQuerySchema, req.query);
  res.json(await getReportsData(req.auth!.userId, toFilters(query)));
}));

router.get('/export.csv', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const query = parseQuery(reportsExportQuerySchema, req.query);
  const csv = await getReportsCsv(req.auth!.userId, toFilters(query), query.section);

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': buildCsvContentDisposition(csv.filename),
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff'
  });
  res.send(csv.content);
}));

export default router;
