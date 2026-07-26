import { describe, expect, it } from 'vitest';
import { resolveRefreshCookiePolicy } from '../src/modules/auth/refresh-cookie';

describe('refresh cookie policy', () => {
  it('uses a local-development compatible cookie policy', () => {
    expect(resolveRefreshCookiePolicy('development')).toEqual({
      secure: false,
      sameSite: 'lax'
    });
  });

  it.each(['staging', 'production'] as const)(
    'uses Secure and cross-site compatible defaults in %s',
    (environment) => {
      expect(resolveRefreshCookiePolicy(environment)).toEqual({
        secure: true,
        sameSite: 'none'
      });
    }
  );

  it('respects an explicit SameSite override without disabling Secure', () => {
    expect(resolveRefreshCookiePolicy('production', 'strict')).toEqual({
      secure: true,
      sameSite: 'strict'
    });
  });
});
