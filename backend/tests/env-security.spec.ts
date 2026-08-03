import { describe, expect, it } from 'vitest';
import {
  JWT_SECRET_MIN_LENGTH,
  assertSecureJwtSecrets,
  resolveDatabaseTlsSettings
} from '../src/config/env';

describe('environment security policy', () => {
  const accessSecret = 'a'.repeat(JWT_SECRET_MIN_LENGTH);
  const refreshSecret = 'b'.repeat(JWT_SECRET_MIN_LENGTH);

  it('requires long and distinct access and refresh secrets', () => {
    expect(() => assertSecureJwtSecrets(accessSecret, refreshSecret)).not.toThrow();
    expect(() => assertSecureJwtSecrets('short', refreshSecret)).toThrow(
      `JWT_ACCESS_SECRET must contain at least ${JWT_SECRET_MIN_LENGTH} characters`
    );
    expect(() => assertSecureJwtSecrets(accessSecret, 'short')).toThrow(
      `JWT_REFRESH_SECRET must contain at least ${JWT_SECRET_MIN_LENGTH} characters`
    );
    expect(() => assertSecureJwtSecrets(
      'replace-with-a-random-access-secret-at-least-32-characters',
      refreshSecret
    )).toThrow('JWT_ACCESS_SECRET must not use an example placeholder');
    expect(() => assertSecureJwtSecrets(accessSecret, accessSecret)).toThrow(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different'
    );
  });

  it.each(['staging', 'production'] as const)(
    'enforces certificate-verified PostgreSQL TLS in %s',
    (appEnvironment) => {
      expect(resolveDatabaseTlsSettings(
        appEnvironment,
        'postgresql://user:pass@database.example/db'
      )).toEqual({ dbSsl: 'true', rejectUnauthorized: 'true' });
      expect(() => resolveDatabaseTlsSettings(
        appEnvironment,
        'postgresql://user:pass@database.example/db',
        'false',
        'false'
      )).toThrow(`DB_SSL must be true when APP_ENV=${appEnvironment}`);
      expect(() => resolveDatabaseTlsSettings(
        appEnvironment,
        'postgresql://user:pass@database.example/db',
        'true',
        'false'
      )).toThrow(
        `DB_SSL_REJECT_UNAUTHORIZED must be true when APP_ENV=${appEnvironment}`
      );
    }
  );

  it('keeps local PostgreSQL TLS optional and verifies hosted Supabase by default', () => {
    expect(resolveDatabaseTlsSettings(
      'development',
      'postgresql://user:pass@localhost:5432/db'
    )).toEqual({ dbSsl: 'false', rejectUnauthorized: 'false' });
    expect(resolveDatabaseTlsSettings(
      'development',
      'postgresql://user:pass@project.supabase.co:5432/db'
    )).toEqual({ dbSsl: 'true', rejectUnauthorized: 'true' });
  });
});
