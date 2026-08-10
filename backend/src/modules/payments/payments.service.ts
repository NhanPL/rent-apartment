import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/app-error';
import { createVietQrPaymentData } from './vietqr.service';
import {
  getDocumentRetentionUntil,
  resolveCloudinaryAsset,
  type CloudinaryDeliveryType,
  type UploadResourceType
} from '../uploads/uploads.service';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import {
  enqueuePaymentApproved,
  enqueuePaymentProofRejected
} from '../../shared/services/notification.service';
import type {
  DatabaseNumeric,
  DatabaseTimestamp,
  InvoiceStatus,
  PaymentProofStatus,
  PaymentRequestStatus
} from '../../shared/types/database';
import { toDatabaseNumber } from '../../shared/types/database';
import {
  paginationOffset,
  sqlSortDirection,
  type PaginatedResult,
  type PaginationParams
} from '../../shared/utils/pagination';

interface PaymentBoundaryRow {
  id: string;
  invoice_id: string;
  payment_request_id: string;
  original_payment_id: string | null;
  status: PaymentRequestStatus | PaymentProofStatus | InvoiceStatus | 'SUCCEEDED';
  invoice_status: InvoiceStatus;
  tenant_user_id: string;
  submitted_by_user_id: string;
  idempotency_key: string | null;
  amount: DatabaseNumeric;
  total: DatabaseNumeric;
  invoice_total: DatabaseNumeric;
  transfer_amount: DatabaseNumeric;
  created_at: DatabaseTimestamp;
  submitted_at: DatabaseTimestamp | null;
  [column: string]: unknown;
}
type AuthScope = { userId: string; role: 'MANAGER' | 'TENANT' };

export interface CreatePaymentRequestPayload {
  amount?: number | null;
  currency?: string;
  bank_code?: string | null;
  bank_account_no?: string | null;
  bank_account_name?: string | null;
  transfer_note?: string | null;
  expires_at?: string | null;
}

export interface SubmitPaymentProofPayload {
  file_name?: string | null;
  file_url: string;
  mime_type: string;
  file_size: number;
  resource_type?: UploadResourceType;
  public_id?: string;
  asset_id?: string;
  version?: number;
  format?: string;
  delivery_type?: CloudinaryDeliveryType;
  transfer_amount?: number | null;
  transfer_time?: string | null;
  payer_note?: string | null;
}

export interface PaymentRequestDetail {
  id?: string;
  proofs: PaymentBoundaryRow[];
  [column: string]: unknown;
}

export type PaymentRequestSortBy =
  | 'createdAt'
  | 'month'
  | 'amount'
  | 'status'
  | 'building'
  | 'room'
  | 'tenant'
  | 'latestProofSubmittedAt';

export interface PaymentRequestListFilters extends PaginationParams<PaymentRequestSortBy> {
  search?: string;
  month?: string;
  buildingId?: string;
  roomId?: string;
  tenantId?: string;
  requestStatus?: PaymentRequestStatus;
  latestProofStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE';
}

const toNumber = (value: DatabaseNumeric | null | undefined) => toDatabaseNumber(value);

