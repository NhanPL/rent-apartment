import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { firstDayOfMonth } from '../../shared/utils/date';
import { resolveFixedChargesForContract, type ResolvedFixedCharge } from '../fixed-charges/fixed-charges.service';
import { env } from '../../config/env';
import { createVietQrPaymentData } from '../payments/vietqr.service';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import type {
  DatabaseDate,
  DatabaseNumeric,
  DatabaseTimestamp,
  ContractStatus,
  InvoiceStatus as DatabaseInvoiceStatus,
  PaymentStatus,
  UtilityReadingStatus
} from '../../shared/types/database';
import { toDatabaseNumber, toDateString } from '../../shared/types/database';
import {
  paginationOffset,
  sqlSortDirection,
  type PaginatedResult,
  type PaginationParams
} from '../../shared/utils/pagination';

// Internal implementation shared by invoice command, query, and generation services.

interface InvoiceBoundaryRow {
  id: string;
  contract_id: string;
  room_id: string;
  utility_reading_id: string | null;
  replaces_invoice_id: string | null;
  replacement_invoice_id: string | null;
  month: DatabaseDate;
  status: DatabaseInvoiceStatus | ContractStatus | UtilityReadingStatus;
  issued_at: DatabaseTimestamp | null;
  due_date: DatabaseDate | null;
  subtotal: DatabaseNumeric;
  discount: DatabaseNumeric;
  total: DatabaseNumeric;
  void_reason: string | null;
  note: string | null;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
  contract_code: string;
  start_date: DatabaseDate;
  end_date: DatabaseDate | null;
  rent_price: DatabaseNumeric;
  deposit_amount: DatabaseNumeric;
  billing_day: number;
  building_id: string;
  building_name: string;
  room_code: string;
  base_rent: DatabaseNumeric;
  tenant_id: string | null;
  tenant_name: string | null;
  electricity_prev: DatabaseNumeric | null;
  electricity_curr: DatabaseNumeric | null;
  water_prev: DatabaseNumeric | null;
  water_curr: DatabaseNumeric | null;
  electricity_unit_price: DatabaseNumeric;
  electric_unit_price: DatabaseNumeric;
  water_unit_price: DatabaseNumeric;
  rent_amount: DatabaseNumeric;
  other_fees: DatabaseNumeric;
  paid_amount: DatabaseNumeric;
  payment_status: PaymentStatus | null;
  reading_status: UtilityReadingStatus;
  quantity: DatabaseNumeric;
  unit_price: DatabaseNumeric;
  amount: DatabaseNumeric;
  code: string;
  name: string;
  meta: Record<string, unknown> | null;
  [column: string]: unknown;
}
type DbRow = InvoiceBoundaryRow;
type AuthScope = { userId: string; role: 'MANAGER' | 'TENANT' };
type InvoiceStatus = DatabaseInvoiceStatus;
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];

const invoiceColumnNames = [
  'id', 'contract_id', 'room_id', 'utility_reading_id', 'month', 'status', 'issued_at',
  'due_date', 'note', 'subtotal', 'discount', 'total', 'approved_by_user_id', 'approved_at',
  'void_reason', 'voided_by_user_id', 'voided_at', 'adjustment_note', 'replaces_invoice_id',
  'created_at', 'updated_at'
] as const;
const invoiceColumns = (alias?: string) => invoiceColumnNames
  .map((column) => alias ? `${alias}.${column}` : column)
  .join(', ');
const contractColumns = (alias?: string) => [
  'id', 'room_id', 'contract_code', 'status', 'start_date', 'end_date', 'move_in_date',
  'move_out_date', 'rent_price', 'deposit_amount', 'billing_day', 'note', 'created_at', 'updated_at'
].map((column) => alias ? `${alias}.${column}` : column).join(', ');
const readingColumns = (alias?: string) => [
  'id', 'room_id', 'month', 'electricity_prev', 'electricity_curr', 'water_prev', 'water_curr',
  'status', 'reported_by_user_id', 'reported_at', 'submitted_at', 'verified_by_user_id',
  'verified_at', 'approved_by_user_id', 'approved_at', 'rejected_by_user_id', 'rejected_at',
  'rejection_reason', 'manager_note', 'note', 'created_at', 'updated_at'
].map((column) => alias ? `${alias}.${column}` : column).join(', ');
const rateColumns = (alias?: string) => [
  'id', 'building_id', 'effective_from', 'electricity_unit_price', 'water_unit_price',
  'note', 'created_at', 'updated_at'
].map((column) => alias ? `${alias}.${column}` : column).join(', ');
const invoiceItemColumns = 'id, invoice_id, code, name, quantity, unit_price, amount, meta, created_at';
const invoiceAdjustmentColumns = 'id, invoice_id, adjustment_type, amount, reason, created_by_user_id, created_at';

