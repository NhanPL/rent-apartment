import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn()
}));

vi.mock('../src/db', () => dbMocks);
vi.mock('../src/db/pool', () => ({
  pool: { connect: vi.fn(), totalCount: 0, idleCount: 0, waitingCount: 0 }
}));

import {
  calculateEmailRetryDelayMinutes,
  enqueuePaymentReminders,
  expirePaymentRequests,
  getScheduleBucket
} from '../src/modules/operations/background-jobs.service';

describe('background jobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses stable schedule buckets and bounded exponential retry', () => {
    expect(getScheduleBucket(new Date('2026-08-10T10:07:42.000Z'), 5).toISOString())
      .toBe('2026-08-10T10:05:00.000Z');
    expect(calculateEmailRetryDelayMinutes(1)).toBe(2);
    expect(calculateEmailRetryDelayMinutes(5)).toBe(32);
    expect(calculateEmailRetryDelayMinutes(20)).toBe(60);
  });

  it('expires only elapsed requests without a pending proof', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ id: 'request-1' }, { id: 'request-2' }] });
    await expect(expirePaymentRequests()).resolves.toBe(2);
    const sql = dbMocks.query.mock.calls[0][0] as string;
    expect(sql).toContain("request.status IN ('WAITING_TRANSFER', 'REJECTED')");
    expect(sql).toContain("proof.status='PENDING'");
    expect(sql).toContain("SET status='EXPIRED'");
  });

  it('deduplicates UTC invoice reminders and respects the immutable payment ledger', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ id: 'outbox-1' }] });
    await expect(enqueuePaymentReminders()).resolves.toBe(1);
    const sql = dbMocks.query.mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT (deduplication_key) DO NOTHING');
    expect(sql).toContain("payment.entry_type='REVERSAL'");
    expect(sql).toContain("payment.status='SUCCEEDED'");
    expect(sql).toContain("now() AT TIME ZONE 'UTC'");
  });

  it('defines durable unique job runs and a bounded email outbox', () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/20260810_background_jobs.sql'),
      'utf8'
    );
    expect(migration).toContain('UNIQUE (job_name, scheduled_for)');
    expect(migration).toContain('deduplication_key     text NOT NULL UNIQUE');
    expect(migration).toContain("status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')");
    expect(migration).toContain('attempts <= max_attempts');
  });

  it('supports durable tenant lifecycle notification templates', () => {
    const migration = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/20260810b_product_notifications.sql'),
      'utf8'
    );
    expect(migration).toContain("'UTILITY_READING_REJECTED'");
    expect(migration).toContain("'INVOICE_ISSUED'");
    expect(migration).toContain("'PAYMENT_PROOF_REJECTED'");
    expect(migration).toContain("'PAYMENT_APPROVED'");
  });
});