const sqlColumns = (alias: string, columns: readonly string[]): string => (
  columns.map((column) => `${alias}.${column}`).join(', ')
);
const paymentRequestColumnNames = [
  'id', 'invoice_id', 'status', 'amount', 'currency', 'qr_content', 'qr_image_url',
  'bank_code', 'bank_account_no', 'bank_account_name', 'transfer_note', 'expires_at',
  'sent_at', 'created_by_user_id', 'approved_by_user_id', 'approved_at', 'note',
  'created_at', 'updated_at'
] as const;
const paymentProofColumnNames = [
  'id', 'payment_request_id', 'status', 'file_name', 'file_url', 'mime_type', 'file_size',
  'submitted_by_user_id', 'submitted_at', 'approved_by_user_id', 'approved_at',
  'rejected_by_user_id', 'rejected_at', 'rejection_reason', 'transfer_amount', 'transfer_time',
  'payer_note', 'manager_note', 'cloudinary_asset_id', 'cloudinary_public_id',
  'cloudinary_resource_type', 'cloudinary_version', 'cloudinary_format',
  'cloudinary_delivery_type', 'retention_until', 'idempotency_key', 'created_at', 'updated_at'
] as const;
const paymentColumnNames = [
  'id', 'invoice_id', 'payment_request_id', 'payment_proof_id', 'method', 'status',
  'amount', 'paid_at', 'reference_code', 'note', 'created_by_user_id', 'entry_type',
  'original_payment_id', 'reversal_reason', 'idempotency_key', 'created_at', 'updated_at'
] as const;
const paymentRequestColumns = sqlColumns('pr', paymentRequestColumnNames);
const returnedPaymentRequestColumns = paymentRequestColumnNames.join(', ');
const paymentProofColumns = sqlColumns('pf', paymentProofColumnNames);
const returnedPaymentProofColumns = paymentProofColumnNames.join(', ');
const paymentColumns = sqlColumns('p', paymentColumnNames);
const returnedPaymentColumns = paymentColumnNames.join(', ');

const paymentRequestSummarySelect = `
  ${paymentRequestColumns},
  i.month,
  i.status AS invoice_status,
  i.total::float AS invoice_total,
  i.due_date,
  COALESCE(paid.total_paid, 0)::float AS paid_amount,
  COALESCE(paid.gross_payments, 0)::float AS gross_payment_amount,
  COALESCE(paid.reversals, 0)::float AS reversal_amount,
  GREATEST(i.total - COALESCE(paid.total_paid, 0), 0)::float AS remaining_amount,
  b.id AS building_id,
  b.name AS building_name,
  r.id AS room_id,
  r.code AS room_code,
  tenant_info.tenant_id,
  tenant_info.tenant_name,
  latest_proof.id AS latest_proof_id,
  latest_proof.status AS latest_proof_status,
  latest_proof.submitted_at AS latest_proof_submitted_at
`;

const paymentRequestSummaryJoins = `
  JOIN invoice i ON i.id=pr.invoice_id
  JOIN contract c ON c.id=i.contract_id
  JOIN room r ON r.id=c.room_id
  JOIN building b ON b.id=r.building_id
  LEFT JOIN LATERAL (
    SELECT t.id AS tenant_id, t.full_name AS tenant_name
    FROM contract_tenant ct
    JOIN tenant t ON t.id=ct.tenant_id
    WHERE ct.contract_id=c.id
    ORDER BY ct.is_primary DESC, ct.joined_at ASC
    LIMIT 1
  ) tenant_info ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(CASE WHEN p.entry_type='REVERSAL' THEN -p.amount ELSE p.amount END), 0) AS total_paid,
      COALESCE(SUM(p.amount) FILTER (WHERE p.entry_type='PAYMENT'), 0) AS gross_payments,
      COALESCE(SUM(p.amount) FILTER (WHERE p.entry_type='REVERSAL'), 0) AS reversals
    FROM payment p
    WHERE p.invoice_id=i.id AND p.status='SUCCEEDED'
  ) paid ON true
  LEFT JOIN LATERAL (
    SELECT pf.id, pf.status, pf.submitted_at
    FROM payment_proof pf
    WHERE pf.payment_request_id=pr.id
    ORDER BY pf.created_at DESC
    LIMIT 1
  ) latest_proof ON true
`;

const getInvoicePaidAmount = async (client: PoolClient, invoiceId: string) => {
  const rs = await client.query<{ paid_amount: DatabaseNumeric }>(
    `SELECT COALESCE(SUM(CASE WHEN entry_type='REVERSAL' THEN -amount ELSE amount END), 0) AS paid_amount
     FROM payment
     WHERE invoice_id=$1 AND status='SUCCEEDED'`,
    [invoiceId]
  );
  return toNumber(rs.rows[0]?.paid_amount);
};