const invoiceAuditSnapshot = (invoice: DbRow): Record<string, unknown> => ({
  contractId: invoice.contract_id,
  roomId: invoice.room_id,
  utilityReadingId: invoice.utility_reading_id,
  month: invoice.month,
  status: invoice.status,
  dueDate: invoice.due_date,
  subtotal: invoice.subtotal,
  discount: invoice.discount,
  total: invoice.total,
  voidReason: invoice.void_reason,
  replacesInvoiceId: invoice.replaces_invoice_id,
  note: invoice.note
});

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

export interface InvoiceIssuePaymentPayload {
  bank_code?: string;
  bank_account_no?: string;
  bank_account_name?: string;
  transfer_note?: string;
}

export interface InvoiceVoidPayload {
  reason: string;
}

export type InvoiceSortBy = 'month' | 'createdAt' | 'dueDate' | 'total' | 'status' | 'building' | 'room' | 'tenant';

export interface InvoiceListFilters extends PaginationParams<InvoiceSortBy> {
  search?: string;
  month?: string;
  invoiceStatus?: DatabaseInvoiceStatus;
  paymentStatus?: PaymentStatus;
  buildingId?: string;
  roomId?: string;
  tenantId?: string;
}

export interface InvoiceSummary {
  totalInvoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  totalRevenue: number;
}

const calc = (q: number, p: number) => Number((q * p).toFixed(2));
const toNumber = (value: DatabaseNumeric | null | undefined): number => toDatabaseNumber(value);
const fixedChargeItemCode = (chargeCode: string) => `FIXED_${chargeCode}`.slice(0, 50);
const invoiceItemsSubtotal = (payload: InvoiceUpsertPayload) => {
  const electricAmount = calc(Math.max(0, payload.electricity_curr - payload.electricity_prev), payload.electric_unit_price);
  const waterAmount = calc(Math.max(0, payload.water_curr - payload.water_prev), payload.water_unit_price);
  const subtotal = payload.rent_amount + electricAmount + waterAmount + payload.other_fees;
  const total = Math.max(0, subtotal - payload.discount);

  return { electricAmount, waterAmount, subtotal, total };
};

const invoiceListProjection = `
  ${invoiceColumns('i')},
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
  latest_payment.status AS payment_status,
  (SELECT replacement.id
   FROM invoice replacement
   WHERE replacement.replaces_invoice_id=i.id
   ORDER BY replacement.created_at DESC
   LIMIT 1) AS replacement_invoice_id
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
    SELECT amount FROM invoice_item WHERE invoice_id=i.id AND code='ROOM_RENT' ORDER BY created_at DESC LIMIT 1
  ) room_rent ON true
  LEFT JOIN LATERAL (
    SELECT quantity, unit_price, amount, meta FROM invoice_item WHERE invoice_id=i.id AND code='ELECTRICITY' ORDER BY created_at DESC LIMIT 1
  ) electricity ON true
  LEFT JOIN LATERAL (
    SELECT quantity, unit_price, amount, meta FROM invoice_item WHERE invoice_id=i.id AND code='WATER' ORDER BY created_at DESC LIMIT 1
  ) water ON true
  LEFT JOIN LATERAL (
    SELECT amount FROM invoice_item WHERE invoice_id=i.id AND code='OTHER' ORDER BY created_at DESC LIMIT 1
  ) other_fee ON true
  LEFT JOIN LATERAL (
    SELECT id, building_id, effective_from, electricity_unit_price, water_unit_price
    FROM utility_rate
    WHERE building_id=b.id AND effective_from <= i.month
    ORDER BY effective_from DESC
    LIMIT 1
  ) rate ON true
  LEFT JOIN LATERAL (
    SELECT p.status, p.paid_at
    FROM payment p
    WHERE p.invoice_id=i.id AND p.entry_type='PAYMENT'
    ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
    LIMIT 1
  ) latest_payment ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(CASE WHEN p.entry_type='REVERSAL' THEN -p.amount ELSE p.amount END), 0) AS amount
    FROM payment p
    WHERE p.invoice_id=i.id AND p.status='SUCCEEDED'
  ) paid_payment ON true
`;

