import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody, parseQuery, registerUuidParams } from '../../shared/utils/validation';
import {
  cancelRental,
  getAvailableRooms,
  getAvailableTenants,
  handoverRental,
  reserveRoom
} from './rental-registration.service';

const router = Router();
registerUuidParams(router, ['contractId']);

const nullableString = z.string().trim().nullable().optional();
const availableRoomQuerySchema = z.object({ building_id: z.string().uuid().optional() });
const tenantDraftSchema = z.object({
  full_name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  identity_number: z.string().trim().min(1),
  email: z.string().trim().email().nullable().optional(),
  dob: nullableString,
  gender: nullableString,
  identity_issued_date: nullableString,
  identity_issued_place: nullableString,
  permanent_address: nullableString,
  note: nullableString,
  privacy_consent: z.literal(true),
  privacy_policy_version: z.string().trim().min(1).max(40).optional()
});
const reserveSchema = z.object({
  room_id: z.string().uuid(),
  tenant_id: z.string().uuid().optional(),
  tenant: tenantDraftSchema.optional(),
  start_date: z.string().trim().min(1),
  end_date: nullableString,
  rent_price: z.coerce.number().nonnegative(),
  deposit_amount: z.coerce.number().nonnegative(),
  billing_day: z.coerce.number().int().min(1).max(28),
  note: nullableString
}).refine((body) => Boolean(body.tenant_id || body.tenant), { message: 'tenant_id or tenant is required' });
const handoverSchema = z.object({
  move_in_date: z.string().trim().min(1),
  electricity_curr: z.coerce.number().nonnegative(),
  water_curr: z.coerce.number().nonnegative(),
  persons_count: z.coerce.number().int().nonnegative(),
  vehicles_count: z.coerce.number().int().nonnegative(),
  note: nullableString
});
const cancelSchema = z.object({
  reason: z.string().trim().min(1),
  cancel_date: z.string().trim().min(1).optional()
});

router.get('/available-rooms', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const filters = parseQuery(availableRoomQuerySchema, req.query);
  res.json(await getAvailableRooms(req.auth!.userId, filters.building_id));
}));

router.get('/available-tenants', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await getAvailableTenants(req.auth!.userId));
}));

router.post('/reserve', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const payload = parseBody(reserveSchema, req.body);
  res.status(201).json(await reserveRoom(payload, req.auth!.userId));
}));

router.post('/:contractId/handover', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const payload = parseBody(handoverSchema, req.body);
  res.json(await handoverRental(req.params.contractId, payload, req.auth!.userId));
}));

router.post('/:contractId/cancel', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const payload = parseBody(cancelSchema, req.body);
  res.json(await cancelRental(req.params.contractId, payload, req.auth!.userId));
}));

export default router;
