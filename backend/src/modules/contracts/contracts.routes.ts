import { Router } from 'express';
import { query, withTransaction } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';

const router = Router();
type DbRow = Record<string, any>;

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

router.get('/', requireRole('MANAGER'), asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT * FROM contract ORDER BY created_at DESC');
  res.json(rows);
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const [contract, tenants] = await Promise.all([
    query('SELECT * FROM contract WHERE id=$1', [req.params.id]),
    query('SELECT * FROM contract_tenant WHERE contract_id=$1', [req.params.id])
  ]);
  res.json({ ...contract.rows[0], tenants: tenants.rows });
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const b = req.body as Record<string, any>;
  const data = await withTransaction(async (client) => {
    const contractCode = b.contract_code ?? (await generateContractCode(client));
    const c = await client.query<DbRow>(
      `INSERT INTO contract(room_id,contract_code,status,start_date,end_date,move_in_date,move_out_date,rent_price,deposit_amount,billing_day,note)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.room_id, contractCode, b.status ?? 'DRAFT', b.start_date, b.end_date ?? null, b.move_in_date ?? null, b.move_out_date ?? null, b.rent_price ?? 0, b.deposit_amount ?? 0, b.billing_day ?? 1, b.note ?? null]
    );

    if (Array.isArray(b.tenants)) {
      for (const t of b.tenants) {
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
