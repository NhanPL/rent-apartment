import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  enqueueInvoiceIssued,
  enqueueUtilityReadingRejected
} from '../src/shared/services/notification.service';

const recipient = {
  user_id: '00000000-0000-4000-8000-000000000003',
  email: 'tenant@example.com',
  tenant_name: 'Tenant One',
  room_code: '101',
  month: '2026-08'
};

const clientWithRecipient = (inserted = true) => ({
  query: vi.fn()
    .mockResolvedValueOnce({ rows: [recipient] })
    .mockResolvedValueOnce({ rows: inserted ? [{ id: 'notification-1' }] : [] })
    .mockResolvedValueOnce({ rows: inserted ? [{ id: 'outbox-1' }] : [] })
}) as unknown as PoolClient;

describe('tenant notification outbox', () => {
  it('enqueues invoice issue with a stable deduplication key', async () => {
    const client = clientWithRecipient();
    await expect(enqueueInvoiceIssued(client, '00000000-0000-4000-8000-000000000901', 1500000, '2026-08-15'))
      .resolves.toBe(true);

    const inAppCall = vi.mocked(client.query).mock.calls[1];
    expect(inAppCall[0]).toContain('INSERT INTO in_app_notification');
    expect(inAppCall[1]).toEqual(expect.arrayContaining([
      'INVOICE_ISSUED',
      'in-app:invoice:00000000-0000-4000-8000-000000000901:issued'
    ]));
    const emailCall = vi.mocked(client.query).mock.calls[2];
    expect(emailCall[0]).toContain('ON CONFLICT (deduplication_key) DO NOTHING');
    expect(emailCall[1]).toEqual(expect.arrayContaining([
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
      'in-app:utility-reading:00000000-0000-4000-8000-000000000801:rejected:2026-08-10T12:00:00.000Z'
    ]));
  });
});
