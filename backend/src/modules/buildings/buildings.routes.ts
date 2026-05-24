import { Router } from 'express';
import { query } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';

const router = Router();

router.get('/', requireRole('MANAGER'), asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT * FROM building ORDER BY created_at DESC');
  res.json(rows);
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM building WHERE id = $1', [req.params.id]);
  res.json(rows[0] ?? null);
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { code, name, address, note } = req.body;
  const { rows } = await query(
    `INSERT INTO building(manager_user_id, code, name, address, note)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.auth!.userId, code, name, address, note ?? null]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { code, name, address, note } = req.body;
  const { rows } = await query(
    `UPDATE building SET code=$1, name=$2, address=$3, note=$4 WHERE id=$5 RETURNING *`,
    [code, name, address, note ?? null, req.params.id]
  );
  res.json(rows[0] ?? null);
}));

export default router;
