import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { parseBody } from '../../shared/utils/validation';

const router = Router();

const buildingBodySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  note: z.string().trim().nullable().optional()
});

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM building WHERE manager_user_id=$1 ORDER BY created_at DESC', [req.auth!.userId]);
  res.json(rows);
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM building WHERE id = $1 AND manager_user_id=$2', [req.params.id, req.auth!.userId]);
  if (!rows[0]) throw new AppError(404, 'Building not found', 'BUILDING_NOT_FOUND');
  res.json(rows[0]);
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { code, name, address, note } = parseBody(buildingBodySchema, req.body);
  const { rows } = await query(
    `INSERT INTO building(manager_user_id, code, name, address, note)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.auth!.userId, code, name, address, note ?? null]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { code, name, address, note } = parseBody(buildingBodySchema, req.body);
  const { rows } = await query(
    `UPDATE building SET code=$1, name=$2, address=$3, note=$4 WHERE id=$5 AND manager_user_id=$6 RETURNING *`,
    [code, name, address, note ?? null, req.params.id, req.auth!.userId]
  );
  if (!rows[0]) throw new AppError(404, 'Building not found', 'BUILDING_NOT_FOUND');
  res.json(rows[0]);
}));

export default router;
