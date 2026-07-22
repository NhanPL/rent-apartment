import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn()
}));

vi.mock('../src/db', () => ({
  query: dbMocks.query,
  withTransaction: vi.fn()
}));

import { listPaymentRequests } from '../src/modules/payments/payments.service';

describe('payment request filters', () => {
  beforeEach(() => {
    dbMocks.query.mockResolvedValue({ rows: [] });
  });

  it('builds scoped SQL parameters for every supported filter', async () => {
    await listPaymentRequests(
      { userId: 'manager-user-id', role: 'MANAGER' },
      {
        month: '2026-07',
        buildingId: 'building-id',
        roomId: 'room-id',
        tenantId: 'tenant-id',
        requestStatus: 'TRANSFER_SUBMITTED',
        latestProofStatus: 'PENDING'
      }
    );

    const [sql, params] = dbMocks.query.mock.calls[0] as [string, unknown[]];
    const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();
    expect(normalizedSql).toContain('where b.manager_user_id=$1 and i.month=$2');
    expect(normalizedSql).toContain('b.id=$3');
    expect(normalizedSql).toContain('r.id=$4');
    expect(normalizedSql).toContain('tenant_info.tenant_id=$5');
    expect(normalizedSql).toContain('pr.status=$6');
    expect(normalizedSql).toContain('latest_proof.status=$7');
    expect(params).toEqual([
      'manager-user-id',
      '2026-07-01',
      'building-id',
      'room-id',
      'tenant-id',
      'TRANSFER_SUBMITTED',
      'PENDING'
    ]);
  });

  it('filters requests that have no payment proof without adding a parameter', async () => {
    await listPaymentRequests(
      { userId: 'manager-user-id', role: 'MANAGER' },
      { latestProofStatus: 'NONE' }
    );

    const [sql, params] = dbMocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('latest_proof.id IS NULL');
    expect(params).toEqual(['manager-user-id']);
  });
});
