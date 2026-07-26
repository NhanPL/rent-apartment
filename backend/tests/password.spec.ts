import { describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import {
  generateRandomPassword,
  getPasswordPolicyViolation,
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPasswordHash
} from '../src/shared/utils/password';

describe('temporary password generation', () => {
  it('generates a strong non-default password', () => {
    const password = generateRandomPassword();

    expect(password).toHaveLength(16);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).not.toBe('password');
    expect(password).not.toBe('Admin@123');
  });

  it('does not allow short temporary passwords', () => {
    expect(() => generateRandomPassword(11)).toThrow('Password length must be at least 12');
  });

  it('does not reuse a fixed default value', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateRandomPassword()));

    expect(passwords.size).toBe(20);
  });
});

describe('password policy and hashing', () => {
  it('uses the same 12 to 128 character policy for passwords and passphrases', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(getPasswordPolicyViolation('short')).toMatchObject({
      code: 'PASSWORD_LENGTH_INVALID'
    });
    expect(getPasswordPolicyViolation('x'.repeat(129))).toMatchObject({
      code: 'PASSWORD_LENGTH_INVALID'
    });
    expect(getPasswordPolicyViolation('correct horse battery staple')).toBeNull();
  });

  it('rejects common passwords without sending them to an external service', () => {
    expect(getPasswordPolicyViolation('password1234')).toMatchObject({
      code: 'PASSWORD_TOO_COMMON'
    });
    expect(getPasswordPolicyViolation('  QWERTY123456  ')).toMatchObject({
      code: 'PASSWORD_TOO_COMMON'
    });
  });

  it('preserves every byte in a long passphrase before bcrypt hashing', async () => {
    const passphrase = `${'correct horse battery staple '.repeat(4)}alpha`;
    const samePrefixDifferentSuffix = `${passphrase.slice(0, -5)}bravo`;
    const hash = await hashPassword(passphrase);

    expect(Buffer.byteLength(passphrase, 'utf8')).toBeGreaterThan(72);
    expect(hash).toMatch(/^\$bcrypt-sha256\$/);
    expect(hash).not.toContain(passphrase);
    await expect(verifyPasswordHash(passphrase, hash)).resolves.toBe(true);
    await expect(verifyPasswordHash(samePrefixDifferentSuffix, hash)).resolves.toBe(false);
  });

  it('continues to verify existing bcrypt hashes for gradual migration', async () => {
    const legacyHash = await bcrypt.hash('existing-password', 4);

    await expect(verifyPasswordHash('existing-password', legacyHash)).resolves.toBe(true);
    await expect(verifyPasswordHash('wrong-password', legacyHash)).resolves.toBe(false);
  });
});
