import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../src/db', () => ({ query: dbMocks.query }));

import { listAuditLogs } from '../src/modules/audit-logs/audit-logs.service';

describe('audit log search', () => {
  beforeEach(() => dbMocks.query.mockReset());

  it('always scopes results to the manager and applies supported filters', async () => {
    dbMocks.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-1', action: 'INVOICE_VOIDED' }] });

    const response = await listAuditLogs('manager-1', {
      page: 2,
      pageSize: 25,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-05T23:59:59.999Z',
      actorRole: 'MANAGER',
      action: 'INVOICE_VOIDED',
      entityType: 'invoice',
      requestId: 'request-1234',
      search: 'INV-001'
    });

    expect(response.pagination).toEqual({ page: 2, pageSize: 25, total: 1 });
    expect(response.items).toEqual([{ id: 'audit-1', action: 'INVOICE_VOIDED' }]);
    expect(dbMocks.query).toHaveBeenCalledTimes(2);
    for (const [sql, params] of dbMocks.query.mock.calls) {
      expect(sql).toContain('audit.manager_user_id=$1');
      expect(params[0]).toBe('manager-1');
    }
    const [listSql, listParams] = dbMocks.query.mock.calls[1];
    expect(listSql).toContain('audit.created_at >= $2::timestamptz');
    expect(listSql).toContain('audit.entity_type=$6');
    expect(listSql).toContain('ORDER BY audit.created_at DESC');
    expect(listParams).toEqual([
      'manager-1',
      '2026-08-01T00:00:00.000Z',
      '2026-08-05T23:59:59.999Z',
      'MANAGER',
      'INVOICE_VOIDED',
      'INVOICE',
      'request-1234',
      '%INV-001%',
      25,
      25
    ]);
  });
});