const getScopedInvoiceForManager = async (client: TxClient, invoiceId: string, managerId: string) => {
  const { rows } = await client.query<DbRow>(
    `SELECT ${invoiceColumns('i')}
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
    `SELECT ${contractColumns('c')}, r.building_id, r.base_rent
     FROM contract c
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE c.id=$1 AND c.room_id=$2 AND b.manager_user_id=$3
     FOR UPDATE OF c`,
    [payload.contract_id, payload.room_id, managerId]
  );

  const contract = rows[0];
  if (!contract) throw new AppError(404, 'Active contract not found for room', 'CONTRACT_NOT_FOUND');
  if (contract.status !== 'ACTIVE') throw new AppError(409, 'Only active contracts can be invoiced', 'CONTRACT_NOT_ACTIVE');
  return contract;
};

const assertUniqueInvoiceMonth = async (client: TxClient, contractId: string, month: string, invoiceId?: string) => {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id
     FROM invoice
     WHERE contract_id=$1 AND month=$2 AND status<>'VOID'
       AND ($3::uuid IS NULL OR id<>$3)
     LIMIT 1`,
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
       RETURNING ${readingColumns()}`,
      [payload.electricity_prev, payload.electricity_curr, payload.water_prev, payload.water_curr, managerId, payload.note ?? null, existing.rows[0].id]
    );
    return updated.rows[0];
  }

  const created = await client.query<DbRow>(
    `INSERT INTO utility_reading(room_id, month, electricity_prev, electricity_curr, water_prev, water_curr, status,
       reported_by_user_id, reported_at, submitted_at, verified_by_user_id, verified_at, approved_by_user_id, approved_at, note)
     VALUES($1,$2,$3,$4,$5,$6,'INVOICED',$7,now(),now(),$7,now(),$7,now(),$8)
     RETURNING ${readingColumns()}`,
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

type GenerateInvoiceResult =
  | { skipped: true; contract_id: string; room_id: string; reason: string }
  | { skipped: false; invoice: DbRow };

const generateInvoiceForContract = async (
  client: TxClient,
  contract: DbRow,
  month: string,
  managerId: string
): Promise<GenerateInvoiceResult> => {
  const duplicate = await client.query<{ id: string }>(
    `SELECT id FROM invoice WHERE contract_id=$1 AND month=$2 AND status<>'VOID' LIMIT 1`,
    [contract.id, month]
  );
  if (duplicate.rows[0]) {
    return { skipped: true, contract_id: contract.id, room_id: contract.room_id, reason: 'INVOICE_ALREADY_EXISTS' };
  }

  const readingRs = await client.query<DbRow>(
    `SELECT ${readingColumns()}
     FROM utility_reading
     WHERE room_id=$1 AND month=$2 AND status='APPROVED'
     ORDER BY approved_at DESC NULLS LAST, created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [contract.room_id, month]
  );
  const reading = readingRs.rows[0];
  if (!reading) {
    return { skipped: true, contract_id: contract.id, room_id: contract.room_id, reason: 'APPROVED_READING_REQUIRED' };
  }

  const rateRs = await client.query<DbRow>(
    `SELECT ${rateColumns()}
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
     VALUES($1,$2,$3,$4,'DRAFT',NULL,$5,$6,$7,0,$7,NULL,NULL)
     RETURNING ${invoiceColumns()}`,
    [
      contract.id,
      contract.room_id,
      reading.id,
      month,
      getDueDate(month, Number(contract.billing_day ?? 1)),
      'Generated monthly invoice',
      subtotal
    ]
  );
  const invoice = created.rows[0];

  await insertInvoiceItems(client, invoice.id, [
    ['ROOM_RENT', 'Room rent', 1, rent, rent, { source: 'generated:contract.rent_price', contract_id: contract.id }],
    ['ELECTRICITY', 'Electricity', electricUsage, toNumber(rate.electricity_unit_price), electricAmount, { source: 'generated:utility_reading', reading_id: reading.id, rate_id: rate.id, prev: reading.electricity_prev, curr: reading.electricity_curr }],
    ['WATER', 'Water', waterUsage, toNumber(rate.water_unit_price), waterAmount, { source: 'generated:utility_reading', reading_id: reading.id, rate_id: rate.id, prev: reading.water_prev, curr: reading.water_curr }],
    ...toFixedChargeInvoiceItems(fixedCharges)
  ]);

  await writeAuditLog(client, {
    actorUserId: managerId,
    action: 'INVOICE_CREATED',
    entityType: 'INVOICE',
    entityId: invoice.id,
    after: invoiceAuditSnapshot(invoice),
    metadata: { source: 'MONTHLY_GENERATION' }
  });

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
    `SELECT ${contractColumns('c')}, r.building_id, r.code AS room_code, b.name AS building_name
     FROM contract c
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.name, r.code
     FOR UPDATE OF c`,
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
    const skipped: Array<{ skipped: boolean; contract_id: string; room_id: string; reason: string }> = [];
    for (const contract of contracts) {
      const result = await generateInvoiceForContract(client, contract, month, managerId);
      if (result.skipped) skipped.push(result);
      else if (result.invoice) generated.push(result.invoice);
    }

    return { month, generated, skipped, total: contracts.length };
  });
};

