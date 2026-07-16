import { query, withTransaction } from '../../db';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/app-error';
import { createVietQrPaymentData } from './vietqr.service';

type DbRow = Record<string, any>;
type AuthScope = { userId: string; role: 'MANAGER' | 'TENANT' };

const toNumber = (value: unknown) => Number(value ?? 0);

const paymentRequestSummarySelect = `
  pr.*,
  i.month,
  i.status AS invoice_status,
  i.total::float AS invoice_total,
  i.due_date,
  COALESCE(paid.total_paid, 0)::float AS paid_amount,
  GREATEST(i.total - COALESCE(paid.total_paid, 0), 0)::float AS remaining_amount,
  b.id AS building_id,
  b.name AS building_name,
  r.id AS room_id,
  r.code AS room_code,
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
    SELECT t.full_name AS tenant_name
    FROM contract_tenant ct
    JOIN tenant t ON t.id=ct.tenant_id
    WHERE ct.contract_id=c.id
    ORDER BY ct.is_primary DESC, ct.joined_at ASC
    LIMIT 1
  ) tenant_info ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(p.amount), 0) AS total_paid
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

const getInvoicePaidAmount = async (client: any, invoiceId: string) => {
  const rs = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS paid_amount
     FROM payment
     WHERE invoice_id=$1 AND status='SUCCEEDED'`,
    [invoiceId]
  ) as { rows: Array<{ paid_amount: string | number }> };
  return toNumber(rs.rows[0]?.paid_amount);
};

