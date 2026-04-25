import { Router } from 'express';
import { query } from '../../db';
import { requireRole } from '../../shared/middleware/auth';

const router = Router();

router.get('/', requireRole('MANAGER'), async (_req, res) => {
  const { rows } = await query('SELECT * FROM tenant ORDER BY created_at DESC');
  res.json(rows);
});

router.get('/:id', requireRole('MANAGER'), async (req, res) => {
  const [tenant, room] = await Promise.all([
    query('SELECT * FROM tenant WHERE id=$1', [req.params.id]),
    query('SELECT * FROM vw_tenant_current_room WHERE tenant_id=$1', [req.params.id])
  ]);
  res.json({ ...tenant.rows[0], current_room: room.rows[0] ?? null });
});

router.post('/', requireRole('MANAGER'), async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO tenant(user_id, full_name, dob, gender, identity_number, identity_issued_date, identity_issued_place, email, phone, permanent_address, status, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [b.user_id ?? null, b.full_name, b.dob ?? null, b.gender ?? null, b.identity_number, b.identity_issued_date ?? null, b.identity_issued_place ?? null, b.email ?? null, b.phone, b.permanent_address ?? null, b.status ?? 'ACTIVE', b.note ?? null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', requireRole('MANAGER'), async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `UPDATE tenant SET full_name=$1,dob=$2,gender=$3,email=$4,phone=$5,permanent_address=$6,status=$7,note=$8 WHERE id=$9 RETURNING *`,
    [b.full_name, b.dob ?? null, b.gender ?? null, b.email ?? null, b.phone, b.permanent_address ?? null, b.status, b.note ?? null, req.params.id]
  );
  res.json(rows[0] ?? null);
});

export default router;
