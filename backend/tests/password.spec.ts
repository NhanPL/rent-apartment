import { describe, expect, it } from 'vitest';
import { generateRandomPassword } from '../src/shared/utils/password';

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
