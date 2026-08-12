import type { PoolClient } from 'pg';
import { z } from 'zod';
import { env } from '../../config/env';
import { pool } from '../../db/pool';
import { query, withTransaction } from '../../db';
import { cleanupExpiredSessions } from '../auth/session.service';
import {
  processCloudinaryAssetJobs,
  processExpiredDocumentRetention,
  reconcileDocumentAssets
} from '../documents/document-asset-jobs.service';
import { processDueTenantAnonymization } from '../tenants/tenant-privacy.service';
import {
  sendInvoiceIssuedEmail,
  sendPaymentApprovedEmail,
  sendPaymentProofRejectedEmail,
  sendPaymentReminderEmail,
  sendUtilityReadingRejectedEmail
} from '../../shared/services/email.service';
import { logger } from '../../shared/services/logger.service';

const schedulerLockName = 'rent-apartment:background-jobs:v1';

export type BackgroundJobName =
  | 'PAYMENT_REQUEST_EXPIRY'
  | 'PAYMENT_REMINDER_ENQUEUE'
  | 'EMAIL_OUTBOX_DELIVERY'
  | 'AUTH_DATA_CLEANUP'
  | 'DOCUMENT_MAINTENANCE'
  | 'CLOUDINARY_RECONCILIATION';

interface JobRunRow {
  id: string;
  job_name: BackgroundJobName;
  scheduled_for: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  result: Record<string, unknown>;
  error_code: string | null;
  started_at: string;
  completed_at: string | null;
}

interface EmailOutboxRow {
  id: string;
  recipient_email: string;
  template_code: 'PAYMENT_REMINDER' | 'UTILITY_READING_REJECTED' | 'INVOICE_ISSUED' | 'PAYMENT_PROOF_REJECTED' | 'PAYMENT_APPROVED';
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

const paymentReminderPayloadSchema = z.object({
  tenantName: z.string().min(1),
  roomCode: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outstandingAmount: z.coerce.number().positive(),
  timing: z.enum(['BEFORE_DUE', 'AFTER_DUE'])
});

const tenantNotificationSchema = z.object({
  tenantName: z.string().min(1),
  roomCode: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/)
});
const notificationPayloadSchemas = {
  PAYMENT_REMINDER: paymentReminderPayloadSchema,
  UTILITY_READING_REJECTED: tenantNotificationSchema.extend({ reason: z.string().min(1) }),
  INVOICE_ISSUED: tenantNotificationSchema.extend({
    invoiceId: z.string().uuid(), total: z.coerce.number().nonnegative(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }),
  PAYMENT_PROOF_REJECTED: tenantNotificationSchema.extend({ reason: z.string().min(1) }),
  PAYMENT_APPROVED: tenantNotificationSchema.extend({
    amount: z.coerce.number().positive(), remainingAmount: z.coerce.number().nonnegative()
  })
} satisfies Record<EmailOutboxRow['template_code'], z.ZodType>;

export const getScheduleBucket = (now: Date, intervalMinutes: number): Date => {
  const intervalMs = intervalMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / intervalMs) * intervalMs);
};

export const calculateEmailRetryDelayMinutes = (attempt: number): number => (
  Math.min(2 ** Math.max(1, attempt), 60)
);

const errorCode = (error: unknown): string => {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 100);
  }
  if (error instanceof Error) return error.name.toUpperCase().slice(0, 100);
  return 'UNKNOWN_JOB_ERROR';
};

export const expirePaymentRequests = async (): Promise<number> => {
  const expired = await query<{ id: string }>(
    `UPDATE payment_request request
     SET status='EXPIRED'
     WHERE request.expires_at IS NOT NULL
       AND request.expires_at <= now()
       AND request.status IN ('WAITING_TRANSFER', 'REJECTED')
       AND NOT EXISTS (
         SELECT 1 FROM payment_proof proof
         WHERE proof.payment_request_id=request.id AND proof.status='PENDING'
       )
     RETURNING request.id`
  );
  return expired.rows.length;
};

