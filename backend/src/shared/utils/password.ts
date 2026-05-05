import crypto from 'crypto';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const ALL = `${UPPER}${LOWER}${DIGITS}`;

const pick = (charset: string): string => charset[crypto.randomInt(0, charset.length)];

export const generateRandomPassword = (length = 8): string => {
  if (length < 3) {
    throw new Error('Password length must be at least 3');
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