export const updateInvoiceStatus = async (
  invoiceId: string,
  managerId: string,
  action: 'issue' | 'void',
  payload?: InvoiceIssuePaymentPayload | InvoiceVoidPayload
) => {
  const updatedId = await withTransaction(async (client) => {
    const invoice = await getScopedInvoiceForManager(client, invoiceId, managerId);
    let updatedInvoice: DbRow;
    let paymentRequestCreated = false;
    if (action === 'issue') {
      const existingRequest = await client.query<{ id: string }>(
        `SELECT id FROM payment_request WHERE invoice_id=$1 AND status NOT IN ('CANCELLED','EXPIRED') LIMIT 1`,
        [invoiceId]
      );
      if (invoice.status !== 'DRAFT') {
        if (['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status) && existingRequest.rows[0]) {
          return invoiceId;
        }
        throw new AppError(409, 'Only draft invoices can be issued', 'INVOICE_NOT_DRAFT');
      }
      if (!existingRequest.rows[0]) {
        const paid = await client.query<{ paid_amount: string | number }>(
          `SELECT COALESCE(SUM(CASE WHEN entry_type='REVERSAL' THEN -amount ELSE amount END), 0) AS paid_amount
           FROM payment WHERE invoice_id=$1 AND status='SUCCEEDED'`,
          [invoiceId]
        );
        const amount = Math.max(0, toNumber(invoice.total) - toNumber(paid.rows[0]?.paid_amount));
        if (amount <= 0) throw new AppError(409, 'Invoice is already fully paid', 'INVOICE_PAID');
        const issuePayment = payload as InvoiceIssuePaymentPayload | undefined;
        const bankCode = issuePayment?.bank_code ?? env.DEFAULT_BANK_CODE;
        const bankAccountNo = issuePayment?.bank_account_no ?? env.DEFAULT_BANK_ACCOUNT_NO;
        const bankAccountName = issuePayment?.bank_account_name ?? env.DEFAULT_BANK_ACCOUNT_NAME;
        if (!bankCode || !bankAccountNo || !bankAccountName) {
          throw new AppError(400, 'Bank account information is required to issue an invoice', 'BANK_ACCOUNT_REQUIRED');
        }

        const vietQr = createVietQrPaymentData({
          bankCode,
          accountNo: bankAccountNo,
          accountName: bankAccountName,
          amount,
          transferNote: issuePayment?.transfer_note ?? `INV ${invoiceId.slice(0, 8)}`
        });
        await client.query(
          `INSERT INTO payment_request(invoice_id,status,amount,currency,qr_content,qr_image_url,bank_code,bank_account_no,bank_account_name,transfer_note,sent_at,created_by_user_id)
           VALUES($1,'WAITING_TRANSFER',$2,'VND',$3,$4,$5,$6,$7,$8,now(),$9)`,
          [
            invoiceId,
            amount,
            vietQr.qrContent,
            vietQr.qrImageUrl,
            bankCode.trim().toUpperCase(),
            bankAccountNo.trim(),
            bankAccountName.trim(),
            vietQr.normalizedTransferNote,
            managerId
          ]
        );
        paymentRequestCreated = true;
      }
      const issued = await client.query<DbRow>(
        `UPDATE invoice
         SET status='ISSUED', issued_at=now(), approved_by_user_id=$2, approved_at=now()
         WHERE id=$1
         RETURNING ${invoiceColumns()}`,
        [invoiceId, managerId]
      );
      updatedInvoice = issued.rows[0];
      if (invoice.utility_reading_id) {
        await client.query(`UPDATE utility_reading SET status='INVOICED' WHERE id=$1 AND status='APPROVED'`, [invoice.utility_reading_id]);
      }
    } else if (action === 'void') {
      if (!['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status)) {
        throw new AppError(
          409,
          invoice.status === 'DRAFT'
            ? 'Draft invoices must be deleted instead of voided'
            : 'Invoice is already voided',
          invoice.status === 'DRAFT' ? 'INVOICE_DRAFT_REQUIRES_DELETE' : 'INVOICE_ALREADY_VOID'
        );
      }
      const reason = (payload as InvoiceVoidPayload | undefined)?.reason.trim();
      if (!reason) throw new AppError(400, 'Void reason is required', 'INVOICE_VOID_REASON_REQUIRED');

      const voided = await client.query<DbRow>(
        `UPDATE invoice
         SET status='VOID',void_reason=$2,voided_by_user_id=$3,voided_at=now()
         WHERE id=$1
         RETURNING ${invoiceColumns()}`,
        [invoiceId, reason, managerId]
      );
      updatedInvoice = voided.rows[0];
      await client.query(
        `UPDATE payment_proof proof
         SET status='REJECTED',rejected_by_user_id=$2,rejected_at=now(),
             rejection_reason=$3
         FROM payment_request request
         WHERE proof.payment_request_id=request.id
           AND request.invoice_id=$1
           AND proof.status='PENDING'`,
        [invoiceId, managerId, `Invoice voided: ${reason}`]
      );
      await client.query(
        `UPDATE payment_request
         SET status='CANCELLED',note=COALESCE(note || E'\\n', '') || $2
         WHERE invoice_id=$1 AND status NOT IN ('VERIFIED','CANCELLED','EXPIRED')`,
        [invoiceId, `Invoice voided: ${reason}`]
      );
    }
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: action === 'issue' ? 'INVOICE_ISSUED' : 'INVOICE_VOIDED',
      entityType: 'INVOICE',
      entityId: invoiceId,
      before: invoiceAuditSnapshot(invoice),
      after: invoiceAuditSnapshot(updatedInvoice!),
      metadata: action === 'void'
        ? { reason: (payload as InvoiceVoidPayload).reason }
        : { paymentRequestCreated }
    });
    return invoiceId;
  });

  return getInvoiceDetail(updatedId, { userId: managerId, role: 'MANAGER' });
};