export const enqueuePaymentReminders = async (): Promise<number> => {
  const inserted = await query<{ in_app_count: number; email_count: number }>(
    `WITH candidates AS MATERIALIZED (
       SELECT invoice.id AS invoice_id,
              tenant.user_id,
              tenant.email,
              jsonb_build_object(
                'tenantName', tenant.full_name,
                'roomCode', room.code,
                'month', to_char(invoice.month, 'YYYY-MM'),
                'dueDate', to_char(invoice.due_date, 'YYYY-MM-DD'),
                'outstandingAmount', balance.outstanding_amount,
                'timing', reminder.timing
              ) AS payload,
              concat('invoice:', invoice.id, ':', reminder.timing, ':', invoice.due_date) AS deduplication_key
       FROM invoice
       JOIN room ON room.id=invoice.room_id
       JOIN LATERAL (
         SELECT app_user.id AS user_id, app_user.email::text AS email, profile.full_name
         FROM contract_tenant assignment
         JOIN tenant profile ON profile.id=assignment.tenant_id
         JOIN app_user ON app_user.id=profile.user_id
         WHERE assignment.contract_id=invoice.contract_id
           AND assignment.joined_at <= (now() AT TIME ZONE 'UTC')::date
           AND (assignment.left_at IS NULL OR assignment.left_at >= (now() AT TIME ZONE 'UTC')::date)
           AND app_user.is_active=true
           AND app_user.account_status='ACTIVE'
         ORDER BY assignment.is_primary DESC, assignment.joined_at
         LIMIT 1
       ) tenant ON true
       JOIN LATERAL (
         SELECT GREATEST(
           invoice.total - COALESCE(SUM(
             CASE WHEN payment.entry_type='REVERSAL' THEN -payment.amount ELSE payment.amount END
           ) FILTER (WHERE payment.status='SUCCEEDED'), 0),
           0
         ) AS outstanding_amount
         FROM payment
         WHERE payment.invoice_id=invoice.id
       ) balance ON true
       CROSS JOIN (VALUES
         ('BEFORE_DUE'::text, $1::int),
         ('AFTER_DUE'::text, -$2::int)
       ) reminder(timing, day_offset)
       WHERE invoice.status IN ('ISSUED', 'PARTIALLY_PAID')
         AND invoice.due_date IS NOT NULL
         AND balance.outstanding_amount > 0
         AND invoice.due_date=(now() AT TIME ZONE 'UTC')::date + reminder.day_offset
     ), in_app AS (
       INSERT INTO in_app_notification(
         recipient_user_id, template_code, payload, entity_type, entity_id, deduplication_key
       )
       SELECT user_id, 'PAYMENT_REMINDER', payload, 'INVOICE', invoice_id,
              concat('in-app:', deduplication_key)
       FROM candidates
       ON CONFLICT (deduplication_key) DO NOTHING
       RETURNING id
     ), email AS (
       INSERT INTO email_outbox(
         recipient_email, template_code, payload, deduplication_key, max_attempts
       )
       SELECT email, 'PAYMENT_REMINDER', payload, deduplication_key, $3
       FROM candidates
       WHERE $4::boolean
       ON CONFLICT (deduplication_key) DO NOTHING
       RETURNING id
     )
     SELECT (SELECT COUNT(*)::int FROM in_app) AS in_app_count,
            (SELECT COUNT(*)::int FROM email) AS email_count`,
    [
      env.PAYMENT_REMINDER_BEFORE_DAYS,
      env.PAYMENT_REMINDER_AFTER_DAYS,
      env.EMAIL_OUTBOX_MAX_ATTEMPTS,
      env.EMAIL_NOTIFICATIONS_ENABLED === 'true' && env.SMTP_ENABLED
    ]
  );
  const counts = inserted.rows[0];
  return Math.max(Number(counts?.in_app_count ?? 0), Number(counts?.email_count ?? 0));
};

const claimEmailOutbox = async (): Promise<EmailOutboxRow[]> => withTransaction(async (client) => {
  await client.query(
    `UPDATE email_outbox
     SET status=CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'PENDING' END,
         processing_started_at=NULL,
         next_attempt_at=now()
     WHERE status='PROCESSING'
       AND processing_started_at < now() - interval '15 minutes'`
  );
  const claimed = await client.query<EmailOutboxRow>(
    `WITH candidates AS (
       SELECT id
       FROM email_outbox
       WHERE status='PENDING'
         AND attempts < max_attempts
         AND next_attempt_at <= now()
       ORDER BY next_attempt_at, created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE email_outbox outbox
     SET status='PROCESSING',
         attempts=outbox.attempts + 1,
         processing_started_at=now(),
         last_error_code=NULL
     FROM candidates
     WHERE outbox.id=candidates.id
     RETURNING outbox.id, outbox.recipient_email, outbox.template_code, outbox.payload,
               outbox.attempts, outbox.max_attempts`,
    [env.EMAIL_OUTBOX_BATCH_SIZE]
  );
  return claimed.rows;
});