export const createPaymentRequest = async (
  invoiceId: string,
  managerId: string,
  payload: CreatePaymentRequestPayload
) =>
  withTransaction(async (client) => {
    const invRs = await client.query<PaymentBoundaryRow>(
      `SELECT i.id, i.contract_id, i.room_id, i.month, i.status, i.total, i.due_date
       FROM invoice i
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE i.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF i`,
      [invoiceId, managerId]
    );
    const inv = invRs.rows[0];
    if (!inv) throw new AppError(404, 'Invoice not found');
    if (!['ISSUED', 'PARTIALLY_PAID'].includes(inv.status)) {
      throw new AppError(409, 'Payment requests require an issued invoice with an outstanding balance', 'INVOICE_NOT_ISSUED');
    }

    const paidAmount = await getInvoicePaidAmount(client, invoiceId);
    const remainingAmount = toNumber(inv.total) - paidAmount;
    if (remainingAmount <= 0) throw new AppError(409, 'Invoice is already fully paid');

    const existing = await client.query<PaymentBoundaryRow>(
      `SELECT ${returnedPaymentRequestColumns} FROM payment_request
       WHERE invoice_id=$1 AND status NOT IN ('CANCELLED', 'EXPIRED')`,
      [invoiceId]
    );
    if (existing.rows[0]) return existing.rows[0];

    const amount = Number(payload.amount ?? remainingAmount);
    if (amount <= 0) throw new AppError(400, 'Amount must be greater than 0');
    if (amount > remainingAmount) throw new AppError(400, 'Amount cannot exceed invoice remaining balance');

    const transferNote = payload.transfer_note ?? `INV-${invoiceId.slice(0, 8)}`;
    const bankCode = payload.bank_code ?? env.DEFAULT_BANK_CODE;
    const bankAccountNo = payload.bank_account_no ?? env.DEFAULT_BANK_ACCOUNT_NO;
    const bankAccountName = payload.bank_account_name ?? env.DEFAULT_BANK_ACCOUNT_NAME;
    if (!bankCode || !bankAccountNo || !bankAccountName) {
      throw new AppError(400, 'Bank account information is required to create a payment request', 'BANK_ACCOUNT_REQUIRED');
    }
    const vietQr = createVietQrPaymentData({
      bankCode,
      accountNo: bankAccountNo,
      accountName: bankAccountName,
      amount,
      transferNote
    });

    const pr = await client.query<PaymentBoundaryRow>(
      `INSERT INTO payment_request(invoice_id,status,amount,currency,qr_content,qr_image_url,bank_code,bank_account_no,bank_account_name,transfer_note,expires_at,sent_at,created_by_user_id)
       VALUES($1,'WAITING_TRANSFER',$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11)
       RETURNING ${returnedPaymentRequestColumns}`,
      [
        invoiceId,
        amount,
        payload.currency ?? 'VND',
        vietQr.qrContent,
        vietQr.qrImageUrl,
        bankCode.trim().toUpperCase(),
        bankAccountNo.trim(),
        bankAccountName.trim(),
        vietQr.normalizedTransferNote,
        payload.expires_at ?? null,
        managerId
      ]
    );
    return pr.rows[0];
  });

