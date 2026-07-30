import { describe, expect, it } from 'vitest';
import { toSafeErrorLog } from '../src/shared/utils/safe-log';

describe('safe error logging', () => {
  it('redacts password fields from error messages', () => {
    const result = toSafeErrorLog(new Error(
      'request failed: currentPassword=old-secret newPassword="new secret phrase"'
    ));

    expect(result.message).not.toContain('old-secret');
    expect(result.message).not.toContain('new secret phrase');
    expect(result.message).toContain('currentPassword=[REDACTED]');
    expect(result.message).toContain('newPassword=[REDACTED]');
  });

  it('does not serialize arbitrary rejected values or request bodies', () => {
    const result = toSafeErrorLog({
      body: { password: 'must-never-be-logged' }
    });

    expect(JSON.stringify(result)).not.toContain('must-never-be-logged');
    expect(result).toEqual({
      name: 'UnknownError',
      message: 'An unexpected non-error value was thrown'
    });
  });

  it('redacts Cloudinary and short-lived document delivery URLs', () => {
    const result = toSafeErrorLog(new Error(
      'failed https://res.cloudinary.com/demo/image/authenticated/v1/private.jpg at /api/documents/delivery/secret.token'
    ));

    expect(result.message).not.toContain('private.jpg');
    expect(result.message).not.toContain('secret.token');
    expect(result.message).toContain('[REDACTED_CLOUDINARY_URL]');
    expect(result.message).toContain('/api/documents/delivery/[REDACTED]');
  });
});
