import type { PoolClient } from 'pg';
import { env } from '../../config/env';

export type NotificationTemplateCode =
  | 'UTILITY_READING_REJECTED'
  | 'INVOICE_ISSUED'
  | 'PAYMENT_PROOF_REJECTED'
  | 'PAYMENT_APPROVED';

interface NotificationRecipient {
  user_id: string | null;
  email: string | null;
  tenant_name: string;
  room_code: string;
  month: string;
}

const enqueue = async (
  client: PoolClient,
  recipient: NotificationRecipient | undefined,
  templateCode: NotificationTemplateCode,
  payload: Record<string, unknown>,
  deduplicationKey: string
): Promise<boolean> => {
  if (!recipient) return false;

  const entityId = typeof payload.invoiceId === 'string'
    ? payload.invoiceId
    : deduplicationKey.split(':')[1] ?? null;
  let inAppInserted = false;
  if (recipient.user_id) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO in_app_notification(
         recipient_user_id, template_code, payload, entity_type, entity_id, deduplication_key
       ) VALUES($1,$2,$3::jsonb,$4,$5,$6)
       ON CONFLICT (deduplication_key) DO NOTHING
       RETURNING id`,
      [
        recipient.user_id,
        templateCode,
        JSON.stringify({
          tenantName: recipient.tenant_name,
          roomCode: recipient.room_code,
          month: recipient.month,
          ...payload
        }),
        templateCode.startsWith('PAYMENT_') ? 'PAYMENT' : templateCode.startsWith('INVOICE_') ? 'INVOICE' : 'UTILITY_READING',
        entityId,
        `in-app:${deduplicationKey}`
      ]
    );
    inAppInserted = Boolean(inserted.rows[0]);
  }

  if (env.EMAIL_NOTIFICATIONS_ENABLED !== 'true' || !recipient.email) return inAppInserted;
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO email_outbox(
       recipient_email, template_code, payload, deduplication_key, max_attempts
     ) VALUES($1,$2,$3::jsonb,$4,$5)
     ON CONFLICT (deduplication_key) DO NOTHING
     RETURNING id`,
    [
      recipient.email,
      templateCode,
      JSON.stringify({
        tenantName: recipient.tenant_name,
        roomCode: recipient.room_code,
        month: recipient.month,
        ...payload
      }),
      deduplicationKey,
      env.EMAIL_OUTBOX_MAX_ATTEMPTS
    ]
  );
  return inAppInserted || Boolean(inserted.rows[0]);
};

const readingRecipient = async (client: PoolClient, readingId: string): Promise<NotificationRecipient | undefined> => (
  await client.query<NotificationRecipient>(
    `SELECT app_user.id AS user_id,
            COALESCE(app_user.email::text, tenant.email::text) AS email,
            tenant.full_name AS tenant_name,
            room.code AS room_code,
            to_char(reading.month, 'YYYY-MM') AS month
     FROM utility_reading reading
     JOIN room ON room.id=reading.room_id
     JOIN contract_tenant assignment ON assignment.contract_id=reading.contract_id
       AND assignment.is_primary=true
     JOIN tenant ON tenant.id=assignment.tenant_id
     LEFT JOIN app_user ON app_user.id=tenant.user_id
     WHERE reading.id=$1
     ORDER BY assignment.joined_at
     LIMIT 1`,
    [readingId]
  )
).rows[0];

const invoiceRecipient = async (client: PoolClient, invoiceId: string): Promise<NotificationRecipient | undefined> => (
  await client.query<NotificationRecipient>(
    `SELECT app_user.id AS user_id,
            COALESCE(app_user.email::text, tenant.email::text) AS email,
            tenant.full_name AS tenant_name,
            room.code AS room_code,
            to_char(invoice.month, 'YYYY-MM') AS month
     FROM invoice
     JOIN room ON room.id=invoice.room_id
     JOIN contract_tenant assignment ON assignment.contract_id=invoice.contract_id
       AND assignment.is_primary=true
     JOIN tenant ON tenant.id=assignment.tenant_id
     LEFT JOIN app_user ON app_user.id=tenant.user_id
     WHERE invoice.id=$1
     ORDER BY assignment.joined_at
     LIMIT 1`,
    [invoiceId]
  )
).rows[0];

const proofRecipient = async (client: PoolClient, proofId: string): Promise<NotificationRecipient | undefined> => (
  await client.query<NotificationRecipient>(
    `SELECT app_user.id AS user_id,
            COALESCE(app_user.email::text, tenant.email::text) AS email,
            tenant.full_name AS tenant_name,
            room.code AS room_code,
            to_char(invoice.month, 'YYYY-MM') AS month
     FROM payment_proof proof
     JOIN payment_request request ON request.id=proof.payment_request_id
     JOIN invoice ON invoice.id=request.invoice_id
     JOIN room ON room.id=invoice.room_id
     JOIN contract_tenant assignment ON assignment.contract_id=invoice.contract_id
       AND assignment.is_primary=true
     JOIN tenant ON tenant.id=assignment.tenant_id
     LEFT JOIN app_user ON app_user.id=tenant.user_id
     WHERE proof.id=$1
     ORDER BY assignment.joined_at
     LIMIT 1`,
    [proofId]
  )
).rows[0];

export const enqueueUtilityReadingRejected = async (
  client: PoolClient,
  readingId: string,
  reason: string,
  rejectedAt: string
): Promise<boolean> => enqueue(
  client,
  await readingRecipient(client, readingId),
  'UTILITY_READING_REJECTED',
  { reason },
  `utility-reading:${readingId}:rejected:${rejectedAt}`
);

export const enqueueInvoiceIssued = async (
  client: PoolClient,
  invoiceId: string,
  total: number,
  dueDate: string
): Promise<boolean> => enqueue(
  client,
  await invoiceRecipient(client, invoiceId),
  'INVOICE_ISSUED',
  { invoiceId, total, dueDate },
  `invoice:${invoiceId}:issued`
);

export const enqueuePaymentProofRejected = async (
  client: PoolClient,
  proofId: string,
  reason: string
): Promise<boolean> => enqueue(
  client,
  await proofRecipient(client, proofId),
  'PAYMENT_PROOF_REJECTED',
  { reason },
  `payment-proof:${proofId}:rejected`
);

export const enqueuePaymentApproved = async (
  client: PoolClient,
  proofId: string,
  amount: number,
  remainingAmount: number
): Promise<boolean> => enqueue(
  client,
  await proofRecipient(client, proofId),
  'PAYMENT_APPROVED',
  { amount, remainingAmount },
  `payment-proof:${proofId}:approved`
);