export const submitPaymentProof = async (
  paymentRequestId: string,
  payload: SubmitPaymentProofPayload,
  tenantUserId: string,
  idempotencyKey: string
) =>
  withTransaction(async (client) => {
    const reqRs = await client.query<PaymentBoundaryRow>(
      `SELECT ${paymentRequestColumns}, i.total invoice_total, i.status invoice_status, t.user_id tenant_user_id
       FROM payment_request pr
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract_tenant ct ON ct.contract_id=i.contract_id
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE pr.id=$1 AND t.user_id=$2
       FOR UPDATE OF pr, i`,
      [paymentRequestId, tenantUserId]
    );
    const data = reqRs.rows[0];
    if (!data) throw new AppError(404, 'Payment request not found');

    const existingSubmission = await client.query<PaymentBoundaryRow>(
      `SELECT ${returnedPaymentProofColumns} FROM payment_proof
       WHERE submitted_by_user_id=$1 AND idempotency_key=$2
       LIMIT 1`,
      [tenantUserId, idempotencyKey]
    );
    if (existingSubmission.rows[0]) {
      if (existingSubmission.rows[0].payment_request_id !== paymentRequestId) {
        throw new AppError(
          409,
          'This idempotency key was already used for another payment request',
          'IDEMPOTENCY_KEY_REUSED'
        );
      }
      return existingSubmission.rows[0];
    }

    if (!['ISSUED', 'PARTIALLY_PAID'].includes(data.invoice_status)) {
      throw new AppError(409, 'This invoice is not accepting payment proofs', 'INVOICE_NOT_PAYABLE');
    }
    if (!['WAITING_TRANSFER', 'REJECTED'].includes(data.status)) throw new AppError(409, 'Payment request not accepting proofs');

    const pending = await client.query<{ id: string }>(
      `SELECT id FROM payment_proof WHERE payment_request_id=$1 AND status='PENDING' LIMIT 1`,
      [paymentRequestId]
    );
    if (pending.rows[0]) throw new AppError(409, 'A proof is already pending review for this request');

    const paidAmount = await getInvoicePaidAmount(client, data.invoice_id);
    const remainingAmount = toNumber(data.invoice_total) - paidAmount;
    if (remainingAmount <= 0) throw new AppError(409, 'Invoice is already fully paid');

    const transferAmount = Number(payload.transfer_amount ?? remainingAmount);
    if (transferAmount <= 0) throw new AppError(400, 'Transfer amount must be greater than 0');
    if (transferAmount > remainingAmount) throw new AppError(400, 'Transfer amount cannot exceed remaining balance');

    const asset = resolveCloudinaryAsset(payload);
    const created = await client.query<PaymentBoundaryRow>(
      `INSERT INTO payment_proof(
         payment_request_id,status,file_name,file_url,mime_type,file_size,submitted_by_user_id,
         transfer_amount,transfer_time,payer_note,
         cloudinary_asset_id,cloudinary_public_id,cloudinary_resource_type,
         cloudinary_version,cloudinary_format,cloudinary_delivery_type,retention_until,
         idempotency_key
       )
       VALUES($1,'PENDING',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING ${returnedPaymentProofColumns}`,
      [
        paymentRequestId,
        payload.file_name ?? null,
        null,
        payload.mime_type ?? null,
        payload.file_size ?? null,
        tenantUserId,
        transferAmount,
        payload.transfer_time ?? null,
        payload.payer_note ?? null,
        asset.assetId,
        asset.publicId,
        asset.resourceType,
        asset.version,
        asset.format,
        asset.deliveryType,
        getDocumentRetentionUntil('PAYMENT_PROOF'),
        idempotencyKey
      ]
    );
    await client.query(`UPDATE payment_request SET status='TRANSFER_SUBMITTED' WHERE id=$1`, [paymentRequestId]);
    await writeAuditLog(client, {
      actorUserId: tenantUserId,
      action: 'PAYMENT_PROOF_SUBMITTED',
      entityType: 'PAYMENT_PROOF',
      entityId: created.rows[0].id,
      metadata: {
        paymentRequestId,
        invoiceId: data.invoice_id,
        transferAmount
      },
      after: {
        status: created.rows[0].status,
        paymentRequestId,
        transferAmount,
        transferTime: created.rows[0].transfer_time,
        payerNote: created.rows[0].payer_note
      }
    });
    return created.rows[0];
  });