export const createInvoiceFromReading = async (utilityReadingId: string, managerId: string) =>
  withTransaction(async (client) => {
    const readingScopeRs = await client.query<DbRow>(
      `SELECT ${readingColumns('ur')}, b.id building_id FROM utility_reading ur
       JOIN room r ON r.id=ur.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ur.id=$1 AND b.manager_user_id=$2`,
      [utilityReadingId, managerId]
    );
    const readingScope = readingScopeRs.rows[0];
    if (!readingScope) throw new AppError(404, 'Reading not found');

    const contractRs = await client.query<DbRow>(
      `SELECT ${contractColumns('c')}, r.building_id
       FROM contract c
       JOIN room r ON r.id=c.room_id
       WHERE c.room_id=$1 AND c.status='ACTIVE'
       ORDER BY c.start_date DESC
       LIMIT 1
       FOR UPDATE OF c`,
      [readingScope.room_id]
    );
    const contract = contractRs.rows[0];
    if (!contract) throw new AppError(409, 'No active contract for room');

    const readingRs = await client.query<DbRow>(
      `SELECT ${readingColumns()}
       FROM utility_reading
       WHERE id=$1 AND room_id=$2
       FOR UPDATE`,
      [utilityReadingId, contract.room_id]
    );
    const reading = readingRs.rows[0];
    if (!reading) throw new AppError(404, 'Reading not found');
    if (reading.status !== 'APPROVED') throw new AppError(409, 'Reading must be APPROVED to invoice');
    reading.building_id = readingScope.building_id;

    const month = firstDayOfMonth(toDateString(reading.month) ?? undefined);
    const existed = await client.query<{ id: string }>('SELECT id FROM invoice WHERE contract_id=$1 AND month=$2', [contract.id, month]);
    if (existed.rows[0]) throw new AppError(409, 'Invoice already exists for contract/month');

    const rateRs = await client.query<DbRow>(
      `SELECT ${rateColumns()} FROM utility_rate
       WHERE building_id=$1 AND effective_from <= $2 ORDER BY effective_from DESC LIMIT 1`,
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
       VALUES($1,$2,$3,$4,'DRAFT',NULL,$5,$6,0,$6,NULL,NULL)
       RETURNING ${invoiceColumns()}`,
      [contract.id, reading.room_id, reading.id, month, month, rent + elecAmount + waterAmount + fixedChargesAmount]
    );
    const invoice = invRs.rows[0];

    await insertInvoiceItems(client, invoice.id, [
      ['ROOM_RENT', 'Room rent', 1, rent, rent, { source: 'generated:contract.rent_price', contract_id: contract.id }],
      ['ELECTRICITY', 'Electricity', elecUsage, Number(rate.electricity_unit_price), elecAmount, { source: 'generated:utility_reading', reading_id: reading.id, rate_id: rate.id, prev: reading.electricity_prev, curr: reading.electricity_curr }],
      ['WATER', 'Water', waterUsage, Number(rate.water_unit_price), waterAmount, { source: 'generated:utility_reading', reading_id: reading.id, rate_id: rate.id, prev: reading.water_prev, curr: reading.water_curr }],
      ...toFixedChargeInvoiceItems(fixedCharges)
    ]);

    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'INVOICE_CREATED',
      entityType: 'INVOICE',
      entityId: invoice.id,
      after: invoiceAuditSnapshot(invoice),
      metadata: { source: 'UTILITY_READING' }
    });

    return invoice;
  });

export const addInvoiceAdjustment = async (invoiceId: string, amount: number, reason: string, userId: string) => {
  await withTransaction(async (client) => {
    const invRs = await client.query<DbRow>(
      `SELECT ${invoiceColumns('i')}
       FROM invoice i
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE i.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF i`,
      [invoiceId, userId]
    );
    const inv = invRs.rows[0];
    if (!inv) throw new AppError(404, 'Invoice not found');
    if (inv.status !== 'DRAFT') throw new AppError(409, 'Only draft invoices can be adjusted', 'INVOICE_NOT_DRAFT');

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
      `UPDATE invoice SET subtotal=$1, discount=$2, total=$3, adjustment_note=$4
       WHERE id=$5 RETURNING ${invoiceColumns()}`,
      [subtotal, discount, total, reason, invoiceId]
    );
    await writeAuditLog(client, {
      actorUserId: userId,
      action: 'INVOICE_UPDATED',
      entityType: 'INVOICE',
      entityId: invoiceId,
      before: invoiceAuditSnapshot(inv),
      after: invoiceAuditSnapshot(updated.rows[0]),
      metadata: { updateType: 'ADJUSTMENT', adjustmentType: type, amount, reason }
    });
  });
  return getInvoiceDetail(invoiceId, { userId, role: 'MANAGER' });
};

export const createReplacementInvoice = async (voidedInvoiceId: string, managerId: string) => {
  const replacementId = await withTransaction(async (client) => {
    const original = await getScopedInvoiceForManager(client, voidedInvoiceId, managerId);
    if (original.status !== 'VOID') {
      throw new AppError(409, 'Only a void invoice can be replaced', 'INVOICE_NOT_VOID');
    }

    const existing = await client.query<{ id: string }>(
      `SELECT id
       FROM invoice
       WHERE replaces_invoice_id=$1
          OR (contract_id=$2 AND month=$3 AND status<>'VOID')
       LIMIT 1`,
      [voidedInvoiceId, original.contract_id, original.month]
    );
    if (existing.rows[0]) {
      throw new AppError(409, 'A replacement invoice already exists', 'INVOICE_REPLACEMENT_EXISTS');
    }

    const created = await client.query<DbRow>(
      `INSERT INTO invoice(
         contract_id,room_id,utility_reading_id,month,status,issued_at,due_date,note,
         subtotal,discount,total,approved_by_user_id,approved_at,replaces_invoice_id
       )
       VALUES($1,$2,$3,$4,'DRAFT',NULL,$5,$6,$7,$8,$9,NULL,NULL,$10)
       RETURNING ${invoiceColumns()}`,
      [
        original.contract_id,
        original.room_id,
        original.utility_reading_id,
        original.month,
        original.due_date,
        `Replacement for void invoice ${voidedInvoiceId}. Review all amounts before issuing.`,
        original.subtotal,
        original.discount,
        original.total,
        voidedInvoiceId
      ]
    );
    const newInvoiceId = created.rows[0]?.id;
    if (!newInvoiceId) {
      throw new AppError(500, 'Unable to create replacement invoice', 'INVOICE_REPLACEMENT_FAILED');
    }

    await client.query(
      `INSERT INTO invoice_item(invoice_id,code,name,quantity,unit_price,amount,meta)
       SELECT $1,code,name,quantity,unit_price,amount,
              COALESCE(meta, '{}'::jsonb) || jsonb_build_object('replacement_source_invoice_id', $2::text)
       FROM invoice_item
       WHERE invoice_id=$2`,
      [newInvoiceId, voidedInvoiceId]
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'INVOICE_CREATED',
      entityType: 'INVOICE',
      entityId: newInvoiceId,
      after: invoiceAuditSnapshot(created.rows[0]),
      metadata: { source: 'VOID_REPLACEMENT', replacedInvoiceId: voidedInvoiceId }
    });
    return newInvoiceId;
  });

  return getInvoiceDetail(replacementId, { userId: managerId, role: 'MANAGER' });
};

const invoiceSortColumns: Record<InvoiceSortBy, string> = {
  month: 'i.month',
  createdAt: 'i.created_at',
  dueDate: 'i.due_date',
  total: 'i.total',
  status: 'i.status',
  building: 'b.name',
  room: 'r.code',
  tenant: 'tenant.full_name'
};

export const listInvoices = async (
  scope: AuthScope,
  filters: InvoiceListFilters
): Promise<PaginatedResult<DbRow>> => {
  const params: unknown[] = [scope.userId];
  const conditions = scope.role === 'MANAGER'
    ? ['b.manager_user_id=$1']
    : [
        "i.status <> 'DRAFT'",
        `EXISTS (
          SELECT 1
          FROM contract_tenant ct_scope
          JOIN tenant t_scope ON t_scope.id=ct_scope.tenant_id
          WHERE ct_scope.contract_id=i.contract_id AND t_scope.user_id=$1
        )`
      ];
  const addCondition = (sql: string, value: unknown) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.search) {
    addCondition(`(
      b.name ILIKE '%' || ? || '%'
      OR r.code ILIKE '%' || ? || '%'
      OR COALESCE(tenant.full_name, '') ILIKE '%' || ? || '%'
      OR COALESCE(c.contract_code, '') ILIKE '%' || ? || '%'
    )`, filters.search);
    const searchParameter = `$${params.length}`;
    conditions[conditions.length - 1] = conditions[conditions.length - 1].split('?').join(searchParameter);
  }
  if (filters.month) addCondition('i.month=?', `${filters.month}-01`);
  if (filters.invoiceStatus) addCondition('i.status=?', filters.invoiceStatus);
  if (filters.paymentStatus) addCondition('latest_payment.status=?', filters.paymentStatus);
  if (filters.buildingId) addCondition('b.id=?', filters.buildingId);
  if (filters.roomId) addCondition('r.id=?', filters.roomId);
  if (filters.tenantId) addCondition('tenant.id=?', filters.tenantId);

  const where = conditions.join(' AND ');
  const sortColumn = invoiceSortColumns[filters.sortBy];
  const direction = sqlSortDirection(filters.sortOrder);
  const countParams = [...params];
  const itemParams = [...params, filters.pageSize, paginationOffset(filters)];
  const limitParameter = `$${itemParams.length - 1}`;
  const offsetParameter = `$${itemParams.length}`;

  const [countResult, itemResult] = await Promise.all([
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM invoice i
       ${invoiceListJoins}
       WHERE ${where}`,
      countParams
    ),
    query<DbRow>(
      `SELECT ${invoiceListProjection}
       FROM invoice i
       ${invoiceListJoins}
       WHERE ${where}
       ORDER BY ${sortColumn} ${direction} NULLS LAST, i.created_at DESC, i.id
       LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
      itemParams
    )
  ]);

  return {
    total: countResult.rows[0]?.total ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    items: itemResult.rows
  };
};

export const getInvoiceSummary = async (
  scope: AuthScope,
  month?: string
): Promise<InvoiceSummary> => {
  const params: unknown[] = [scope.userId];
  const conditions = scope.role === 'MANAGER'
    ? ['b.manager_user_id=$1']
    : [`EXISTS (
        SELECT 1
        FROM contract_tenant ct_scope
        JOIN tenant t_scope ON t_scope.id=ct_scope.tenant_id
        WHERE ct_scope.contract_id=i.contract_id AND t_scope.user_id=$1
      )`];
  if (month) {
    params.push(`${month}-01`);
    conditions.push(`i.month=$${params.length}`);
  }

  const { rows } = await query<{
    total_invoices: number;
    paid_invoices: number;
    unpaid_invoices: number;
    total_revenue: number | string | null;
  }>(
    `SELECT
       COUNT(*)::int AS total_invoices,
       COUNT(*) FILTER (WHERE i.status='PAID')::int AS paid_invoices,
       COUNT(*) FILTER (WHERE i.status NOT IN ('PAID', 'VOID'))::int AS unpaid_invoices,
       COALESCE(SUM(i.total) FILTER (WHERE i.status='PAID'), 0)::float AS total_revenue
     FROM invoice i
     JOIN room r ON r.id=i.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  const row = rows[0];
  return {
    totalInvoices: row?.total_invoices ?? 0,
    paidInvoices: row?.paid_invoices ?? 0,
    unpaidInvoices: row?.unpaid_invoices ?? 0,
    totalRevenue: toNumber(row?.total_revenue)
  };
};

export const getInvoiceDetail = async (id: string, scope: AuthScope) => {
  const invoiceQuery = scope.role === 'MANAGER'
    ? query<DbRow>(
      `SELECT ${invoiceListProjection}
       FROM invoice i
       ${invoiceListJoins}
       WHERE i.id=$1 AND b.manager_user_id=$2`,
      [id, scope.userId]
    )
    : query<DbRow>(
      `SELECT DISTINCT ${invoiceListProjection}
       FROM invoice i
       ${invoiceListJoins}
       WHERE i.id=$1 AND i.status <> 'DRAFT' AND EXISTS (
         SELECT 1
         FROM contract_tenant ct_scope
         JOIN tenant t_scope ON t_scope.id=ct_scope.tenant_id
         WHERE ct_scope.contract_id=i.contract_id AND t_scope.user_id=$2
       )`,
      [id, scope.userId]
    );

  const [invoice, items, adjustments] = await Promise.all([
    invoiceQuery,
    query<DbRow>(`SELECT ${invoiceItemColumns} FROM invoice_item WHERE invoice_id=$1 ORDER BY created_at`, [id]),
    query<DbRow>(`SELECT ${invoiceAdjustmentColumns} FROM invoice_adjustment WHERE invoice_id=$1 ORDER BY created_at`, [id])
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
       VALUES($1,$2,$3,$4,'DRAFT',NULL,$5,$6,$7,$8,$9,$10,now())
     RETURNING ${invoiceColumns()}`,
      [
        payload.contract_id,
        payload.room_id,
        reading.id,
        month,
        payload.due_date ?? null,
        payload.note ?? null,
        amounts.subtotal,
        payload.discount,
        amounts.total,
        managerId
      ]
    );

    await replaceInvoiceItems(client, created.rows[0].id, payload, amounts);
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'INVOICE_CREATED',
      entityType: 'INVOICE',
      entityId: created.rows[0].id,
      after: invoiceAuditSnapshot(created.rows[0]),
      metadata: { source: 'MANUAL' }
    });
    return created.rows[0].id as string;
  });

  return getInvoiceDetail(invoiceId, { userId: managerId, role: 'MANAGER' });
};

export const updateManualInvoice = async (invoiceId: string, payload: InvoiceUpsertPayload, managerId: string) => {
  await withTransaction(async (client) => {
    const invoice = await getScopedInvoiceForManager(client, invoiceId, managerId);
    if (invoice.status !== 'DRAFT') {
      throw new AppError(409, 'Only draft invoices can be edited', 'INVOICE_NOT_DRAFT');
    }
    await getContractForInvoicePayload(client, payload, managerId);
    const month = firstDayOfMonth(payload.month);
    await assertUniqueInvoiceMonth(client, payload.contract_id, month, invoiceId);

    const reading = await upsertUtilityReadingForInvoice(client, payload, month, managerId);
    const amounts = invoiceItemsSubtotal(payload);

    const updated = await client.query<DbRow>(
      `UPDATE invoice
       SET contract_id=$1,room_id=$2,utility_reading_id=$3,month=$4,status='DRAFT',issued_at=NULL,due_date=$5,note=$6,subtotal=$7,discount=$8,total=$9,
           approved_by_user_id=COALESCE(approved_by_user_id, $10), approved_at=COALESCE(approved_at, now())
       WHERE id=$11
       RETURNING ${invoiceColumns()}`,
      [
        payload.contract_id,
        payload.room_id,
        reading.id,
        month,
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
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'INVOICE_UPDATED',
      entityType: 'INVOICE',
      entityId: invoiceId,
      before: invoiceAuditSnapshot(invoice),
      after: invoiceAuditSnapshot(updated.rows[0]),
      metadata: { updateType: 'MANUAL_EDIT' }
    });
  });

  return getInvoiceDetail(invoiceId, { userId: managerId, role: 'MANAGER' });
};

export const deleteManualInvoice = async (invoiceId: string, managerId: string) =>
  withTransaction(async (client) => {
    const invoice = await getScopedInvoiceForManager(client, invoiceId, managerId);
    if (invoice.status !== 'DRAFT') {
      throw new AppError(
        409,
        'Only draft invoices can be permanently deleted. Void an issued invoice instead.',
        'INVOICE_DELETE_REQUIRES_VOID'
      );
    }
    const financialHistory = await client.query<{ has_history: boolean }>(
      `SELECT (
         EXISTS (SELECT 1 FROM payment WHERE invoice_id=$1)
         OR EXISTS (SELECT 1 FROM payment_request WHERE invoice_id=$1)
       ) AS has_history`,
      [invoiceId]
    );
    if (financialHistory.rows[0]?.has_history) {
      throw new AppError(
        409,
        'Draft invoice has payment history and cannot be permanently deleted',
        'INVOICE_HAS_PAYMENT_HISTORY'
      );
    }

    await client.query('DELETE FROM invoice WHERE id=$1', [invoiceId]);

    if (invoice.utility_reading_id) {
      await client.query(
        `UPDATE utility_reading ur
         SET status='APPROVED'
         WHERE ur.id=$1 AND ur.status='INVOICED'
           AND NOT EXISTS (SELECT 1 FROM invoice i WHERE i.utility_reading_id=ur.id)`,
        [invoice.utility_reading_id]
      );
    }
  });

export const getInvoicePrefill = async (roomId: string, monthValue: string | undefined, managerId: string) => {
  const month = firstDayOfMonth(monthValue);
  const roomRs = await query<DbRow>(
    `SELECT r.id, r.building_id, r.code, r.floor, r.area_m2, r.status, r.base_rent,
            r.deposit_default, r.max_occupants, r.note, r.created_at, r.updated_at
     FROM room r
     JOIN building b ON b.id=r.building_id
     WHERE r.id=$1 AND b.manager_user_id=$2`,
    [roomId, managerId]
  );
  const room = roomRs.rows[0];
  if (!room) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');

  const [contractRs, readingRs, invoiceRs, rateRs] = await Promise.all([
    query<DbRow>(
      `SELECT ${contractColumns('c')}, tenant.id AS tenant_id, tenant.full_name AS tenant_name
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
      `SELECT ${readingColumns()}
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
      `SELECT ${rateColumns()}
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
