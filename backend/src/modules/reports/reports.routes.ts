import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
import { getReportsCsv, getReportsData } from './reports.service';

const router = Router();

const invoiceStatusSchema = z.enum(['DRAFT', 'ISSUED', 'PAID', 'VOID', 'OVERDUE']);
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
  const query = parseBody(reportsQuerySchema, req.query);
  res.json(await getReportsData(req.auth!.userId, toFilters(query)));
}));

router.get('/export.csv', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const query = parseBody(reportsExportQuerySchema, req.query);
  const csv = await getReportsCsv(req.auth!.userId, toFilters(query), query.section);

  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.header('Content-Disposition', `attachment; filename="${csv.filename}"`);
  res.send(csv.content);
}));

export default router;
