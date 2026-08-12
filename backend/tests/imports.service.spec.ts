import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), withTransaction: vi.fn() }));
const tenantMocks = vi.hoisted(() => ({ createManagedTenant: vi.fn() }));

vi.mock('../src/db', () => dbMocks);
vi.mock('../src/modules/tenants/tenant-management.service', () => tenantMocks);

import { commitImport, previewImport } from '../src/modules/imports/imports.service';

describe('CSV data imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.withTransaction.mockImplementation(async (callback) => callback({ query: vi.fn() }));
  });

  it('reports CSV row and field for invalid values', async () => {
    const preview = await previewImport('manager-1', 'BUILDING', [{ code: '', name: 'Alpha', address: '' }]);
    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'code', code: 'INVALID_VALUE' }),
      expect.objectContaining({ row: 2, field: 'address', code: 'INVALID_VALUE' })
    ]));
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it('rejects rooms whose building code is outside manager ownership', async () => {
    dbMocks.query
      .mockResolvedValueOnce({ rows: [{ id: 'building-1', code: 'OWNED' }] })
      .mockResolvedValueOnce({ rows: [] });
    const preview = await previewImport('manager-1', 'ROOM', [{
      building_code: 'OTHER', code: '101', status: 'ACTIVE', max_occupants: '2'
    }]);
    expect(preview.valid).toBe(false);
    expect(preview.errors).toEqual([
      expect.objectContaining({ row: 2, field: 'building_code', code: 'BUILDING_NOT_FOUND' })
    ]);
    expect(dbMocks.query.mock.calls[0][1][0]).toBe('manager-1');
  });

  it('commits a valid building file in one transaction and audits the batch', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const clientQuery = vi.fn(async (sql: string) => (
      sql.includes('INSERT INTO building') ? { rows: [{ id: 'building-1' }] } : { rows: [] }
    ));
    dbMocks.withTransaction.mockImplementationOnce(async (callback) => callback({ query: clientQuery }));

    const result = await commitImport('manager-1', 'BUILDING', [{
      code: 'BLD-A', name: 'Alpha', address: '1 Main Street', note: ''
    }]);

    expect(result).toEqual({ entity: 'BUILDING', imported: 1, ids: ['building-1'], failed: [] });
    expect(dbMocks.withTransaction).toHaveBeenCalledOnce();
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO audit_log'))).toBe(true);
  });

  it('creates imported tenants through the pending activation workflow', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    tenantMocks.createManagedTenant.mockResolvedValueOnce({ tenantId: 'tenant-1', userId: 'user-1', emailSent: true });

    const result = await commitImport('manager-1', 'TENANT', [{
      full_name: 'Tenant One', email: 'tenant@example.com', phone: '0900000000', identity_number: 'ID-001'
    }]);

    expect(result).toMatchObject({ entity: 'TENANT', imported: 1, ids: ['tenant-1'], failed: [] });
    expect(tenantMocks.createManagedTenant).toHaveBeenCalledWith(expect.objectContaining({
      tenant: expect.objectContaining({ email: 'tenant@example.com' }),
      privacy_consent: true
    }), 'manager-1');
  });
});
