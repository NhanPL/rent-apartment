import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  enqueueInvoiceIssued,
  enqueueUtilityReadingRejected
} from '../src/shared/services/notification.service';

const recipient = {
  email: 'tenant@example.com',
  tenant_name: 'Tenant One',
  room_code: '101',
  month: '2026-08'
};

const clientWithRecipient = (inserted = true) => ({
  query: vi.fn()
    .mockResolvedValueOnce({ rows: [recipient] })
    .mockResolvedValueOnce({ rows: inserted ? [{ id: 'outbox-1' }] : [] })
}) as unknown as PoolClient;

describe('tenant notification outbox', () => {
  it('enqueues invoice issue with a stable deduplication key', async () => {
    const client = clientWithRecipient();
    await expect(enqueueInvoiceIssued(client, '00000000-0000-4000-8000-000000000901', 1500000, '2026-08-15'))
      .resolves.toBe(true);

    const insertCall = vi.mocked(client.query).mock.calls[1];
    expect(insertCall[0]).toContain('ON CONFLICT (deduplication_key) DO NOTHING');
    expect(insertCall[1]).toEqual(expect.arrayContaining([
      'INVOICE_ISSUED',
      'invoice:00000000-0000-4000-8000-000000000901:issued'
    ]));
  });

  it('treats a retry of the same outbox event as idempotent', async () => {
    const client = clientWithRecipient(false);
    await expect(enqueueInvoiceIssued(client, '00000000-0000-4000-8000-000000000901', 1500000, '2026-08-15'))
      .resolves.toBe(false);
  });

  it('allows distinct utility rejection events for the same reading', async () => {
    const client = clientWithRecipient();
    await enqueueUtilityReadingRejected(
      client,
      '00000000-0000-4000-8000-000000000801',
      'Meter image is unclear.',
      '2026-08-10T12:00:00.000Z'
    );
    expect(vi.mocked(client.query).mock.calls[1][1]).toEqual(expect.arrayContaining([
      'utility-reading:00000000-0000-4000-8000-000000000801:rejected:2026-08-10T12:00:00.000Z'
    ]));
  });
});