export const reviewPaymentProof = async (proofId: string, approve: boolean, managerId: string, reason?: string) =>
  withTransaction(async (client) => {
    const pfRs = await client.query<PaymentBoundaryRow>(
      `SELECT ${paymentProofColumns}, pr.invoice_id, pr.id payment_request_id, pr.amount request_amount, i.total invoice_total, i.status invoice_status
       FROM payment_proof pf
       JOIN payment_request pr ON pr.id=pf.payment_request_id
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE pf.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF pf, pr, i`,
      [proofId, managerId]
    );
    const proof = pfRs.rows[0];
    if (!proof) throw new AppError(404, 'Proof not found');

    if (approve && proof.status === 'APPROVED') {
      const existingPayment = await client.query<PaymentBoundaryRow>(
        `SELECT ${returnedPaymentColumns} FROM payment
         WHERE payment_proof_id=$1 AND entry_type='PAYMENT'
         LIMIT 1`,
        [proofId]
      );
      if (!existingPayment.rows[0]) {
        throw new AppError(409, 'Approved proof has no payment ledger entry', 'PAYMENT_LEDGER_INCONSISTENT');
      }
      const paidAmount = await getInvoicePaidAmount(client, proof.invoice_id);
      return {
        proof,
        payment: existingPayment.rows[0],
        paid_amount: paidAmount,
        remaining_amount: Math.max(0, toNumber(proof.invoice_total) - paidAmount),
        invoice_status: proof.invoice_status,
        idempotent: true
      };
    }
    if (proof.status !== 'PENDING') throw new AppError(409, 'Proof already reviewed');

    if (!approve) {
      const rejected = await client.query<PaymentBoundaryRow>(
        `UPDATE payment_proof SET status='REJECTED',rejected_by_user_id=$2,rejected_at=now(),rejection_reason=$3
         WHERE id=$1 RETURNING ${returnedPaymentProofColumns}`,
        [proofId, managerId, reason ?? 'Rejected by manager']
      );
      await client.query(`UPDATE payment_request SET status='REJECTED' WHERE id=$1`, [proof.payment_request_id]);
      await writeAuditLog(client, {
        actorUserId: managerId,
        action: 'PAYMENT_PROOF_REJECTED',
        entityType: 'PAYMENT_PROOF',
        entityId: proofId,
        metadata: {
          paymentRequestId: proof.payment_request_id,
          invoiceId: proof.invoice_id,
          reason: reason ?? 'Rejected by manager'
        },
        before: { status: proof.status, transferAmount: proof.transfer_amount },
        after: {
          status: rejected.rows[0].status,
          rejectionReason: rejected.rows[0].rejection_reason
        }
      });
      await enqueuePaymentProofRejected(client, proofId, reason ?? 'Rejected by manager');
      return rejected.rows[0];
    }

    if (!['ISSUED', 'PARTIALLY_PAID'].includes(proof.invoice_status)) {
      throw new AppError(409, 'This invoice is not accepting payments', 'INVOICE_NOT_PAYABLE');
    }

    const paidBeforeApproval = await getInvoicePaidAmount(client, proof.invoice_id);
    const paymentAmount = toNumber(proof.transfer_amount ?? proof.request_amount);
    const remainingBeforeApproval = Math.max(0, toNumber(proof.invoice_total) - paidBeforeApproval);
    if (paymentAmount > remainingBeforeApproval) {
      throw new AppError(
        409,
        'Approving this proof would exceed the invoice balance',
        'PAYMENT_EXCEEDS_INVOICE_BALANCE'
      );
    }

    const approved = await client.query<PaymentBoundaryRow>(
      `UPDATE payment_proof SET status='APPROVED',approved_by_user_id=$2,approved_at=now(),rejection_reason=NULL
       WHERE id=$1 RETURNING ${returnedPaymentProofColumns}`,
      [proofId, managerId]
    );

    const payment = await client.query<PaymentBoundaryRow>(
      `INSERT INTO payment(
         invoice_id,payment_request_id,payment_proof_id,entry_type,method,status,amount,
         paid_at,created_by_user_id,note,idempotency_key
       )
       VALUES($1,$2,$3,'PAYMENT','BANK_TRANSFER','SUCCEEDED',$4,now(),$5,$6,$7)
       RETURNING ${returnedPaymentColumns}`,
      [
        proof.invoice_id,
        proof.payment_request_id,
        proofId,
        paymentAmount,
        managerId,
        'Verified from transfer proof',
        `approve-proof:${proofId}`
      ]
    );

    const paidAmount = await getInvoicePaidAmount(client, proof.invoice_id);
    const fullyPaid = paidAmount >= toNumber(proof.invoice_total);
    const nextRequestStatus = fullyPaid ? 'VERIFIED' : 'WAITING_TRANSFER';
    await client.query(
      `UPDATE payment_request
       SET status=$2, approved_by_user_id=$3, approved_at=CASE WHEN $4 THEN now() ELSE approved_at END
       WHERE id=$1`,
      [proof.payment_request_id, nextRequestStatus, managerId, fullyPaid]
    );

    const invoiceStatus = fullyPaid ? 'PAID' : 'PARTIALLY_PAID';
    await client.query(`UPDATE invoice SET status=$2 WHERE id=$1`, [proof.invoice_id, invoiceStatus]);

    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'PAYMENT_PROOF_APPROVED',
      entityType: 'PAYMENT_PROOF',
      entityId: proofId,
      metadata: {
        paymentId: payment.rows[0].id,
        paymentRequestId: proof.payment_request_id,
        invoiceId: proof.invoice_id,
        amount: paymentAmount
      },
      before: { status: proof.status, transferAmount: proof.transfer_amount },
      after: {
        status: approved.rows[0].status,
        paymentId: payment.rows[0].id,
        amount: paymentAmount
      }
    });

    const remainingAmount = Math.max(0, toNumber(proof.invoice_total) - paidAmount);
    await enqueuePaymentApproved(client, proofId, paymentAmount, remainingAmount);

    return {
      proof: approved.rows[0],
      payment: payment.rows[0],
      paid_amount: paidAmount,
      remaining_amount: remainingAmount,
      invoice_status: invoiceStatus,
      idempotent: false
    };
  });

