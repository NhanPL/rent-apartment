import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { firstDayOfMonth } from '../../shared/utils/date';
import { resolveFixedChargesForContract, type ResolvedFixedCharge } from '../fixed-charges/fixed-charges.service';

type DbRow = Record<string, any>;
type AuthScope = { userId: string; role: 'MANAGER' | 'TENANT' };
type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'OVERDUE';
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];

export interface InvoiceUpsertPayload {
  contract_id: string;
  room_id: string;
  month: string;
  status: InvoiceStatus;
  issued_at?: string | null;
  due_date?: string | null;
  note?: string | null;
  discount: number;
  rent_amount: number;
  other_fees: number;
  electricity_prev: number;
  electricity_curr: number;
  water_prev: number;
  water_curr: number;
  electric_unit_price: number;
  water_unit_price: number;
}

export interface InvoiceGeneratePayload {
  month: string;
  room_id?: string;
  building_id?: string;
}

const calc = (q: number, p: number) => Number((q * p).toFixed(2));
const toNumber = (value: unknown): number => Number(value ?? 0);
const fixedChargeItemCode = (chargeCode: string) => `FIXED_${chargeCode}`.slice(0, 50);
const invoiceItemsSubtotal = (payload: InvoiceUpsertPayload) => {
  const electricAmount = calc(Math.max(0, payload.electricity_curr - payload.electricity_prev), payload.electric_unit_price);
  const waterAmount = calc(Math.max(0, payload.water_curr - payload.water_prev), payload.water_unit_price);
  const subtotal = payload.rent_amount + electricAmount + waterAmount + payload.other_fees;
  const total = Math.max(0, subtotal - payload.discount);

  return { electricAmount, waterAmount, subtotal, total };
};

const invoiceListProjection = `
  i.*,
  b.id AS building_id,
  b.name AS building_name,
  r.code AS room_code,
  tenant.id AS tenant_id,
  COALESCE(tenant.full_name, '-') AS tenant_name,
  COALESCE(room_rent.amount, 0)::float AS rent_amount,
  COALESCE(electricity.unit_price, rate.electricity_unit_price, 0)::float AS electric_unit_price,
  COALESCE(water.unit_price, rate.water_unit_price, 0)::float AS water_unit_price,
  COALESCE(NULLIF(electricity.meta->>'prev', '')::numeric, ur.electricity_prev, 0)::float AS electricity_prev,
  COALESCE(NULLIF(electricity.meta->>'curr', '')::numeric, ur.electricity_curr, 0)::float AS electricity_curr,
  COALESCE(NULLIF(water.meta->>'prev', '')::numeric, ur.water_prev, 0)::float AS water_prev,
  COALESCE(NULLIF(water.meta->>'curr', '')::numeric, ur.water_curr, 0)::float AS water_curr,
  COALESCE(electricity.quantity, 0)::float AS electric_usage,
  COALESCE(water.quantity, 0)::float AS water_usage,
  COALESCE(electricity.amount, 0)::float AS electric_amount,
  COALESCE(water.amount, 0)::float AS water_amount,
  COALESCE(other_fee.amount, GREATEST(i.subtotal - COALESCE(room_rent.amount, 0) - COALESCE(electricity.amount, 0) - COALESCE(water.amount, 0), 0), 0)::float AS other_fees,
  COALESCE(paid_payment.amount, 0)::float AS paid_amount,
  latest_payment.paid_at,
  latest_payment.status AS payment_status
`;

