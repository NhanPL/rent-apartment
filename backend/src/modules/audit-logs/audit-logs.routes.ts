import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseQuery } from '../../shared/utils/validation';
import { AUDIT_ACTIONS } from '../../shared/services/audit-log.service';
import { listAuditLogs } from './audit-logs.service';

const router = Router();
const requestIdPattern = /^[A-Za-z0-9._:-]{8,100}$/;

const auditFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(25),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  actor_role: z.enum(['MANAGER', 'TENANT', 'SYSTEM', 'ANONYMOUS']).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  entity_type: z.string().trim().min(1).max(50).optional(),
  entity_id: z.string().uuid().optional(),
  request_id: z.string().regex(requestIdPattern).optional(),
  search: z.string().trim().max(100).optional()
}).refine(
  (value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to),
  { message: 'The start time must be before the end time.', path: ['from'] }
);

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const filters = parseQuery(auditFiltersSchema, req.query);
  res.json(await listAuditLogs(req.auth!.userId, {
    page: filters.page,
    pageSize: filters.page_size,
    from: filters.from,
    to: filters.to,
    actorRole: filters.actor_role,
    action: filters.action,
    entityType: filters.entity_type,
    entityId: filters.entity_id,
    requestId: filters.request_id,
    search: filters.search
  }));
}));

export default router;
