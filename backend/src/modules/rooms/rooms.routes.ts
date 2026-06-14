import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { parseBody } from '../../shared/utils/validation';

const router = Router();

const nullableString = z.string().trim().nullable().optional();

const roomCreateSchema = z.object({
  building_id: z.string().uuid(),
  code: z.string().trim().min(1),
  floor: z.coerce.number().int().nullable().optional(),
  area_m2: z.coerce.number().nullable().optional(),
  status: z.string().trim().min(1).optional(),
  base_rent: z.coerce.number().nullable().optional(),
  deposit_default: z.coerce.number().nullable().optional(),
  max_occupants: z.coerce.number().int().positive().nullable().optional(),
  note: nullableString
});

const roomUpdateSchema = z.object({
  code: z.string().trim().min(1),
  floor: z.coerce.number().int().nullable().optional(),
  area_m2: z.coerce.number().nullable().optional(),
  status: z.string().trim().min(1),
  base_rent: z.coerce.number().nonnegative(),
  deposit_default: z.coerce.number().nonnegative(),
  max_occupants: z.coerce.number().int().positive(),
  note: nullableString
});

const roomSummarySelect = `
  r.*,
  COALESCE(occupancy.occupants_count, 0)::int AS occupants_count,
  occupancy.active_contract_id,
  latest_invoice.id AS latest_invoice_id,
  latest_invoice.month AS latest_invoice_month,
  latest_invoice.status AS latest_invoice_status,
  latest_invoice.due_date AS latest_invoice_due_date,
  latest_invoice.total::float AS latest_invoice_total,
  latest_reading.id AS latest_reading_id,
  latest_reading.month AS latest_reading_month,
  latest_reading.status AS latest_reading_status
`;

const roomSummaryJoins = `
  LEFT JOIN LATERAL (
    SELECT
      c.id AS active_contract_id,
      COUNT(ct.tenant_id) FILTER (WHERE ct.left_at IS NULL)::int AS occupants_count
    FROM contract c
    LEFT JOIN contract_tenant ct ON ct.contract_id=c.id
    WHERE c.room_id=r.id AND c.status='ACTIVE'
    GROUP BY c.id, c.start_date, c.created_at
    ORDER BY c.start_date DESC, c.created_at DESC
    LIMIT 1
  ) occupancy ON true
  LEFT JOIN LATERAL (
    SELECT i.id, i.month, i.status, i.due_date, i.total
    FROM invoice i
    WHERE i.room_id=r.id
    ORDER BY i.month DESC, i.created_at DESC
    LIMIT 1
  ) latest_invoice ON true
  LEFT JOIN LATERAL (
    SELECT ur.id, ur.month, ur.status
    FROM utility_reading ur
    WHERE ur.room_id=r.id
    ORDER BY ur.month DESC, ur.created_at DESC
    LIMIT 1
  ) latest_reading ON true
`;

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const buildingId = (req.query.buildingId ?? req.query.building_id) as string | undefined;
  const { rows } = buildingId
    ? await query(
      `SELECT ${roomSummarySelect}
       FROM room r
       JOIN building b ON b.id = r.building_id
       ${roomSummaryJoins}
       WHERE r.building_id=$1 AND b.manager_user_id=$2
       ORDER BY r.code`,
      [buildingId, req.auth!.userId]
    )
    : await query(
      `SELECT ${roomSummarySelect}
       FROM room r
       JOIN building b ON b.id = r.building_id
       ${roomSummaryJoins}
       WHERE b.manager_user_id=$1
       ORDER BY r.created_at DESC`,
      [req.auth!.userId]
    );
  res.json(rows);
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${roomSummarySelect}, b.name AS building_name
     FROM room r
     JOIN building b ON b.id = r.building_id
     ${roomSummaryJoins}
     WHERE r.id=$1 AND b.manager_user_id=$2`,
    [req.params.id, req.auth!.userId]
  );
  if (!rows[0]) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');
  res.json(rows[0]);
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { building_id, code, floor, area_m2, status, base_rent, deposit_default, max_occupants, note } = parseBody(roomCreateSchema, req.body);
  const building = await query('SELECT id FROM building WHERE id=$1 AND manager_user_id=$2', [building_id, req.auth!.userId]);
  if (!building.rows[0]) throw new AppError(404, 'Building not found', 'BUILDING_NOT_FOUND');

  const { rows } = await query(
    `INSERT INTO room(building_id,code,floor,area_m2,status,base_rent,deposit_default,max_occupants,note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [building_id, code, floor ?? null, area_m2 ?? null, status ?? 'ACTIVE', base_rent ?? 0, deposit_default ?? 0, max_occupants ?? 1, note ?? null]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { code, floor, area_m2, status, base_rent, deposit_default, max_occupants, note } = parseBody(roomUpdateSchema, req.body);
  const activeOccupancy = await query<{ occupants_count: number }>(
    `SELECT COUNT(ct.tenant_id)::int AS occupants_count
     FROM contract c
     JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE r.id=$1 AND c.status='ACTIVE' AND b.manager_user_id=$2`,
    [req.params.id, req.auth!.userId]
  );
  const occupantsCount = Number(activeOccupancy.rows[0]?.occupants_count ?? 0);
  if (max_occupants !== null && max_occupants !== undefined && max_occupants < occupantsCount) {
    throw new AppError(409, 'Room max occupants cannot be lower than current active occupants', 'ROOM_MAX_OCCUPANTS_EXCEEDED');
  }

  const { rows } = await query(
    `UPDATE room
     SET code=$1,floor=$2,area_m2=$3,status=$4,base_rent=$5,deposit_default=$6,max_occupants=$7,note=$8
     WHERE id=$9
       AND building_id IN (SELECT id FROM building WHERE manager_user_id=$10)
     RETURNING *`,
    [code, floor ?? null, area_m2 ?? null, status, base_rent, deposit_default, max_occupants, note ?? null, req.params.id, req.auth!.userId]
  );
  if (!rows[0]) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');
  res.json(rows[0]);
}));

router.get('/:id/occupancy', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const room = await query(
    `SELECT r.id
     FROM room r
     JOIN building b ON b.id = r.building_id
     WHERE r.id=$1 AND b.manager_user_id=$2`,
    [req.params.id, req.auth!.userId]
  );
  if (!room.rows[0]) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');

  const { rows } = await query('SELECT * FROM vw_room_occupancy WHERE room_id = $1', [req.params.id]);
  res.json(rows[0] ?? null);
}));

router.delete('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const room = await query(
    `SELECT r.id
     FROM room r
     JOIN building b ON b.id=r.building_id
     WHERE r.id=$1 AND b.manager_user_id=$2`,
    [req.params.id, req.auth!.userId]
  );
  if (!room.rows[0]) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');

  const contracts = await query('SELECT id FROM contract WHERE room_id=$1 LIMIT 1', [req.params.id]);
  if (contracts.rows[0]) {
    throw new AppError(409, 'Cannot delete room with existing contracts', 'ROOM_HAS_CONTRACTS');
  }

  await query(
    `DELETE FROM room
     WHERE id=$1
       AND building_id IN (SELECT id FROM building WHERE manager_user_id=$2)`,
    [req.params.id, req.auth!.userId]
  );
  res.status(204).send();
}));

export default router;
