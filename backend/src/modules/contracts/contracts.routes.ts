import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { parseBody } from '../../shared/utils/validation';

const router = Router();
type DbRow = Record<string, any>;

const contractTenantSchema = z.object({
  tenant_id: z.string().uuid(),
  is_primary: z.boolean().optional(),
  joined_at: z.string().trim().min(1).optional(),
  left_at: z.string().trim().nullable().optional()
});

const contractCreateSchema = z.object({
  room_id: z.string().uuid(),
  contract_code: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  start_date: z.string().trim().min(1),
  end_date: z.string().trim().nullable().optional(),
  move_in_date: z.string().trim().nullable().optional(),
  move_out_date: z.string().trim().nullable().optional(),
  rent_price: z.coerce.number().nullable().optional(),
  deposit_amount: z.coerce.number().nullable().optional(),
  billing_day: z.coerce.number().int().min(1).max(31).nullable().optional(),
  note: z.string().trim().nullable().optional(),
  tenants: z.array(contractTenantSchema).optional()
});

const generateContractCode = async (client: Parameters<Parameters<typeof withTransaction>[0]>[0]): Promise<string> => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 5; i += 1) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `CONTRACT-${datePart}-${random}`;
    const exists = await client.query('SELECT 1 FROM contract WHERE contract_code = $1 LIMIT 1', [code]);
    if (exists.rows.length === 0) return code;
  }
  throw new Error('Unable to generate unique contract code');
};

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.*
     FROM contract c
     JOIN room r ON r.id = c.room_id
     JOIN building b ON b.id = r.building_id
     WHERE b.manager_user_id=$1
     ORDER BY c.created_at DESC`,
    [req.auth!.userId]
  );
  res.json(rows);
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const contract = await query(
    `SELECT c.*
     FROM contract c
     JOIN room r ON r.id = c.room_id
     JOIN building b ON b.id = r.building_id
     WHERE c.id=$1 AND b.manager_user_id=$2`,
    [req.params.id, req.auth!.userId]
  );
  if (!contract.rows[0]) throw new AppError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');

  const tenants = await query('SELECT * FROM contract_tenant WHERE contract_id=$1', [req.params.id]);
  res.json({ ...contract.rows[0], tenants: tenants.rows });
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const b = parseBody(contractCreateSchema, req.body);
  const room = await query(
    `SELECT r.id
     FROM room r
     JOIN building b ON b.id = r.building_id
     WHERE r.id=$1 AND b.manager_user_id=$2`,
    [b.room_id, req.auth!.userId]
  );
  if (!room.rows[0]) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');

  const data = await withTransaction(async (client) => {
    const contractCode = b.contract_code ?? (await generateContractCode(client));
    const c = await client.query<DbRow>(
      `INSERT INTO contract(room_id,contract_code,status,start_date,end_date,move_in_date,move_out_date,rent_price,deposit_amount,billing_day,note)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.room_id, contractCode, b.status ?? 'DRAFT', b.start_date, b.end_date ?? null, b.move_in_date ?? null, b.move_out_date ?? null, b.rent_price ?? 0, b.deposit_amount ?? 0, b.billing_day ?? 1, b.note ?? null]
    );

    if (b.tenants) {
      for (const t of b.tenants) {
        const tenant = await client.query(
          `SELECT tenant.id
           FROM tenant
           WHERE tenant.id=$1
             AND tenant.status <> $2
             AND (
               NOT EXISTS (
                 SELECT 1
                 FROM contract_tenant ct_scope
                 JOIN contract c_scope ON c_scope.id=ct_scope.contract_id
                 WHERE ct_scope.tenant_id=tenant.id
                   AND ct_scope.left_at IS NULL
                   AND c_scope.status NOT IN ('ENDED','CANCELLED')
               )
               OR EXISTS (
                 SELECT 1
                 FROM contract_tenant ct_scope
                 JOIN contract c_scope ON c_scope.id=ct_scope.contract_id
                 JOIN room r_scope ON r_scope.id=c_scope.room_id
                 JOIN building b_scope ON b_scope.id=r_scope.building_id
                 WHERE ct_scope.tenant_id=tenant.id
                   AND ct_scope.left_at IS NULL
                   AND c_scope.status NOT IN ('ENDED','CANCELLED')
                   AND b_scope.manager_user_id=$3
               )
             )`,
          [t.tenant_id, 'DELETED', req.auth!.userId]
        );
        if (!tenant.rows[0]) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

        await client.query(
          `INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at,left_at) VALUES($1,$2,$3,$4,$5)`,
          [c.rows[0].id, t.tenant_id, t.is_primary ?? false, t.joined_at ?? b.start_date, t.left_at ?? null]
        );
      }
    }
    return c.rows[0];
  });

  res.status(201).json(data);
}));

export default router;