export const createPaymentRequest = async (invoiceId: string, managerId: string, payload: any) =>
  withTransaction(async (client) => {
    const invRs = await client.query<DbRow>(
      `SELECT i.*
       FROM invoice i
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE i.id=$1 AND b.manager_user_id=$2`,
      [invoiceId, managerId]
    );
    const inv = invRs.rows[0];
    if (!inv) throw new AppError(404, 'Invoice not found');
    if (!['ISSUED', 'OVERDUE'].includes(inv.status)) throw new AppError(409, 'Payment requests require an issued invoice', 'INVOICE_NOT_ISSUED');

    const paidAmount = await getInvoicePaidAmount(client, invoiceId);
    const remainingAmount = toNumber(inv.total) - paidAmount;
    if (remainingAmount <= 0) throw new AppError(409, 'Invoice is already fully paid');

    const existing = await client.query(
      `SELECT id FROM payment_request
       WHERE invoice_id=$1 AND status NOT IN ('CANCELLED', 'EXPIRED')`,
      [invoiceId]
    );
    if (existing.rows[0]) throw new AppError(409, 'Payment request already exists for this invoice');

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

    const pr = await client.query<DbRow>(
      `INSERT INTO payment_request(invoice_id,status,amount,currency,qr_content,qr_image_url,bank_code,bank_account_no,bank_account_name,transfer_note,expires_at,sent_at,created_by_user_id)
       VALUES($1,'WAITING_TRANSFER',$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11)
       RETURNING *`,
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

export const submitPaymentProof = async (paymentRequestId: string, payload: any, tenantUserId: string) =>
  withTransaction(async (client) => {
    const reqRs = await client.query<DbRow>(
      `SELECT pr.*, i.total invoice_total, t.user_id tenant_user_id
       FROM payment_request pr
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract_tenant ct ON ct.contract_id=i.contract_id
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE pr.id=$1 AND t.user_id=$2`,
      [paymentRequestId, tenantUserId]
    );
    const data = reqRs.rows[0];
    if (!data) throw new AppError(404, 'Payment request not found');
    if (!['WAITING_TRANSFER', 'REJECTED'].includes(data.status)) throw new AppError(409, 'Payment request not accepting proofs');

    const pending = await client.query(
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

    const created = await client.query<DbRow>(
      `INSERT INTO payment_proof(payment_request_id,status,file_name,file_url,mime_type,file_size,submitted_by_user_id,transfer_amount,transfer_time,payer_note)
       VALUES($1,'PENDING',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [paymentRequestId, payload.file_name ?? null, payload.file_url, payload.mime_type ?? null, payload.file_size ?? null, tenantUserId, transferAmount, payload.transfer_time ?? null, payload.payer_note ?? null]
    );
    await client.query(`UPDATE payment_request SET status='TRANSFER_SUBMITTED' WHERE id=$1`, [paymentRequestId]);
    return created.rows[0];
  });

export const reviewPaymentProof = async (proofId: string, approve: boolean, managerId: string, reason?: string) =>
  withTransaction(async (client) => {
    const pfRs = await client.query<DbRow>(
      `SELECT pf.*, pr.invoice_id, pr.id payment_request_id, pr.amount request_amount, i.total invoice_total, i.status invoice_status
       FROM payment_proof pf
       JOIN payment_request pr ON pr.id=pf.payment_request_id
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE pf.id=$1 AND b.manager_user_id=$2`,
      [proofId, managerId]
    );
    const proof = pfRs.rows[0];
    if (!proof) throw new AppError(404, 'Proof not found');
    if (proof.status !== 'PENDING') throw new AppError(409, 'Proof already reviewed');

    if (!approve) {
      const rejected = await client.query<DbRow>(
        `UPDATE payment_proof SET status='REJECTED',rejected_by_user_id=$2,rejected_at=now(),rejection_reason=$3 WHERE id=$1 RETURNING *`,
        [proofId, managerId, reason ?? 'Rejected by manager']
      );
      await client.query(`UPDATE payment_request SET status='REJECTED' WHERE id=$1`, [proof.payment_request_id]);
      return rejected.rows[0];
    }

    const approved = await client.query<DbRow>(
      `UPDATE payment_proof SET status='APPROVED',approved_by_user_id=$2,approved_at=now(),rejection_reason=NULL WHERE id=$1 RETURNING *`,
      [proofId, managerId]
    );

    const payment = await client.query<DbRow>(
      `INSERT INTO payment(invoice_id,payment_request_id,payment_proof_id,method,status,amount,paid_at,created_by_user_id,note)
       VALUES($1,$2,$3,'BANK_TRANSFER','SUCCEEDED',$4,now(),$5,$6)
       ON CONFLICT (payment_proof_id) DO UPDATE SET status='SUCCEEDED',paid_at=now(),amount=EXCLUDED.amount
       RETURNING *`,
      [proof.invoice_id, proof.payment_request_id, proofId, proof.transfer_amount ?? proof.request_amount, managerId, 'Verified from transfer proof']
    );

    const paidAmount = await getInvoicePaidAmount(client, proof.invoice_id);
    const fullyPaid = paidAmount >= toNumber(proof.invoice_total);
    await client.query(
      `UPDATE payment_request
       SET status=$2, approved_by_user_id=$3, approved_at=CASE WHEN $2='VERIFIED' THEN now() ELSE approved_at END
       WHERE id=$1`,
      [proof.payment_request_id, fullyPaid ? 'VERIFIED' : 'WAITING_TRANSFER', managerId]
    );

    if (fullyPaid) {
      await client.query(`UPDATE invoice SET status='PAID' WHERE id=$1`, [proof.invoice_id]);
    }

    return {
      proof: approved.rows[0],
      payment: payment.rows[0],
      paid_amount: paidAmount,
      remaining_amount: Math.max(0, toNumber(proof.invoice_total) - paidAmount),
      invoice_status: fullyPaid ? 'PAID' : proof.invoice_status
    };
  });

export const getPaymentRequestDetail = async (id: string, scope: AuthScope) => {
  const requestQuery = scope.role === 'MANAGER'
    ? query(
      `SELECT ${paymentRequestSummarySelect}
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       WHERE pr.id=$1 AND b.manager_user_id=$2`,
      [id, scope.userId]
    )
    : query(
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
    query('SELECT * FROM payment_proof WHERE payment_request_id=$1 ORDER BY created_at DESC', [id]),
    query('SELECT * FROM payment WHERE payment_request_id=$1 ORDER BY paid_at DESC NULLS LAST, created_at DESC', [id])
  ]);
  if (!reqRs.rows[0]) throw new AppError(404, 'Payment request not found');
  return { ...reqRs.rows[0], proofs: proofs.rows, payments: payment.rows, payment: payment.rows[0] ?? null };
};

export const listPaymentRequests = async (scope: AuthScope) => {
  if (scope.role === 'MANAGER') {
    return (await query(
      `SELECT ${paymentRequestSummarySelect}
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       WHERE b.manager_user_id=$1
       ORDER BY pr.created_at DESC`,
      [scope.userId]
    )).rows;
  }

  return (await query(
    `SELECT ${paymentRequestSummarySelect}
     FROM payment_request pr
     ${paymentRequestSummaryJoins}
     JOIN contract_tenant ct ON ct.contract_id=i.contract_id
     JOIN tenant t ON t.id=ct.tenant_id
     WHERE t.user_id=$1
     ORDER BY pr.created_at DESC`,
    [scope.userId]
  )).rows;
};

export const getPaymentRequestForInvoice = async (invoiceId: string, scope: AuthScope) => {
  const requestQuery = scope.role === 'MANAGER'
    ? query(
      `SELECT ${paymentRequestSummarySelect}
       FROM payment_request pr
       ${paymentRequestSummaryJoins}
       WHERE pr.invoice_id=$1 AND b.manager_user_id=$2
         AND pr.status NOT IN ('CANCELLED', 'EXPIRED')
       ORDER BY pr.created_at DESC
       LIMIT 1`,
      [invoiceId, scope.userId]
    )
    : query(
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
    const reqRs = await client.query<DbRow>(
      `SELECT pr.*
       FROM payment_request pr
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE pr.id=$1 AND b.manager_user_id=$2`,
      [paymentRequestId, managerId]
    );
    const request = reqRs.rows[0];
    if (!request) throw new AppError(404, 'Payment request not found');
    if (['VERIFIED', 'CANCELLED', 'EXPIRED'].includes(request.status)) {
      throw new AppError(409, 'Payment request cannot be updated');
    }

    const pending = await client.query(
      `SELECT id FROM payment_proof WHERE payment_request_id=$1 AND status='PENDING' LIMIT 1`,
      [paymentRequestId]
    );
    if (pending.rows[0]) throw new AppError(409, 'Resolve pending proof before updating request status');

    const updated = await client.query<DbRow>(
      `UPDATE payment_request SET status=$2 WHERE id=$1 RETURNING *`,
      [paymentRequestId, status]
    );
    return updated.rows[0];
  });
