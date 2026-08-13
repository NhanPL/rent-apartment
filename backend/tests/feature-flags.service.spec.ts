import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/shared/errors/app-error';

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../src/db', () => dbMocks);

import { assertFeatureEnabled, listFeatureFlags, updateFeatureFlag } from '../src/modules/feature-flags/feature-flags.service';

describe('manager feature flags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults new features on and applies manager overrides', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ feature_key: 'CSV_IMPORTS', enabled: false }] });
    await expect(listFeatureFlags('manager-1')).resolves.toMatchObject({ CSV_IMPORTS: false, LIVE_DASHBOARD: true });
  });

  it('blocks server operations when a feature is disabled', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ enabled: false }] });
    await expect(assertFeatureEnabled('manager-1', 'BULK_BILLING_ACTIONS')).rejects.toEqual(
      expect.objectContaining<AppError>({ statusCode: 403, code: 'FEATURE_DISABLED' })
    );
  });

  it('persists and audits a manager override', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    dbMocks.withTransaction.mockImplementationOnce(async (callback) => callback({ query: clientQuery }));
    dbMocks.query.mockResolvedValueOnce({ rows: [{ feature_key: 'CSV_IMPORTS', enabled: false }] });

    await expect(updateFeatureFlag('manager-1', 'CSV_IMPORTS', false)).resolves.toMatchObject({ CSV_IMPORTS: false });
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO audit_log'))).toBe(true);
  });
});