export const processEmailOutbox = async (): Promise<{
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
}> => {
  if (!env.SMTP_ENABLED) return { claimed: 0, sent: 0, retrying: 0, failed: 0 };
  const rows = await claimEmailOutbox();
  let sent = 0;
  let retrying = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const payload = notificationPayloadSchemas[row.template_code].parse(row.payload);
      let delivered: boolean;
      switch (row.template_code) {
        case 'PAYMENT_REMINDER':
          delivered = await sendPaymentReminderEmail({ to: row.recipient_email, ...paymentReminderPayloadSchema.parse(payload) });
          break;
        case 'UTILITY_READING_REJECTED':
          delivered = await sendUtilityReadingRejectedEmail({
            to: row.recipient_email,
            ...notificationPayloadSchemas.UTILITY_READING_REJECTED.parse(payload)
          });
          break;
        case 'INVOICE_ISSUED':
          delivered = await sendInvoiceIssuedEmail({
            to: row.recipient_email,
            ...notificationPayloadSchemas.INVOICE_ISSUED.parse(payload)
          });
          break;
        case 'PAYMENT_PROOF_REJECTED':
          delivered = await sendPaymentProofRejectedEmail({
            to: row.recipient_email,
            ...notificationPayloadSchemas.PAYMENT_PROOF_REJECTED.parse(payload)
          });
          break;
        case 'PAYMENT_APPROVED':
          delivered = await sendPaymentApprovedEmail({
            to: row.recipient_email,
            ...notificationPayloadSchemas.PAYMENT_APPROVED.parse(payload)
          });
          break;
      }
      if (!delivered) throw new Error('SMTP_DISABLED');
      await query(
        `UPDATE email_outbox
         SET status='SENT', sent_at=now(), processing_started_at=NULL
         WHERE id=$1 AND status='PROCESSING'`,
        [row.id]
      );
      sent += 1;
    } catch (error) {
      const exhausted = row.attempts >= row.max_attempts;
      await query(
        `UPDATE email_outbox
         SET status=$2,
             next_attempt_at=now() + make_interval(mins => $3::int),
             processing_started_at=NULL,
             last_error_code=$4
         WHERE id=$1 AND status='PROCESSING'`,
        [
          row.id,
          exhausted ? 'FAILED' : 'PENDING',
          calculateEmailRetryDelayMinutes(row.attempts),
          errorCode(error)
        ]
      );
      if (exhausted) failed += 1;
      else retrying += 1;
      if (exhausted) {
        logger.warn({
          outboxId: row.id,
          attempts: row.attempts,
          errorCode: errorCode(error)
        }, 'Email outbox delivery exhausted retries');
      }
    }
  }

  return { claimed: rows.length, sent, retrying, failed };
};

export const cleanupExpiredAuthData = async (): Promise<Record<string, number>> => {
  const sessions = await cleanupExpiredSessions();
  return withTransaction(async (client) => {
    const activationTokens = await client.query<{ id: string }>(
      `DELETE FROM account_activation_token
       WHERE GREATEST(expires_at, COALESCE(used_at, '-infinity'), COALESCE(revoked_at, '-infinity'))
             < now() - ($1 * interval '1 day')
       RETURNING id`,
      [env.AUTH_TOKEN_RETENTION_DAYS]
    );
    const resetTokens = await client.query<{ id: string }>(
      `DELETE FROM password_reset_token
       WHERE GREATEST(expires_at, COALESCE(used_at, '-infinity'), COALESCE(revoked_at, '-infinity'))
             < now() - ($1 * interval '1 day')
       RETURNING id`,
      [env.AUTH_TOKEN_RETENTION_DAYS]
    );
    const resetRequests = await client.query<{ id: string }>(
      `DELETE FROM password_reset_request
       WHERE created_at < now() - ($1 * interval '1 day')
       RETURNING id`,
      [env.AUTH_TOKEN_RETENTION_DAYS]
    );
    return {
      sessions,
      activationTokens: activationTokens.rows.length,
      resetTokens: resetTokens.rows.length,
      resetRequests: resetRequests.rows.length
    };
  });
};

const runDocumentMaintenance = async () => ({
  anonymizedTenants: await processDueTenantAnonymization(),
  expiredDocuments: await processExpiredDocumentRetention(),
  assetJobs: await processCloudinaryAssetJobs()
});