export const reversePayment = async (paymentId: string, managerId: string, reason: string) =>
  withTransaction(async (client) => {
    const paymentRs = await client.query<PaymentBoundaryRow>(
      `SELECT ${paymentColumns}, i.total AS invoice_total, i.status AS invoice_status
       FROM payment p
       JOIN invoice i ON i.id=p.invoice_id
       JOIN room r ON r.id=i.room_id
       JOIN building b ON b.id=r.building_id
       WHERE p.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF p, i`,
      [paymentId, managerId]
    );
    const original = paymentRs.rows[0];
    if (!original) throw new AppError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (original.entry_type !== 'PAYMENT' || original.status !== 'SUCCEEDED') {
      throw new AppError(409, 'Only an approved payment can be reversed', 'PAYMENT_NOT_REVERSIBLE');
    }

    const existingRs = await client.query<PaymentBoundaryRow>(
      `SELECT ${returnedPaymentColumns} FROM payment
       WHERE original_payment_id=$1 AND entry_type='REVERSAL'
       LIMIT 1`,
      [paymentId]
    );
    if (existingRs.rows[0]) {
      const paidAmount = await getInvoicePaidAmount(client, original.invoice_id);
      return {
        payment: original,
        reversal: existingRs.rows[0],
        paid_amount: paidAmount,
        remaining_amount: Math.max(0, toNumber(original.invoice_total) - paidAmount),
        invoice_status: original.invoice_status,
        idempotent: true
      };
    }

    const reversalRs = await client.query<PaymentBoundaryRow>(
      `INSERT INTO payment(
         invoice_id,payment_request_id,payment_proof_id,entry_type,original_payment_id,
         method,status,amount,paid_at,created_by_user_id,note,reversal_reason,idempotency_key
       )
       VALUES($1,$2,NULL,'REVERSAL',$3,$4,'SUCCEEDED',$5,now(),$6,$7,$7,$8)
       RETURNING ${returnedPaymentColumns}`,
      [
        original.invoice_id,
        original.payment_request_id,
        paymentId,
        original.method,
        original.amount,
        managerId,
        reason,
        `reverse-payment:${paymentId}`
      ]
    );

    const paidAmount = await getInvoicePaidAmount(client, original.invoice_id);
    let invoiceStatus = original.invoice_status;
    if (invoiceStatus !== 'VOID') {
      invoiceStatus = paidAmount >= toNumber(original.invoice_total)
        ? 'PAID'
        : paidAmount > 0
          ? 'PARTIALLY_PAID'
          : 'ISSUED';
      await client.query(`UPDATE invoice SET status=$2 WHERE id=$1`, [original.invoice_id, invoiceStatus]);
      if (original.payment_request_id) {
        await client.query(
          `UPDATE payment_request SET status='WAITING_TRANSFER'
           WHERE id=$1 AND status='VERIFIED'`,
          [original.payment_request_id]
        );
      }
    }

    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'PAYMENT_REVERSED',
      entityType: 'PAYMENT',
      entityId: reversalRs.rows[0].id,
      metadata: {
        originalPaymentId: paymentId,
        invoiceId: original.invoice_id,
        paymentRequestId: original.payment_request_id,
        amount: toNumber(original.amount),
        reason
      },
      before: {
        paymentId,
        entryType: original.entry_type,
        status: original.status,
        amount: original.amount
      },
      after: {
        reversalId: reversalRs.rows[0].id,
        entryType: reversalRs.rows[0].entry_type,
        status: reversalRs.rows[0].status,
        amount: reversalRs.rows[0].amount,
        reason
      }
    });

    return {
      payment: original,
      reversal: reversalRs.rows[0],
      paid_amount: paidAmount,
      remaining_amount: Math.max(0, toNumber(original.invoice_total) - paidAmount),
      invoice_status: invoiceStatus,
      idempotent: false
    };
  });

