import { query } from '../../db';
import { firstDayOfMonth } from '../../shared/utils/date';
import type {
  DatabaseNumeric,
  InvoiceStatus,
  PaymentRequestStatus,
  UtilityReadingStatus
} from '../../shared/types/database';
import { assertNever } from '../../shared/types/database';

interface MonthlyBillingRow {
  building_id: string;
  building_name: string;
  room_id: string;
  room_code: string;
  contract_id: string;
  contract_code: string | null;
  tenant_id: string | null;
  primary_tenant: string | null;
  reading_id: string | null;
  reading_status: UtilityReadingStatus | null;
  invoice_id: string | null;
  invoice_status: InvoiceStatus | null;
  invoice_total: DatabaseNumeric | null;
  voided_invoice_id: string | null;
  payment_request_id: string | null;
  payment_request_status: PaymentRequestStatus | null;
  paid_amount: DatabaseNumeric;
  outstanding_amount: DatabaseNumeric;
}

export type MonthlyBillingAction =
  | 'ENTER_READING'
  | 'REVIEW_READING'
  | 'CORRECT_READING'
  | 'GENERATE_INVOICE'
  | 'REPLACE_VOID_INVOICE'
  | 'REVIEW_DRAFT'
  | 'WAITING_PAYMENT'
  | 'RECONCILE_PAYMENT'
  | 'PAID';

export const getMonthlyBillingAction = (row: MonthlyBillingRow): MonthlyBillingAction => {
  if (Number(row.outstanding_amount ?? 0) <= 0 && row.invoice_id) return 'PAID';
  if (row.payment_request_status === 'TRANSFER_SUBMITTED') return 'RECONCILE_PAYMENT';

  const invoiceStatus = row.invoice_status ?? null;
  switch (invoiceStatus) {
    case 'PAID': return 'PAID';
    case 'ISSUED':
    case 'PARTIALLY_PAID': return 'WAITING_PAYMENT';
    case 'DRAFT': return 'REVIEW_DRAFT';
    case 'VOID':
    case null: break;
    default: return assertNever(invoiceStatus, 'Unsupported invoice status');
  }

  if (row.voided_invoice_id) return 'REPLACE_VOID_INVOICE';
  const readingStatus = row.reading_status ?? null;
  switch (readingStatus) {
    case 'APPROVED': return 'GENERATE_INVOICE';
    case 'SUBMITTED': return 'REVIEW_READING';
    case 'REJECTED': return 'CORRECT_READING';
    case 'DRAFT':
    case 'INVOICED':
    case null: return 'ENTER_READING';
    default: return assertNever(readingStatus, 'Unsupported utility reading status');
  }
};

export const listMonthlyBilling = async (managerId: string, buildingId: string | undefined, monthValue: string | undefined) => {
  const month = firstDayOfMonth(monthValue);
  const params: unknown[] = [managerId, month];
  const buildingCondition = buildingId ? `AND b.id=$3` : '';
  if (buildingId) params.push(buildingId);

  const { rows } = await query<MonthlyBillingRow>(
    `SELECT b.id AS building_id, b.name AS building_name,
            r.id AS room_id, r.code AS room_code,
            c.id AS contract_id, c.contract_code,
            tenant.id AS tenant_id, tenant.full_name AS primary_tenant,
            ur.id AS reading_id, ur.status AS reading_status,
            i.id AS invoice_id, i.status AS invoice_status, i.total::float AS invoice_total,
            voided_invoice.id AS voided_invoice_id,
            pr.id AS payment_request_id, pr.status AS payment_request_status,
            COALESCE(paid.amount, 0)::float AS paid_amount,
            GREATEST(COALESCE(i.total, 0) - COALESCE(paid.amount, 0), 0)::float AS outstanding_amount
     FROM contract c
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     LEFT JOIN LATERAL (
       SELECT t.id, t.full_name
       FROM contract_tenant ct JOIN tenant t ON t.id=ct.tenant_id
       WHERE ct.contract_id=c.id AND (ct.left_at IS NULL OR ct.left_at >= $2)
       ORDER BY ct.is_primary DESC, ct.joined_at ASC LIMIT 1
     ) tenant ON true
     LEFT JOIN LATERAL (
       SELECT id, status FROM utility_reading
       WHERE room_id=r.id AND month=$2
       ORDER BY created_at DESC LIMIT 1
     ) ur ON true
     LEFT JOIN LATERAL (
       SELECT id, status, total FROM invoice
       WHERE contract_id=c.id AND month=$2 AND status<>'VOID'
       ORDER BY created_at DESC LIMIT 1
     ) i ON true
     LEFT JOIN LATERAL (
       SELECT id FROM invoice
       WHERE contract_id=c.id AND month=$2 AND status='VOID'
       ORDER BY voided_at DESC NULLS LAST, created_at DESC LIMIT 1
     ) voided_invoice ON i.id IS NULL
     LEFT JOIN LATERAL (
       SELECT id, status FROM payment_request
       WHERE invoice_id=i.id AND status NOT IN ('CANCELLED','EXPIRED')
       ORDER BY created_at DESC LIMIT 1
     ) pr ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(CASE WHEN entry_type='REVERSAL' THEN -amount ELSE amount END), 0) AS amount FROM payment
       WHERE invoice_id=i.id AND status='SUCCEEDED'
     ) paid ON true
     WHERE c.status='ACTIVE' AND b.manager_user_id=$1 ${buildingCondition}
     ORDER BY b.name, r.code`,
    params
  );

  return { month, items: rows.map((row) => ({ ...row, next_action: getMonthlyBillingAction(row) })) };
};
