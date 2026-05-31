import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
import {
  createBuildingCharge,
  createChargeCatalog,
  createContractChargeOverride,
  createRoomChargeOverride,
  createRoomMonthExtra,
  deleteBuildingCharge,
  deleteChargeCatalog,
  deleteContractChargeOverride,
  deleteRoomChargeOverride,
  deleteRoomMonthExtra,
  getBuildingCharge,
  getChargeCatalog,
  getContractChargeOverride,
  getRoomChargeOverride,
  getRoomMonthExtra,
  listBuildingCharges,
  listChargeCatalog,
  listContractChargeOverrides,
  listRoomChargeOverrides,
  listRoomMonthExtras,
  resolveFixedChargesPreview,
  updateBuildingCharge,
  updateChargeCatalog,
  updateContractChargeOverride,
  updateRoomChargeOverride,
  updateRoomMonthExtra
} from './fixed-charges.service';

const router = Router();
router.use(requireRole('MANAGER'));

const chargeTypeSchema = z.enum(['FLAT', 'PER_PERSON', 'PER_VEHICLE']);
const dateString = z.string().trim().min(1);
const nullableDateString = z.string().trim().nullable().optional();

const catalogCreateSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1),
  charge_type: chargeTypeSchema,
  is_active: z.boolean().optional(),
  note: z.string().trim().nullable().optional()
});

const catalogUpdateSchema = catalogCreateSchema.partial();

const buildingChargeCreateSchema = z.object({
  building_id: z.string().uuid(),
  charge_id: z.string().uuid(),
  unit_price: z.coerce.number().nonnegative(),
  effective_from: dateString,
  is_active: z.boolean().optional()
});

const buildingChargeUpdateSchema = buildingChargeCreateSchema.partial();

const roomChargeCreateSchema = z.object({
  room_id: z.string().uuid(),
  charge_id: z.string().uuid(),
  unit_price: z.coerce.number().nonnegative(),
  effective_from: dateString,
  is_active: z.boolean().optional()
});

const roomChargeUpdateSchema = roomChargeCreateSchema.partial();

const contractChargeBaseSchema = z.object({
  contract_id: z.string().uuid(),
  charge_id: z.string().uuid(),
  unit_price: z.coerce.number().nonnegative(),
  effective_from: dateString,
  effective_to: nullableDateString,
  is_active: z.boolean().optional()
});

const contractChargeCreateSchema = contractChargeBaseSchema.refine(
  (value) => !value.effective_to || new Date(value.effective_to) >= new Date(value.effective_from),
  { message: 'effective_to must be after effective_from', path: ['effective_to'] }
);

const contractChargeUpdateSchema = contractChargeBaseSchema.partial().refine(
  (value) => !value.effective_to || !value.effective_from || new Date(value.effective_to) >= new Date(value.effective_from),
  { message: 'effective_to must be after effective_from', path: ['effective_to'] }
);

const roomMonthExtraCreateSchema = z.object({
  room_id: z.string().uuid(),
  month: dateString,
  persons_count: z.coerce.number().int().nonnegative().nullable().optional(),
  vehicles_count: z.coerce.number().int().nonnegative().nullable().optional(),
  note: z.string().trim().nullable().optional()
});

const roomMonthExtraUpdateSchema = roomMonthExtraCreateSchema.partial();

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined;
  return String(value).toLowerCase() === 'true';
};

router.get('/catalog', asyncHandler(async (req, res) => {
  res.json(await listChargeCatalog(parseOptionalBoolean(req.query.is_active)));
}));

router.get('/catalog/:id', asyncHandler(async (req, res) => {
  res.json(await getChargeCatalog(req.params.id));
}));

router.post('/catalog', asyncHandler(async (req, res) => {
  const body = parseBody(catalogCreateSchema, req.body);
  res.status(201).json(await createChargeCatalog(body));
}));

router.patch('/catalog/:id', asyncHandler(async (req, res) => {
  const body = parseBody(catalogUpdateSchema, req.body);
  res.json(await updateChargeCatalog(req.params.id, body));
}));

router.delete('/catalog/:id', asyncHandler(async (req, res) => {
  await deleteChargeCatalog(req.params.id);
  res.status(204).send();
}));

router.get('/building-charges', asyncHandler(async (req, res) => {
  const buildingId = String(req.query.building_id ?? req.query.buildingId ?? '').trim() || undefined;
  res.json(await listBuildingCharges(req.auth!.userId, buildingId));
}));

router.get('/building-charges/:id', asyncHandler(async (req, res) => {
  res.json(await getBuildingCharge(req.params.id, req.auth!.userId));
}));

router.post('/building-charges', asyncHandler(async (req, res) => {
  const body = parseBody(buildingChargeCreateSchema, req.body);
  res.status(201).json(await createBuildingCharge(body, req.auth!.userId));
}));