export const getPaymentRequestDetail = async (id: string, scope: AuthScope) => {
  const requestQuery = scope.role === 'MANAGER'
    ? query<PaymentBoundaryRow>(
      `SELECT ${paymentRequestSummarySelect}
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       WHERE pr.id=$1 AND b.manager_user_id=$2`,
      [id, scope.userId]
    )
    : query<PaymentBoundaryRow>(
      `SELECT ${paymentRequestSummarySelect}
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       JOIN contract_tenant ct ON ct.contract_id=i.contract_id
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE pr.id=$1 AND t.user_id=$2`,
      [id, scope.userId]
    );

  const [reqRs, proofs, payment] = await Promise.all([
    requestQuery,
    query<PaymentBoundaryRow>(
      `SELECT ${returnedPaymentProofColumns} FROM payment_proof
       WHERE payment_request_id=$1 ORDER BY created_at DESC`,
      [id]
    ),
    query<PaymentBoundaryRow>(
      `SELECT ${paymentColumns},
              CASE WHEN p.entry_type='REVERSAL' THEN -p.amount ELSE p.amount END::float AS signed_amount,
              reversal.id AS reversal_payment_id
       FROM payment p
       LEFT JOIN LATERAL (
         SELECT child.id
         FROM payment child
         WHERE child.original_payment_id=p.id AND child.entry_type='REVERSAL'
         LIMIT 1
       ) reversal ON true
       WHERE p.payment_request_id=$1
       ORDER BY p.created_at DESC`,
      [id]
    )
  ]);
  if (!reqRs.rows[0]) throw new AppError(404, 'Payment request not found');
  return { ...reqRs.rows[0], proofs: proofs.rows, payments: payment.rows, payment: payment.rows[0] ?? null };
};

const paymentRequestSortColumns: Record<PaymentRequestSortBy, string> = {
  createdAt: 'pr.created_at',
  month: 'i.month',
  amount: 'pr.amount',
  status: 'pr.status',
  building: 'b.name',
  room: 'r.code',
  tenant: 'tenant_info.tenant_name',
  latestProofSubmittedAt: 'latest_proof.submitted_at'
};

