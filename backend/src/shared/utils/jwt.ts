import crypto from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../errors/app-error';
import { AppRole } from '../middleware/auth';

export interface JwtUserPayload {
  userId: string;
  role: AppRole;
}

interface BasePayload extends JwtUserPayload {
  exp: number;
}

interface RefreshPayload extends BasePayload {
  tokenType: 'refresh';
}

const base64UrlEncode = (input: string): string => Buffer.from(input).toString('base64url');
const base64UrlDecode = (input: string): string => Buffer.from(input, 'base64url').toString('utf8');

const parseExpiresIn = (value: string): number => {
  const match = value.match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(`Invalid JWT expiry format: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const map: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * map[unit];
};

const signToken = (payload: object, secret: string, expiresIn: string): string => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + parseExpiresIn(expiresIn);

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify({ ...payload, exp }));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  return `${data}.${signature}`;
};

const verifyToken = <T>(token: string, secret: string): T => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AppError(401, 'Invalid token');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');

  if (signature.length != expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError(401, 'Invalid token');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as BasePayload;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError(401, 'Token expired');
  }

  return payload as T;
};

export const signAccessToken = (payload: JwtUserPayload): string =>
  signToken(payload, env.JWT_ACCESS_SECRET, env.JWT_ACCESS_EXPIRES_IN);

export const signRefreshToken = (payload: JwtUserPayload): string =>
  signToken({ ...payload, tokenType: 'refresh' }, env.JWT_REFRESH_SECRET, env.JWT_REFRESH_EXPIRES_IN);

export const verifyAccessToken = (token: string): JwtUserPayload =>
  verifyToken<JwtUserPayload>(token, env.JWT_ACCESS_SECRET);

export const verifyRefreshToken = (token: string): RefreshPayload =>
  verifyToken<RefreshPayload>(token, env.JWT_REFRESH_SECRET);