type JobResult = Record<string, unknown> | number;
interface JobDefinition {
  name: BackgroundJobName;
  intervalMinutes: number;
  run: () => Promise<JobResult>;
}

const jobDefinitions = (): JobDefinition[] => [
  { name: 'PAYMENT_REQUEST_EXPIRY', intervalMinutes: 1, run: expirePaymentRequests },
  { name: 'PAYMENT_REMINDER_ENQUEUE', intervalMinutes: 60, run: enqueuePaymentReminders },
  { name: 'EMAIL_OUTBOX_DELIVERY', intervalMinutes: 5, run: processEmailOutbox },
  {
    name: 'AUTH_DATA_CLEANUP',
    intervalMinutes: env.SESSION_CLEANUP_INTERVAL_HOURS * 60,
    run: cleanupExpiredAuthData
  },
  {
    name: 'DOCUMENT_MAINTENANCE',
    intervalMinutes: env.DOCUMENT_JOB_INTERVAL_MINUTES,
    run: runDocumentMaintenance
  },
  {
    name: 'CLOUDINARY_RECONCILIATION',
    intervalMinutes: env.DOCUMENT_RECONCILIATION_INTERVAL_HOURS * 60,
    run: reconcileDocumentAssets
  }
];

const runTrackedJob = async (definition: JobDefinition, now: Date): Promise<void> => {
  const scheduledFor = getScheduleBucket(now, definition.intervalMinutes);
  const inserted = await query<{ id: string }>(
    `INSERT INTO background_job_run(job_name, scheduled_for)
     VALUES($1,$2)
     ON CONFLICT (job_name, scheduled_for) DO NOTHING
     RETURNING id`,
    [definition.name, scheduledFor]
  );
  const runId = inserted.rows[0]?.id;
  if (!runId) return;

  try {
    const result = await definition.run();
    await query(
      `UPDATE background_job_run
       SET status='SUCCEEDED', result=$2::jsonb, completed_at=now()
       WHERE id=$1 AND status='RUNNING'`,
      [runId, JSON.stringify(typeof result === 'number' ? { affected: result } : result)]
    );
  } catch (error) {
    const code = errorCode(error);
    await query(
      `UPDATE background_job_run
       SET status='FAILED', error_code=$2, completed_at=now()
       WHERE id=$1 AND status='RUNNING'`,
      [runId, code]
    );
    logger.error({ jobName: definition.name, errorCode: code }, 'Background job failed');
  }
};

const recoverStaleJobRuns = async (): Promise<void> => {
  await query(
    `UPDATE background_job_run
     SET status='FAILED', error_code='STALE_JOB_RUN', completed_at=now()
     WHERE status='RUNNING' AND started_at < now() - interval '2 hours'`
  );
};

const acquireSchedulerLock = async (client: PoolClient): Promise<boolean> => (
  (await client.query<{ acquired: boolean }>(
    'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
    [schedulerLockName]
  )).rows[0]?.acquired ?? false
);

export const runBackgroundJobCycle = async (now = new Date()): Promise<boolean> => {
  const lockClient = await pool.connect();
  let acquired = false;
  try {
    acquired = await acquireSchedulerLock(lockClient);
    if (!acquired) return false;
    await recoverStaleJobRuns();
    for (const definition of jobDefinitions()) await runTrackedJob(definition, now);
    return true;
  } finally {
    try {
      if (acquired) {
        await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [schedulerLockName]);
      }
    } finally {
      lockClient.release();
    }
  }
};

let scheduler: NodeJS.Timeout | null = null;
let cycleRunning = false;

const triggerCycle = (): void => {
  if (cycleRunning) return;
  cycleRunning = true;
  void runBackgroundJobCycle()
    .catch((error) => logger.error({ error }, 'Background job cycle failed'))
    .finally(() => { cycleRunning = false; });
};

export const startBackgroundJobScheduler = (): void => {
  if (scheduler) return;
  triggerCycle();
  scheduler = setInterval(triggerCycle, env.BACKGROUND_JOB_POLL_SECONDS * 1000);
  scheduler.unref();
};

export const stopBackgroundJobScheduler = (): void => {
  if (scheduler) clearInterval(scheduler);
  scheduler = null;
};

export const listBackgroundJobRuns = async (limit = 50): Promise<JobRunRow[]> => (
  (await query<JobRunRow>(
    `SELECT id, job_name, scheduled_for, status, result, error_code, started_at, completed_at
     FROM background_job_run
     ORDER BY started_at DESC
     LIMIT $1`,
    [limit]
  )).rows
);
