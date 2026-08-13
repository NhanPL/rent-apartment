import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/shared/errors/app-error';

const dbMocks = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock('../src/db', () => dbMocks);

import { updatePreferredLanguage } from '../src/modules/preferences/preferences.service';

describe('language preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates and audits the authenticated account locale', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ preferred_language: 'en' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    dbMocks.withTransaction.mockImplementationOnce(async (callback) => callback({ query }));

    await expect(updatePreferredLanguage('user-1', 'vi')).resolves.toEqual({ preferredLanguage: 'vi' });
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE app_user'), ['user-1', 'vi']);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO audit_log'))).toBe(true);
  });

  it('returns a stable not-found error for a missing account', async () => {
    dbMocks.withTransaction.mockImplementationOnce(async (callback) => callback({
      query: vi.fn().mockResolvedValue({ rows: [] })
    }));
    await expect(updatePreferredLanguage('missing', 'en')).rejects.toEqual(
      expect.objectContaining<AppError>({ statusCode: 404, code: 'USER_NOT_FOUND' })
    );
  });
});
