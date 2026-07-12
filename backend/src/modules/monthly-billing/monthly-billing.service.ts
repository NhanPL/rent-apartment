import { query } from '../../db';
import { firstDayOfMonth } from '../../shared/utils/date';

type DbRow = Record<string, any>;

export type MonthlyBillingAction =
  | 'ENTER_READING'
  | 'REVIEW_READING'
  | 'CORRECT_READING'
  | 'GENERATE_INVOICE'
  | 'REVIEW_DRAFT'
  | 'WAITING_PAYMENT'
  | 'RECONCILE_PAYMENT'
  | 'PAID';

export const getMonthlyBillingAction = (row: DbRow): MonthlyBillingAction => {
  if (row.invoice_status === 'PAID' || Number(row.outstanding_amount ?? 0) <= 0 && row.invoice_id) return 'PAID';
  if (row.payment_request_status === 'TRANSFER_SUBMITTED') return 'RECONCILE_PAYMENT';
  if (row.invoice_status === 'ISSUED' || row.invoice_status === 'OVERDUE') return 'WAITING_PAYMENT';
  if (row.invoice_status === 'DRAFT') return 'REVIEW_DRAFT';
  if (row.reading_status === 'APPROVED') return 'GENERATE_INVOICE';
  if (row.reading_status === 'SUBMITTED') return 'REVIEW_READING';
  if (row.reading_status === 'REJECTED') return 'CORRECT_READING';
  return 'ENTER_READING';
};

export const listMonthlyBilling = async (managerId: string, buildingId: string | undefined, monthValue: string | undefined) => {
  const month = firstDayOfMonth(monthValue);
  const params: unknown[] = [managerId, month];
  const buildingCondition = buildingId ? `AND b.id=$3` : '';
  if (buildingId) params.push(buildingId);

  const { rows } = await query<DbRow>(
    `SELECT b.id AS building_id, b.name AS building_name,
            r.id AS room_id, r.code AS room_code,
            c.id AS contract_id, c.contract_code,
            tenant.id AS tenant_id, tenant.full_name AS primary_tenant,
            ur.id AS reading_id, ur.status AS reading_status,
            i.id AS invoice_id, i.status AS invoice_status, i.total::float AS invoice_total,
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
       SELECT id, status FROM payment_request
       WHERE invoice_id=i.id AND status NOT IN ('CANCELLED','EXPIRED')
       ORDER BY created_at DESC LIMIT 1
     ) pr ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(amount), 0) AS amount FROM payment
       WHERE invoice_id=i.id AND status='SUCCEEDED'
     ) paid ON true
     WHERE c.status='ACTIVE' AND b.manager_user_id=$1 ${buildingCondition}
     ORDER BY b.name, r.code`,
    params
  );

  return { month, items: rows.map((row) => ({ ...row, next_action: getMonthlyBillingAction(row) })) };
};
