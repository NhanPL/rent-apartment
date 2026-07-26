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
});