const invoiceListJoins = `
  JOIN contract c ON c.id=i.contract_id
  JOIN room r ON r.id=i.room_id
  JOIN building b ON b.id=r.building_id
  LEFT JOIN utility_reading ur ON ur.id=i.utility_reading_id
  LEFT JOIN LATERAL (
    SELECT t.id, t.full_name
    FROM contract_tenant ct
    JOIN tenant t ON t.id=ct.tenant_id
    WHERE ct.contract_id=i.contract_id AND ct.left_at IS NULL
    ORDER BY ct.is_primary DESC, ct.joined_at DESC
    LIMIT 1
  ) tenant ON true
  LEFT JOIN LATERAL (
    SELECT * FROM invoice_item WHERE invoice_id=i.id AND code='ROOM_RENT' ORDER BY created_at DESC LIMIT 1
  ) room_rent ON true
  LEFT JOIN LATERAL (
    SELECT * FROM invoice_item WHERE invoice_id=i.id AND code='ELECTRICITY' ORDER BY created_at DESC LIMIT 1
  ) electricity ON true
  LEFT JOIN LATERAL (
    SELECT * FROM invoice_item WHERE invoice_id=i.id AND code='WATER' ORDER BY created_at DESC LIMIT 1
  ) water ON true
  LEFT JOIN LATERAL (
    SELECT * FROM invoice_item WHERE invoice_id=i.id AND code='OTHER' ORDER BY created_at DESC LIMIT 1
  ) other_fee ON true
  LEFT JOIN LATERAL (
    SELECT *
    FROM utility_rate
    WHERE building_id=b.id AND effective_from <= i.month
    ORDER BY effective_from DESC
    LIMIT 1
  ) rate ON true
  LEFT JOIN LATERAL (
    SELECT p.status, p.paid_at
    FROM payment p
    WHERE p.invoice_id=i.id
    ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
    LIMIT 1
  ) latest_payment ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount), 0) AS amount
    FROM payment p
    WHERE p.invoice_id=i.id AND p.status='SUCCEEDED'
  ) paid_payment ON true
`;

const getScopedInvoiceForManager = async (client: TxClient, invoiceId: string, managerId: string) => {
  const { rows } = await client.query<DbRow>(
    `SELECT i.*
     FROM invoice i
     JOIN room r ON r.id=i.room_id
     JOIN building b ON b.id=r.building_id
     WHERE i.id=$1 AND b.manager_user_id=$2
     FOR UPDATE OF i`,
    [invoiceId, managerId]
  );

  const invoice = rows[0];
  if (!invoice) throw new AppError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  return invoice;
};

const getContractForInvoicePayload = async (client: TxClient, payload: InvoiceUpsertPayload, managerId: string) => {
  const { rows } = await client.query<DbRow>(
    `SELECT c.*, r.building_id, r.base_rent
     FROM contract c
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE c.id=$1 AND c.room_id=$2 AND b.manager_user_id=$3`,
    [payload.contract_id, payload.room_id, managerId]
  );

  const contract = rows[0];
  if (!contract) throw new AppError(404, 'Active contract not found for room', 'CONTRACT_NOT_FOUND');
  if (contract.status !== 'ACTIVE') throw new AppError(409, 'Only active contracts can be invoiced', 'CONTRACT_NOT_ACTIVE');
  return contract;
};

const assertUniqueInvoiceMonth = async (client: TxClient, contractId: string, month: string, invoiceId?: string) => {
  const { rows } = await client.query(
    `SELECT id FROM invoice WHERE contract_id=$1 AND month=$2 AND ($3::uuid IS NULL OR id<>$3) LIMIT 1`,
    [contractId, month, invoiceId ?? null]
  );
  if (rows[0]) throw new AppError(409, 'Invoice already exists for contract/month', 'INVOICE_ALREADY_EXISTS');
};

const upsertUtilityReadingForInvoice = async (client: TxClient, payload: InvoiceUpsertPayload, month: string, managerId: string) => {
  if (payload.electricity_curr < payload.electricity_prev || payload.water_curr < payload.water_prev) {
    throw new AppError(400, 'Current reading must be greater or equal previous reading', 'INVALID_UTILITY_READING');
  }

  const existing = await client.query<DbRow>(
    `SELECT id FROM utility_reading WHERE room_id=$1 AND month=$2 FOR UPDATE`,
    [payload.room_id, month]
  );

  if (existing.rows[0]) {
    const updated = await client.query<DbRow>(
      `UPDATE utility_reading
       SET electricity_prev=$1,electricity_curr=$2,water_prev=$3,water_curr=$4,status='INVOICED',
           verified_by_user_id=$5,verified_at=COALESCE(verified_at, now()),
           approved_by_user_id=$5,approved_at=COALESCE(approved_at, now()),note=$6
       WHERE id=$7
       RETURNING *`,
      [payload.electricity_prev, payload.electricity_curr, payload.water_prev, payload.water_curr, managerId, payload.note ?? null, existing.rows[0].id]
    );
    return updated.rows[0];
  }

  const created = await client.query<DbRow>(
    `INSERT INTO utility_reading(room_id, month, electricity_prev, electricity_curr, water_prev, water_curr, status,
       reported_by_user_id, reported_at, submitted_at, verified_by_user_id, verified_at, approved_by_user_id, approved_at, note)
     VALUES($1,$2,$3,$4,$5,$6,'INVOICED',$7,now(),now(),$7,now(),$7,now(),$8)
     RETURNING *`,
    [payload.room_id, month, payload.electricity_prev, payload.electricity_curr, payload.water_prev, payload.water_curr, managerId, payload.note ?? null]
  );
  return created.rows[0];
};

