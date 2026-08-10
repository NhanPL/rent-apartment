import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: { query: vi.fn() },
  revokeUserSessions: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/tenants/tenants.repository', () => ({
  tenantQuery: vi.fn(),
  withTenantTransaction: vi.fn((callback) => callback(mocks.client)),
  assertTenantBelongsToManager: vi.fn()
}));
vi.mock('../src/modules/auth/session.service', () => ({
  revokeUserSessions: mocks.revokeUserSessions
}));
vi.mock('../src/shared/services/audit-log.service', () => ({
  writeAuditLog: mocks.writeAuditLog
}));

import { updateManagedTenantAccountStatus } from '../src/modules/tenants/tenant-management.service';

describe('managed tenant account lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deactivates login and revokes sessions without deleting tenant data', async () => {
    mocks.client.query
      .mockResolvedValueOnce({ rows: [{
        user_id: 'user-1', account_status: 'ACTIVE', is_active: true, password_configured: true
      }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(updateManagedTenantAccountStatus('tenant-1', 'manager-1', 'DISABLED'))
      .resolves.toEqual({ accountStatus: 'DISABLED' });

    expect(mocks.client.query.mock.calls[1][0]).toContain('UPDATE app_user');
    expect(mocks.client.query.mock.calls[1][0]).not.toContain('DELETE');
    expect(mocks.revokeUserSessions).toHaveBeenCalledWith(mocks.client, 'user-1', 'ACCOUNT_DISABLED');
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(mocks.client, expect.objectContaining({
      action: 'USER_DEACTIVATED', entityId: 'user-1'
    }));
  });

  it('does not bypass first-password activation for pending accounts', async () => {
    mocks.client.query.mockResolvedValueOnce({ rows: [{
      user_id: 'user-1', account_status: 'PENDING_ACTIVATION', is_active: false, password_configured: false
    }] });

    await expect(updateManagedTenantAccountStatus('tenant-1', 'manager-1', 'ACTIVE'))
      .rejects.toMatchObject({ statusCode: 409, code: 'TENANT_ACCOUNT_PENDING_ACTIVATION' });
    expect(mocks.revokeUserSessions).not.toHaveBeenCalled();
  });
});
