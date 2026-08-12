import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseEmptyBody, parseParams, parseQuery } from '../../shared/utils/validation';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from './notifications.service';

const router = Router();
const idSchema = z.object({ id: z.string().uuid() });
const filtersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(50).default(10),
  unread_only: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
});

router.get('/', asyncHandler(async (req, res) => {
  const filters = parseQuery(filtersSchema, req.query);
  res.json(await listNotifications(req.auth!.userId, {
    page: filters.page,
    pageSize: filters.page_size,
    unreadOnly: filters.unread_only
  }));
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const { id } = parseParams(idSchema, req.params);
  parseEmptyBody(req.body);
  await markNotificationRead(req.auth!.userId, id);
  res.status(204).send();
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  await markAllNotificationsRead(req.auth!.userId);
  res.status(204).send();
}));

export default router;
