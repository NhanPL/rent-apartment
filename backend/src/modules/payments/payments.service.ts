import { query, withTransaction } from '../../db';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/app-error';

type DbRow = Record<string, any>;
type AuthScope = { userId: string; role: 'MANAGER' | 'TENANT' };

const buildQrContent = (amount: number, transferNote: string) =>
  JSON.stringify({ bankCode: env.DEFAULT_BANK_CODE, accountNo: env.DEFAULT_BANK_ACCOUNT_NO, amount, transferNote });

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
    if (inv.status === 'PAID' || inv.status === 'VOID') throw new AppError(409, 'Cannot request payment for closed invoice');

    const existing = await client.query('SELECT id FROM payment_request WHERE invoice_id=$1', [invoiceId]);
    if (existing.rows[0]) throw new AppError(409, 'Payment request already exists for this invoice');

    const amount = Number(payload.amount ?? inv.total);
    if (amount <= 0) throw new AppError(400, 'Amount must be greater than 0');

    const transferNote = payload.transfer_note ?? `INV-${invoiceId.slice(0, 8)}`;

    const pr = await client.query<DbRow>(
      `INSERT INTO payment_request(invoice_id,status,amount,currency,qr_content,qr_image_url,bank_code,bank_account_no,bank_account_name,transfer_note,expires_at,sent_at,created_by_user_id)
       VALUES($1,'WAITING_TRANSFER',$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11)
       RETURNING *`,
      [
        invoiceId,
        amount,
        payload.currency ?? 'VND',
        buildQrContent(amount, transferNote),
        payload.qr_image_url ?? null,
        payload.bank_code ?? env.DEFAULT_BANK_CODE ?? null,
        payload.bank_account_no ?? env.DEFAULT_BANK_ACCOUNT_NO ?? null,
        payload.bank_account_name ?? env.DEFAULT_BANK_ACCOUNT_NAME ?? null,
        transferNote,
        payload.expires_at ?? null,
        managerId
      ]
    );
    return pr.rows[0];
  });

export const submitPaymentProof = async (paymentRequestId: string, payload: any, tenantUserId: string) =>
  withTransaction(async (client) => {
    const reqRs = await client.query<DbRow>(
      `SELECT pr.*, t.user_id tenant_user_id
       FROM payment_request pr
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract_tenant ct ON ct.contract_id=i.contract_id AND ct.left_at IS NULL
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE pr.id=$1 AND t.user_id=$2`,
      [paymentRequestId, tenantUserId]
    );
    const data = reqRs.rows[0];
    if (!data) throw new AppError(404, 'Payment request not found');
    if (!['WAITING_TRANSFER', 'REJECTED'].includes(data.status)) throw new AppError(409, 'Payment request not accepting proofs');

    const created = await client.query<DbRow>(
      `INSERT INTO payment_proof(payment_request_id,status,file_name,file_url,mime_type,file_size,submitted_by_user_id,transfer_amount,transfer_time,payer_note)
       VALUES($1,'PENDING',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [paymentRequestId, payload.file_name ?? null, payload.file_url, payload.mime_type ?? null, payload.file_size ?? null, tenantUserId, payload.transfer_amount ?? null, payload.transfer_time ?? null, payload.payer_note ?? null]
    );
    await client.query(`UPDATE payment_request SET status='TRANSFER_SUBMITTED' WHERE id=$1`, [paymentRequestId]);
    return created.rows[0];
  });

export const reviewPaymentProof = async (proofId: string, approve: boolean, managerId: string, reason?: string) =>
  withTransaction(async (client) => {
    const pfRs = await client.query<DbRow>(
      `SELECT pf.*, pr.invoice_id, pr.id payment_request_id, pr.amount request_amount
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

    await client.query(`UPDATE payment_request SET status='VERIFIED',approved_by_user_id=$2,approved_at=now() WHERE id=$1`, [proof.payment_request_id, managerId]);

    const payment = await client.query<DbRow>(
      `INSERT INTO payment(invoice_id,payment_request_id,payment_proof_id,method,status,amount,paid_at,created_by_user_id,note)
       VALUES($1,$2,$3,'BANK_TRANSFER','SUCCEEDED',$4,now(),$5,$6)
       ON CONFLICT (payment_request_id) DO UPDATE SET payment_proof_id=EXCLUDED.payment_proof_id,status='SUCCEEDED',paid_at=now(),amount=EXCLUDED.amount
       RETURNING *`,
      [proof.invoice_id, proof.payment_request_id, proofId, proof.transfer_amount ?? proof.request_amount, managerId, 'Verified from transfer proof']
    );

    await client.query(`UPDATE invoice SET status='PAID' WHERE id=$1`, [proof.invoice_id]);
    return { proof: approved.rows[0], payment: payment.rows[0] };
  });

export const getPaymentRequestDetail = async (id: string, scope: AuthScope) => {
  const requestQuery = scope.role === 'MANAGER'
    ? query(
      `SELECT pr.*
       FROM payment_request pr
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE pr.id=$1 AND b.manager_user_id=$2`,
      [id, scope.userId]
    )
    : query(
      `SELECT DISTINCT pr.*
       FROM payment_request pr
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract_tenant ct ON ct.contract_id=i.contract_id
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE pr.id=$1 AND t.user_id=$2`,
      [id, scope.userId]
    );

  const [reqRs, proofs, payment] = await Promise.all([
    requestQuery,
    query('SELECT * FROM payment_proof WHERE payment_request_id=$1 ORDER BY created_at DESC', [id]),
    query('SELECT * FROM payment WHERE payment_request_id=$1', [id])
  ]);
  if (!reqRs.rows[0]) throw new AppError(404, 'Payment request not found');
  return { ...reqRs.rows[0], proofs: proofs.rows, payment: payment.rows[0] ?? null };
};

export const listPaymentRequests = async (scope: AuthScope) => {
  if (scope.role === 'MANAGER') {
    return (await query(
      `SELECT pr.*
       FROM payment_request pr
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE b.manager_user_id=$1
       ORDER BY pr.created_at DESC`,
      [scope.userId]
    )).rows;
  }

  return (await query(
    `SELECT DISTINCT pr.*
     FROM payment_request pr
     JOIN invoice i ON i.id=pr.invoice_id
     JOIN contract_tenant ct ON ct.contract_id=i.contract_id
     JOIN tenant t ON t.id=ct.tenant_id
     WHERE t.user_id=$1
     ORDER BY pr.created_at DESC`,
    [scope.userId]
  )).rows;
};