const insertInvoiceItems = async (
  client: TxClient,
  invoiceId: string,
  items: Array<[string, string, number, number, number, Record<string, unknown>]>
) => {
  for (const item of items) {
    await client.query(
      `INSERT INTO invoice_item(invoice_id,code,name,quantity,unit_price,amount,meta)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [invoiceId, item[0], item[1], item[2], item[3], item[4], item[5]]
    );
  }
};

const replaceInvoiceItems = async (client: TxClient, invoiceId: string, payload: InvoiceUpsertPayload, amounts: ReturnType<typeof invoiceItemsSubtotal>) => {
  await client.query('DELETE FROM invoice_item WHERE invoice_id=$1', [invoiceId]);

  const electricUsage = Math.max(0, payload.electricity_curr - payload.electricity_prev);
  const waterUsage = Math.max(0, payload.water_curr - payload.water_prev);
  const items: Array<[string, string, number, number, number, Record<string, unknown>]> = [
    ['ROOM_RENT', 'Room rent', 1, payload.rent_amount, payload.rent_amount, { source: 'manual' }],
    ['ELECTRICITY', 'Electricity', electricUsage, payload.electric_unit_price, amounts.electricAmount, { source: 'manual', prev: payload.electricity_prev, curr: payload.electricity_curr }],
    ['WATER', 'Water', waterUsage, payload.water_unit_price, amounts.waterAmount, { source: 'manual', prev: payload.water_prev, curr: payload.water_curr }],
    ['OTHER', 'Other fees', 1, payload.other_fees, payload.other_fees, { source: 'manual' }]
  ];

  await insertInvoiceItems(client, invoiceId, items);
};

const getDueDate = (month: string, billingDay: number) => {
  const dueDate = new Date(`${month}T00:00:00.000Z`);
  dueDate.setUTCDate(Math.min(Math.max(Number(billingDay || 1), 1), 28));
  return dueDate.toISOString().slice(0, 10);
};

const toFixedChargeInvoiceItems = (fixedCharges: ResolvedFixedCharge[]) =>
  fixedCharges
    .filter((item) => item.quantity > 0 && item.amount > 0)
    .map((item): [string, string, number, number, number, Record<string, unknown>] => [
      fixedChargeItemCode(item.charge_code),
      item.charge_name,
      item.quantity,
      item.unit_price,
      item.amount,
      {
        source: 'generated:fixed_charge',
        charge_id: item.charge_id,
        charge_code: item.charge_code,
        charge_type: item.charge_type,
        priority_source: item.source,
        source_id: item.source_id,
        effective_from: item.effective_from,
        persons_count: item.persons_count,
        vehicles_count: item.vehicles_count,
        room_month_extra_id: item.room_month_extra_id
      }
    ]);

const generateInvoiceForContract = async (client: TxClient, contract: DbRow, month: string, managerId: string) => {
  const duplicate = await client.query('SELECT id FROM invoice WHERE contract_id=$1 AND month=$2 LIMIT 1', [contract.id, month]);
  if (duplicate.rows[0]) {
    return { skipped: true, contract_id: contract.id, room_id: contract.room_id, reason: 'INVOICE_ALREADY_EXISTS' };
  }

  const readingRs = await client.query<DbRow>(
    `SELECT *
     FROM utility_reading
     WHERE room_id=$1 AND month=$2 AND status='APPROVED'
     ORDER BY approved_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [contract.room_id, month]
  );
  const reading = readingRs.rows[0];
  if (!reading) {
    return { skipped: true, contract_id: contract.id, room_id: contract.room_id, reason: 'APPROVED_READING_REQUIRED' };
  }

  const rateRs = await client.query<DbRow>(
    `SELECT *
     FROM utility_rate
     WHERE building_id=$1 AND effective_from <= $2
     ORDER BY effective_from DESC
     LIMIT 1`,
    [contract.building_id, month]
  );
  const rate = rateRs.rows[0];
  if (!rate) {
    return { skipped: true, contract_id: contract.id, room_id: contract.room_id, reason: 'UTILITY_RATE_REQUIRED' };
  }

  const electricUsage = Math.max(0, toNumber(reading.electricity_curr) - toNumber(reading.electricity_prev));
  const waterUsage = Math.max(0, toNumber(reading.water_curr) - toNumber(reading.water_prev));
  const rent = toNumber(contract.rent_price);
  const electricAmount = calc(electricUsage, toNumber(rate.electricity_unit_price));
  const waterAmount = calc(waterUsage, toNumber(rate.water_unit_price));
  const fixedCharges = await resolveFixedChargesForContract(client, {
    contractId: contract.id,
    roomId: contract.room_id,
    buildingId: contract.building_id,
    month
  });
  const fixedChargesAmount = fixedCharges.reduce((sum, item) => sum + item.amount, 0);
  const subtotal = rent + electricAmount + waterAmount + fixedChargesAmount;

  const created = await client.query<DbRow>(
    `INSERT INTO invoice(contract_id, room_id, utility_reading_id, month, status, issued_at, due_date, note, subtotal, discount, total, approved_by_user_id, approved_at)
     VALUES($1,$2,$3,$4,'ISSUED',now(),$5,$6,$7,0,$7,$8,now())
     RETURNING *`,
    [
      contract.id,
      contract.room_id,
      reading.id,
      month,
      getDueDate(month, Number(contract.billing_day ?? 1)),
      'Generated monthly invoice',
      subtotal,
      managerId
    ]
  );
  const invoice = created.rows[0];

  await insertInvoiceItems(client, invoice.id, [
    ['ROOM_RENT', 'Room rent', 1, rent, rent, { source: 'generated:contract.rent_price', contract_id: contract.id }],
    ['ELECTRICITY', 'Electricity', electricUsage, toNumber(rate.electricity_unit_price), electricAmount, { source: 'generated:utility_reading', reading_id: reading.id, rate_id: rate.id, prev: reading.electricity_prev, curr: reading.electricity_curr }],
    ['WATER', 'Water', waterUsage, toNumber(rate.water_unit_price), waterAmount, { source: 'generated:utility_reading', reading_id: reading.id, rate_id: rate.id, prev: reading.water_prev, curr: reading.water_curr }],
    ...toFixedChargeInvoiceItems(fixedCharges)
  ]);

  await client.query(
    `UPDATE utility_reading
     SET status='INVOICED', verified_by_user_id=COALESCE(verified_by_user_id, $2), verified_at=COALESCE(verified_at, now())
     WHERE id=$1`,
    [reading.id, managerId]
  );

  return { skipped: false, invoice };
};

const getContractsForGeneration = async (client: TxClient, managerId: string, filters: { roomId?: string; buildingId?: string }) => {
  const params: unknown[] = [managerId];
  const conditions = [`c.status='ACTIVE'`, `b.manager_user_id=$1`];
  if (filters.roomId) {
    params.push(filters.roomId);
    conditions.push(`c.room_id=$${params.length}`);
  }
  if (filters.buildingId) {
    params.push(filters.buildingId);
    conditions.push(`b.id=$${params.length}`);
  }

  const { rows } = await client.query<DbRow>(
    `SELECT c.*, r.building_id, r.code AS room_code, b.name AS building_name
     FROM contract c
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.name, r.code`,
    params
  );
  return rows;
};

export const generateInvoicesForScope = async (payload: InvoiceGeneratePayload, managerId: string) => {
  const month = firstDayOfMonth(payload.month);
  return withTransaction(async (client) => {
    const contracts = await getContractsForGeneration(client, managerId, { roomId: payload.room_id, buildingId: payload.building_id });
    if (payload.room_id && contracts.length === 0) throw new AppError(404, 'Active contract not found for room', 'CONTRACT_NOT_FOUND');
    if (payload.building_id && contracts.length === 0) throw new AppError(404, 'No active contracts found for building', 'CONTRACT_NOT_FOUND');
    if (!payload.room_id && !payload.building_id && contracts.length === 0) throw new AppError(404, 'No active contracts found', 'CONTRACT_NOT_FOUND');

    const generated: DbRow[] = [];
    const skipped: DbRow[] = [];
    for (const contract of contracts) {
      const result = await generateInvoiceForContract(client, contract, month, managerId);
      if (result.skipped) skipped.push(result);
      else if (result.invoice) generated.push(result.invoice);
    }

    return { month, generated, skipped, total: contracts.length };
  });
};

export const updateInvoiceStatus = async (invoiceId: string, managerId: string, action: 'issue' | 'void' | 'mark-overdue') => {
  const updatedId = await withTransaction(async (client) => {
    const invoice = await getScopedInvoiceForManager(client, invoiceId, managerId);
    if (action === 'issue') {
      if (invoice.status === 'VOID' || invoice.status === 'PAID') throw new AppError(409, 'Closed invoice cannot be issued', 'INVOICE_CLOSED');
      await client.query(`UPDATE invoice SET status='ISSUED', issued_at=COALESCE(issued_at, now()) WHERE id=$1`, [invoiceId]);
    } else if (action === 'void') {
      if (invoice.status === 'PAID') throw new AppError(409, 'Paid invoice cannot be voided', 'INVOICE_PAID');
      await client.query(`UPDATE invoice SET status='VOID' WHERE id=$1`, [invoiceId]);
    } else {
      if (invoice.status !== 'ISSUED') throw new AppError(409, 'Only issued invoices can be marked overdue', 'INVOICE_NOT_ISSUED');
      await client.query(`UPDATE invoice SET status='OVERDUE' WHERE id=$1`, [invoiceId]);
    }
    return invoiceId;
  });

  return getInvoiceDetail(updatedId, { userId: managerId, role: 'MANAGER' });
};

export const createInvoiceFromReading = async (utilityReadingId: string, managerId: string) =>
  withTransaction(async (client) => {
    const readingRs = await client.query<DbRow>(
      `SELECT ur.*, b.id building_id FROM utility_reading ur
       JOIN room r ON r.id=ur.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ur.id=$1 AND b.manager_user_id=$2`,
      [utilityReadingId, managerId]
    );
    const reading = readingRs.rows[0];
    if (!reading) throw new AppError(404, 'Reading not found');
    if (reading.status !== 'APPROVED') throw new AppError(409, 'Reading must be APPROVED to invoice');

    const contractRs = await client.query<DbRow>(
      `SELECT c.*, r.building_id
       FROM contract c
       JOIN room r ON r.id=c.room_id
       WHERE c.room_id=$1 AND c.status='ACTIVE'
       ORDER BY c.start_date DESC
       LIMIT 1`,
      [reading.room_id]
    );
    const contract = contractRs.rows[0];
    if (!contract) throw new AppError(409, 'No active contract for room');

    const month = firstDayOfMonth(reading.month);
    const existed = await client.query('SELECT id FROM invoice WHERE contract_id=$1 AND month=$2', [contract.id, month]);
    if (existed.rows[0]) throw new AppError(409, 'Invoice already exists for contract/month');

    const rateRs = await client.query<DbRow>(
      `SELECT * FROM utility_rate WHERE building_id=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`,
      [reading.building_id, month]
    );
    const rate = rateRs.rows[0];
    if (!rate) throw new AppError(409, 'No utility rate configured');

    const elecUsage = Math.max(0, Number(reading.electricity_curr) - Number(reading.electricity_prev ?? 0));
    const waterUsage = Math.max(0, Number(reading.water_curr) - Number(reading.water_prev ?? 0));

    const elecAmount = calc(elecUsage, Number(rate.electricity_unit_price));
    const waterAmount = calc(waterUsage, Number(rate.water_unit_price));
    const rent = Number(contract.rent_price);
    const fixedCharges = await resolveFixedChargesForContract(client, {
      contractId: contract.id,
      roomId: reading.room_id,
      buildingId: reading.building_id,
      month
    });
    const fixedChargesAmount = fixedCharges.reduce((sum, item) => sum + item.amount, 0);

    const invRs = await client.query<DbRow>(
      `INSERT INTO invoice(contract_id, room_id, utility_reading_id, month, status, issued_at, due_date, subtotal, discount, total, approved_by_user_id, approved_at)
       VALUES($1,$2,$3,$4,'ISSUED',now(),$5,$6,0,$6,$7,now()) RETURNING *`,
      [contract.id, reading.room_id, reading.id, month, month, rent + elecAmount + waterAmount + fixedChargesAmount, managerId]
    );
    const invoice = invRs.rows[0];

    await insertInvoiceItems(client, invoice.id, [
      ['ROOM_RENT', 'Room rent', 1, rent, rent, { source: 'generated:contract.rent_price', contract_id: contract.id }],
      ['ELECTRICITY', 'Electricity', elecUsage, Number(rate.electricity_unit_price), elecAmount, { source: 'generated:utility_reading', reading_id: reading.id, rate_id: rate.id, prev: reading.electricity_prev, curr: reading.electricity_curr }],
      ['WATER', 'Water', waterUsage, Number(rate.water_unit_price), waterAmount, { source: 'generated:utility_reading', reading_id: reading.id, rate_id: rate.id, prev: reading.water_prev, curr: reading.water_curr }],
      ...toFixedChargeInvoiceItems(fixedCharges)
    ]);

    await client.query(`UPDATE utility_reading SET status='INVOICED' WHERE id=$1`, [reading.id]);

    return invoice;
  });

export const addInvoiceAdjustment = async (invoiceId: string, amount: number, reason: string, userId: string) =>
  withTransaction(async (client) => {
    const invRs = await client.query<DbRow>(
      `SELECT i.*
       FROM invoice i
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE i.id=$1 AND b.manager_user_id=$2`,
      [invoiceId, userId]
    );
    const inv = invRs.rows[0];
    if (!inv) throw new AppError(404, 'Invoice not found');
    if (inv.status === 'PAID' || inv.status === 'VOID') throw new AppError(409, 'Cannot adjust closed invoice');

    const type = amount > 0 ? 'MANUAL_ADD' : 'MANUAL_DISCOUNT';
    await client.query(
      `INSERT INTO invoice_adjustment(invoice_id, adjustment_type, amount, reason, created_by_user_id)
       VALUES($1,$2,$3,$4,$5)`,
      [invoiceId, type, amount, reason, userId]
    );

    const total = Number(inv.total) + amount;
    if (total < 0) throw new AppError(400, 'Invoice total cannot be negative');

    const subtotal = Number(inv.subtotal) + (amount > 0 ? amount : 0);
    const discount = Number(inv.discount) + (amount < 0 ? Math.abs(amount) : 0);
    const updated = await client.query<DbRow>(
      `UPDATE invoice SET subtotal=$1, discount=$2, total=$3, adjustment_note=$4 WHERE id=$5 RETURNING *`,
      [subtotal, discount, total, reason, invoiceId]
    );
    return updated.rows[0];
  });

export const listInvoices = async (scope: AuthScope) => {
  if (scope.role === 'MANAGER') {
    return (await query(
      `SELECT ${invoiceListProjection}
       FROM invoice i
       ${invoiceListJoins}
       WHERE b.manager_user_id=$1
       ORDER BY i.month DESC, i.created_at DESC`,
      [scope.userId]
    )).rows;
  }

  return (await query(
    `SELECT DISTINCT ${invoiceListProjection}
     FROM invoice i
     ${invoiceListJoins}
     WHERE EXISTS (
       SELECT 1
       FROM contract_tenant ct_scope
       JOIN tenant t_scope ON t_scope.id=ct_scope.tenant_id
       WHERE ct_scope.contract_id=i.contract_id AND t_scope.user_id=$1
     )
     ORDER BY i.month DESC, i.created_at DESC`,
    [scope.userId]
  )).rows;
};

export const getInvoiceDetail = async (id: string, scope: AuthScope) => {
  const invoiceQuery = scope.role === 'MANAGER'
    ? query(
      `SELECT ${invoiceListProjection}
       FROM invoice i
       ${invoiceListJoins}
       WHERE i.id=$1 AND b.manager_user_id=$2`,
      [id, scope.userId]
    )
    : query(
      `SELECT DISTINCT ${invoiceListProjection}
       FROM invoice i
       ${invoiceListJoins}
       WHERE i.id=$1 AND EXISTS (
         SELECT 1
         FROM contract_tenant ct_scope
         JOIN tenant t_scope ON t_scope.id=ct_scope.tenant_id
         WHERE ct_scope.contract_id=i.contract_id AND t_scope.user_id=$2
       )`,
      [id, scope.userId]
    );

  const [invoice, items, adjustments] = await Promise.all([
    invoiceQuery,
    query('SELECT * FROM invoice_item WHERE invoice_id=$1 ORDER BY created_at', [id]),
    query('SELECT * FROM invoice_adjustment WHERE invoice_id=$1 ORDER BY created_at', [id])
  ]);
  if (!invoice.rows[0]) throw new AppError(404, 'Invoice not found');
  return { ...invoice.rows[0], items: items.rows, adjustments: adjustments.rows };
};

export const createManualInvoice = async (payload: InvoiceUpsertPayload, managerId: string) => {
  const invoiceId = await withTransaction(async (client) => {
    await getContractForInvoicePayload(client, payload, managerId);
    const month = firstDayOfMonth(payload.month);
    await assertUniqueInvoiceMonth(client, payload.contract_id, month);

    const reading = await upsertUtilityReadingForInvoice(client, payload, month, managerId);
    const amounts = invoiceItemsSubtotal(payload);

    const created = await client.query<DbRow>(
      `INSERT INTO invoice(contract_id, room_id, utility_reading_id, month, status, issued_at, due_date, note, subtotal, discount, total, approved_by_user_id, approved_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       RETURNING *`,
      [
        payload.contract_id,
        payload.room_id,
        reading.id,
        month,
        payload.status,
        payload.issued_at ?? null,
        payload.due_date ?? null,
        payload.note ?? null,
        amounts.subtotal,
        payload.discount,
        amounts.total,
        managerId
      ]
    );

    await replaceInvoiceItems(client, created.rows[0].id, payload, amounts);
    return created.rows[0].id as string;
  });

  return getInvoiceDetail(invoiceId, { userId: managerId, role: 'MANAGER' });
};

export const updateManualInvoice = async (invoiceId: string, payload: InvoiceUpsertPayload, managerId: string) => {
  await withTransaction(async (client) => {
    await getScopedInvoiceForManager(client, invoiceId, managerId);
    await getContractForInvoicePayload(client, payload, managerId);
    const month = firstDayOfMonth(payload.month);
    await assertUniqueInvoiceMonth(client, payload.contract_id, month, invoiceId);

    const reading = await upsertUtilityReadingForInvoice(client, payload, month, managerId);
    const amounts = invoiceItemsSubtotal(payload);

    await client.query(
      `UPDATE invoice
       SET contract_id=$1,room_id=$2,utility_reading_id=$3,month=$4,status=$5,issued_at=$6,due_date=$7,note=$8,subtotal=$9,discount=$10,total=$11,
           approved_by_user_id=COALESCE(approved_by_user_id, $12), approved_at=COALESCE(approved_at, now())
       WHERE id=$13`,
      [
        payload.contract_id,
        payload.room_id,
        reading.id,
        month,
        payload.status,
        payload.issued_at ?? null,
        payload.due_date ?? null,
        payload.note ?? null,
        amounts.subtotal,
        payload.discount,
        amounts.total,
        managerId,
        invoiceId
      ]
    );

    await replaceInvoiceItems(client, invoiceId, payload, amounts);
  });

  return getInvoiceDetail(invoiceId, { userId: managerId, role: 'MANAGER' });
};

export const deleteManualInvoice = async (invoiceId: string, managerId: string) =>
  withTransaction(async (client) => {
    await getScopedInvoiceForManager(client, invoiceId, managerId);

    const blocking = await client.query(
      `SELECT id FROM payment WHERE invoice_id=$1
       UNION ALL
       SELECT id FROM payment_request WHERE invoice_id=$1
       LIMIT 1`,
      [invoiceId]
    );
    if (blocking.rows[0]) throw new AppError(409, 'Cannot delete invoice with payment activity', 'INVOICE_HAS_PAYMENTS');

    await client.query('DELETE FROM invoice WHERE id=$1', [invoiceId]);
  });

export const getInvoicePrefill = async (roomId: string, monthValue: string | undefined, managerId: string) => {
  const month = firstDayOfMonth(monthValue);
  const roomRs = await query<DbRow>(
    `SELECT r.*
     FROM room r
     JOIN building b ON b.id=r.building_id
     WHERE r.id=$1 AND b.manager_user_id=$2`,
    [roomId, managerId]
  );
  const room = roomRs.rows[0];
  if (!room) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');

  const [contractRs, readingRs, invoiceRs, rateRs] = await Promise.all([
    query<DbRow>(
      `SELECT c.*, tenant.id AS tenant_id, tenant.full_name AS tenant_name
       FROM contract c
       LEFT JOIN LATERAL (
         SELECT t.id, t.full_name
         FROM contract_tenant ct
         JOIN tenant t ON t.id=ct.tenant_id
         WHERE ct.contract_id=c.id AND ct.left_at IS NULL
         ORDER BY ct.is_primary DESC, ct.joined_at DESC
         LIMIT 1
       ) tenant ON true
       WHERE c.room_id=$1 AND c.status='ACTIVE'
       ORDER BY c.start_date DESC, c.created_at DESC
       LIMIT 1`,
      [roomId]
    ),
    query<DbRow>(
      `SELECT *
       FROM utility_reading
       WHERE room_id=$1 AND month <= $2
       ORDER BY month DESC, created_at DESC
       LIMIT 1`,
      [roomId, month]
    ),
    query<DbRow>(
      `SELECT ii.amount
       FROM invoice i
       JOIN invoice_item ii ON ii.invoice_id=i.id AND ii.code='ROOM_RENT'
       WHERE i.room_id=$1 AND i.month <= $2
       ORDER BY i.month DESC, i.created_at DESC
       LIMIT 1`,
      [roomId, month]
    ),
    query<DbRow>(
      `SELECT *
       FROM utility_rate
       WHERE building_id=$1 AND effective_from <= $2
       ORDER BY effective_from DESC
       LIMIT 1`,
      [room.building_id, month]
    )
  ]);

  const contract = contractRs.rows[0];
  const reading = readingRs.rows[0];
  const latestRent = toNumber(invoiceRs.rows[0]?.amount);
  const billingDay = Number(contract?.billing_day ?? 1);
  const dueDate = new Date(`${month}T00:00:00.000Z`);
  dueDate.setUTCDate(Math.min(Math.max(billingDay, 1), 28));
  const fixedCharges = contract
    ? await resolveFixedChargesForContract({ query }, {
        contractId: contract.id,
        roomId,
        buildingId: room.building_id,
        month
      })
    : [];

  return {
    building_id: room.building_id,
    contract_id: contract?.id ?? '',
    tenant_id: contract?.tenant_id ?? null,
    tenant_name: contract?.tenant_name ?? null,
    issued_at: new Date().toISOString().slice(0, 10),
    due_date: contract ? dueDate.toISOString().slice(0, 10) : null,
    rent_amount: latestRent > 0 ? latestRent : toNumber(contract?.rent_price ?? room.base_rent),
    electricity_prev: toNumber(reading?.electricity_curr ?? reading?.electricity_prev),
    water_prev: toNumber(reading?.water_curr ?? reading?.water_prev),
    electric_unit_price: toNumber(rateRs.rows[0]?.electricity_unit_price),
    water_unit_price: toNumber(rateRs.rows[0]?.water_unit_price),
    other_fees: fixedCharges.reduce((sum, item) => sum + item.amount, 0),
    fixed_charges: fixedCharges
  };
};
