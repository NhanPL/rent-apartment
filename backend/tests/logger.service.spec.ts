import { describe, expect, it } from 'vitest';
import { sanitizeLogValue } from '../src/shared/services/logger.service';

describe('structured logger', () => {
  it('redacts sensitive fields and document URLs recursively', () => {
    const result = sanitizeLogValue({
      userId: 'user-1',
      password: 'not-for-logs',
      nested: {
        accessToken: 'token-value',
        identity_number: '012345678901',
        evidence: 'https://res.cloudinary.com/demo/image/authenticated/s--sig--/asset.jpg'
      }
    });

    expect(result).toEqual({
      userId: 'user-1',
      password: '[REDACTED]',
      nested: {
        accessToken: '[REDACTED]',
        identity_number: '[REDACTED]',
        evidence: '[REDACTED_URL]'
      }
    });
  });

  it('serializes errors without stack traces', () => {
    expect(sanitizeLogValue({ error: new Error('failed') })).toEqual({
      error: { name: 'Error', message: 'failed' }
    });
  });
});