router.patch('/building-charges/:id', asyncHandler(async (req, res) => {
  const body = parseBody(buildingChargeUpdateSchema, req.body);
  res.json(await updateBuildingCharge(req.params.id, body, req.auth!.userId));
}));

router.delete('/building-charges/:id', asyncHandler(async (req, res) => {
  await deleteBuildingCharge(req.params.id, req.auth!.userId);
  res.status(204).send();
}));

router.get('/room-overrides', asyncHandler(async (req, res) => {
  const buildingId = String(req.query.building_id ?? req.query.buildingId ?? '').trim() || undefined;
  const roomId = String(req.query.room_id ?? req.query.roomId ?? '').trim() || undefined;
  res.json(await listRoomChargeOverrides(req.auth!.userId, { buildingId, roomId }));
}));

router.get('/room-overrides/:id', asyncHandler(async (req, res) => {
  res.json(await getRoomChargeOverride(req.params.id, req.auth!.userId));
}));

router.post('/room-overrides', asyncHandler(async (req, res) => {
  const body = parseBody(roomChargeCreateSchema, req.body);
  res.status(201).json(await createRoomChargeOverride(body, req.auth!.userId));
}));

router.patch('/room-overrides/:id', asyncHandler(async (req, res) => {
  const body = parseBody(roomChargeUpdateSchema, req.body);
  res.json(await updateRoomChargeOverride(req.params.id, body, req.auth!.userId));
}));

router.delete('/room-overrides/:id', asyncHandler(async (req, res) => {
  await deleteRoomChargeOverride(req.params.id, req.auth!.userId);
  res.status(204).send();
}));

router.get('/contract-overrides', asyncHandler(async (req, res) => {
  const buildingId = String(req.query.building_id ?? req.query.buildingId ?? '').trim() || undefined;
  const roomId = String(req.query.room_id ?? req.query.roomId ?? '').trim() || undefined;
  const contractId = String(req.query.contract_id ?? req.query.contractId ?? '').trim() || undefined;
  res.json(await listContractChargeOverrides(req.auth!.userId, { buildingId, roomId, contractId }));
}));

router.get('/contract-overrides/:id', asyncHandler(async (req, res) => {
  res.json(await getContractChargeOverride(req.params.id, req.auth!.userId));
}));

router.post('/contract-overrides', asyncHandler(async (req, res) => {
  const body = parseBody(contractChargeCreateSchema, req.body);
  res.status(201).json(await createContractChargeOverride(body, req.auth!.userId));
}));

router.patch('/contract-overrides/:id', asyncHandler(async (req, res) => {
  const body = parseBody(contractChargeUpdateSchema, req.body);
  res.json(await updateContractChargeOverride(req.params.id, body, req.auth!.userId));
}));

router.delete('/contract-overrides/:id', asyncHandler(async (req, res) => {
  await deleteContractChargeOverride(req.params.id, req.auth!.userId);
  res.status(204).send();
}));

router.get('/room-month-extras', asyncHandler(async (req, res) => {
  const buildingId = String(req.query.building_id ?? req.query.buildingId ?? '').trim() || undefined;
  const roomId = String(req.query.room_id ?? req.query.roomId ?? '').trim() || undefined;
  const month = String(req.query.month ?? '').trim() || undefined;
  res.json(await listRoomMonthExtras(req.auth!.userId, { buildingId, roomId, month }));
}));

router.get('/room-month-extras/:id', asyncHandler(async (req, res) => {
  res.json(await getRoomMonthExtra(req.params.id, req.auth!.userId));
}));

router.post('/room-month-extras', asyncHandler(async (req, res) => {
  const body = parseBody(roomMonthExtraCreateSchema, req.body);
  res.status(201).json(await createRoomMonthExtra(body, req.auth!.userId));
}));

router.patch('/room-month-extras/:id', asyncHandler(async (req, res) => {
  const body = parseBody(roomMonthExtraUpdateSchema, req.body);
  res.json(await updateRoomMonthExtra(req.params.id, body, req.auth!.userId));
}));

router.delete('/room-month-extras/:id', asyncHandler(async (req, res) => {
  await deleteRoomMonthExtra(req.params.id, req.auth!.userId);
  res.status(204).send();
}));

router.get('/resolve', asyncHandler(async (req, res) => {
  const contractId = String(req.query.contract_id ?? req.query.contractId ?? '').trim();
  const month = String(req.query.month ?? '').trim();
  if (!contractId || !month) {
    res.status(400).json({ message: 'contract_id and month are required', code: 'VALIDATION_ERROR' });
    return;
  }

  res.json(await resolveFixedChargesPreview(contractId, month, req.auth!.userId));
}));

export default router;
