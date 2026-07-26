import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { AppError } from '../errors/app-error';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const ALL = `${UPPER}${LOWER}${DIGITS}`;
const BCRYPT_SHA256_PREFIX = '$bcrypt-sha256$';
const BCRYPT_ROUNDS = 10;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_LENGTH_MESSAGE =
  `Password must contain between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`;
export const PASSWORD_COMMON_MESSAGE =
  'This password is too common. Choose a less common password or a longer passphrase.';

const COMMON_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  '111111',
  'abc123',
  'admin',
  'admin123',
  'changeme',
  'iloveyou',
  'letmein',
  'manager',
  'manager123',
  'password',
  'password1',
  'password123',
  'password1234',
  'qwerty',
  'qwerty123',
  'qwerty123456',
  'rentapartment',
  'tenant',
  'tenant123',
  'welcome',
  'welcome123'
]);

export interface PasswordPolicyViolation {
  code: 'PASSWORD_LENGTH_INVALID' | 'PASSWORD_TOO_COMMON';
  message: string;
}

const pick = (charset: string): string => charset[crypto.randomInt(0, charset.length)];

export const generateRandomPassword = (length = 16): string => {
  if (length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password length must be at least ${PASSWORD_MIN_LENGTH}`);
  }
  if (length > PASSWORD_MAX_LENGTH) {
    throw new Error(`Password length must not exceed ${PASSWORD_MAX_LENGTH}`);
  }

  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  for (let i = chars.length; i < length; i += 1) {
    chars.push(pick(ALL));
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
};

const normalizeForCommonPasswordCheck = (password: string): string => (
  password.normalize('NFKC').trim().toLocaleLowerCase('en-US')
);

export const getPasswordPolicyViolation = (
  password: string
): PasswordPolicyViolation | null => {
  if (
    password.length < PASSWORD_MIN_LENGTH
    || password.length > PASSWORD_MAX_LENGTH
  ) {
    return {
      code: 'PASSWORD_LENGTH_INVALID',
      message: PASSWORD_LENGTH_MESSAGE
    };
  }

  const normalized = normalizeForCommonPasswordCheck(password);
  if (!normalized || COMMON_PASSWORDS.has(normalized)) {
    return {
      code: 'PASSWORD_TOO_COMMON',
      message: PASSWORD_COMMON_MESSAGE
    };
  }

  return null;
};

export const assertPasswordPolicy = (password: string): void => {
  const violation = getPasswordPolicyViolation(password);
  if (violation) {
    throw new AppError(400, violation.message, violation.code);
  }
};

const prehashPassword = (password: string): string => (
  crypto.createHash('sha256').update(password, 'utf8').digest('base64')
);

const isBcryptHash = (hash: string): boolean => (
  hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')
);

export const isCurrentPasswordHash = (hash: string): boolean => (
  hash.startsWith(BCRYPT_SHA256_PREFIX)
);

export const hashPassword = async (password: string): Promise<string> => {
  const digestHash = await bcrypt.hash(prehashPassword(password), BCRYPT_ROUNDS);
  return `${BCRYPT_SHA256_PREFIX}${digestHash}`;
};

/**
 * Returns null for legacy database crypt hashes so callers can use the
 * database verifier without exposing the plaintext password to logs.
 */
export const verifyPasswordHash = async (
  password: string,
  storedHash: string
): Promise<boolean | null> => {
  if (isCurrentPasswordHash(storedHash)) {
    return bcrypt.compare(
      prehashPassword(password),
      storedHash.slice(BCRYPT_SHA256_PREFIX.length)
    );
  }
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }
  return null;
};