export const listPaymentRequests = async (
  scope: AuthScope,
  filters: PaymentRequestListFilters
): Promise<PaginatedResult<PaymentBoundaryRow>> => {
  const params: unknown[] = [scope.userId];
  const conditions = [scope.role === 'MANAGER'
    ? 'b.manager_user_id=$1'
    : `EXISTS (
        SELECT 1
        FROM contract_tenant ct_scope
        JOIN tenant t_scope ON t_scope.id=ct_scope.tenant_id
        WHERE ct_scope.contract_id=i.contract_id AND t_scope.user_id=$1
      )`];
  const addCondition = (condition: string, value: unknown) => {
    params.push(value);
    conditions.push(condition.replace('?', `$${params.length}`));
  };

  if (filters.search) {
    addCondition(`(
      b.name ILIKE '%' || ? || '%'
      OR r.code ILIKE '%' || ? || '%'
      OR COALESCE(tenant_info.tenant_name, '') ILIKE '%' || ? || '%'
      OR COALESCE(pr.transfer_note, '') ILIKE '%' || ? || '%'
    )`, filters.search);
    const searchParameter = `$${params.length}`;
    conditions[conditions.length - 1] = conditions[conditions.length - 1].split('?').join(searchParameter);
  }
  if (filters.month) addCondition('i.month=?', `${filters.month}-01`);
  if (filters.buildingId) addCondition('b.id=?', filters.buildingId);
  if (filters.roomId) addCondition('r.id=?', filters.roomId);
  if (filters.tenantId) addCondition('tenant_info.tenant_id=?', filters.tenantId);
  if (filters.requestStatus) addCondition('pr.status=?', filters.requestStatus);
  if (filters.latestProofStatus === 'NONE') conditions.push('latest_proof.id IS NULL');
  else if (filters.latestProofStatus) addCondition('latest_proof.status=?', filters.latestProofStatus);

  const where = conditions.join(' AND ');
  const countParams = [...params];
  const itemParams = [...params, filters.pageSize, paginationOffset(filters)];
  const sortColumn = paymentRequestSortColumns[filters.sortBy];
  const direction = sqlSortDirection(filters.sortOrder);

  const [countResult, itemResult] = await Promise.all([
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       WHERE ${where}`,
      countParams
    ),
    query<PaymentBoundaryRow>(
      `SELECT ${paymentRequestSummarySelect}
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       WHERE ${where}
       ORDER BY ${sortColumn} ${direction} NULLS LAST, pr.created_at DESC, pr.id
       LIMIT $${itemParams.length - 1} OFFSET $${itemParams.length}`,
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

export const getPaymentRequestForInvoice = async (invoiceId: string, scope: AuthScope) => {
  const requestQuery = scope.role === 'MANAGER'
    ? query<PaymentBoundaryRow>(
      `SELECT ${paymentRequestSummarySelect}
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       WHERE pr.invoice_id=$1 AND b.manager_user_id=$2
         AND pr.status NOT IN ('CANCELLED', 'EXPIRED')
       ORDER BY pr.created_at DESC
       LIMIT 1`,
      [invoiceId, scope.userId]
    )
    : query<PaymentBoundaryRow>(
      `SELECT ${paymentRequestSummarySelect}
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       JOIN contract_tenant ct ON ct.contract_id=i.contract_id
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE pr.invoice_id=$1 AND t.user_id=$2
         AND pr.status NOT IN ('CANCELLED', 'EXPIRED')
       ORDER BY pr.created_at DESC
       LIMIT 1`,
      [invoiceId, scope.userId]
    );

  const request = (await requestQuery).rows[0];
  if (!request) return null;
  return getPaymentRequestDetail(String(request.id), scope);
};

export const updatePaymentRequestStatus = async (
  paymentRequestId: string,
  managerId: string,
  status: 'CANCELLED' | 'EXPIRED'
) =>
  withTransaction(async (client) => {
    const reqRs = await client.query<PaymentBoundaryRow>(
      `SELECT ${paymentRequestColumns}
       FROM payment_request pr
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE pr.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF pr`,
      [paymentRequestId, managerId]
    );
    const request = reqRs.rows[0];
    if (!request) throw new AppError(404, 'Payment request not found');
    if (['VERIFIED', 'CANCELLED', 'EXPIRED'].includes(request.status)) {
      throw new AppError(409, 'Payment request cannot be updated');
    }

    const pending = await client.query<{ id: string }>(
      `SELECT id FROM payment_proof WHERE payment_request_id=$1 AND status='PENDING' LIMIT 1`,
      [paymentRequestId]
    );
    if (pending.rows[0]) throw new AppError(409, 'Resolve pending proof before updating request status');

    const updated = await client.query<PaymentBoundaryRow>(
      `UPDATE payment_request SET status=$2 WHERE id=$1 RETURNING ${returnedPaymentRequestColumns}`,
      [paymentRequestId, status]
    );
    return updated.rows[0];
  });
