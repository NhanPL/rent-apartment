import { Router } from 'express';
import { query } from '../../db';
import { requireRole } from '../../shared/middleware/auth';

const router = Router();

router.get('/', requireRole('MANAGER'), async (req, res) => {
  const buildingId = req.query.buildingId as string | undefined;
  const { rows } = buildingId
    ? await query('SELECT * FROM room WHERE building_id=$1 ORDER BY code', [buildingId])
    : await query('SELECT * FROM room ORDER BY created_at DESC');
  res.json(rows);
});

router.get('/:id', requireRole('MANAGER'), async (req, res) => {
  const { rows } = await query('SELECT * FROM room WHERE id=$1', [req.params.id]);
  res.json(rows[0] ?? null);
});

router.post('/', requireRole('MANAGER'), async (req, res) => {
  const { building_id, code, floor, area_m2, status, base_rent, deposit_default, max_occupants, note } = req.body;
  const { rows } = await query(
    `INSERT INTO room(building_id,code,floor,area_m2,status,base_rent,deposit_default,max_occupants,note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [building_id, code, floor ?? null, area_m2 ?? null, status ?? 'ACTIVE', base_rent ?? 0, deposit_default ?? 0, max_occupants ?? 1, note ?? null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', requireRole('MANAGER'), async (req, res) => {
  const { code, floor, area_m2, status, base_rent, deposit_default, max_occupants, note } = req.body;
  const { rows } = await query(
    `UPDATE room SET code=$1,floor=$2,area_m2=$3,status=$4,base_rent=$5,deposit_default=$6,max_occupants=$7,note=$8 WHERE id=$9 RETURNING *`,
    [code, floor ?? null, area_m2 ?? null, status, base_rent, deposit_default, max_occupants, note ?? null, req.params.id]
  );
  res.json(rows[0] ?? null);
});

router.get('/:id/occupancy', requireRole('MANAGER'), async (req, res) => {
  const { rows } = await query('SELECT * FROM vw_room_occupancy WHERE room_id = $1', [req.params.id]);
  res.json(rows[0] ?? null);
});

export default router;
