import type { CorsOptions } from 'cors';
import { AppError } from '../shared/errors/app-error';
import { env } from './env';

export const CORS_ALLOWED_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS'
];

export const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept'
];

export const parseAllowedOrigins = (rawOrigins: string): string[] => {
  const origins = rawOrigins
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (value === '*') {
        throw new Error('CORS_ALLOWED_ORIGINS cannot contain a wildcard');
      }

      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`Invalid CORS origin: ${value}`);
      }

      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:')
        || url.username
        || url.password
        || url.pathname !== '/'
        || url.search
        || url.hash
      ) {
        throw new Error(`Invalid CORS origin: ${value}`);
      }
      return url.origin;
    });

  const uniqueOrigins = [...new Set(origins)];
  if (uniqueOrigins.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must contain at least one origin');
  }
  return uniqueOrigins;
};

export const corsAllowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
const allowedOriginSet = new Set(corsAllowedOrigins);

export const isCorsOriginAllowed = (origin: string): boolean => (
  allowedOriginSet.has(origin)
);

const resolveOrigin: NonNullable<CorsOptions['origin']> = (origin, callback) => {
  if (!origin) {
    callback(null, false);
    return;
  }
  if (isCorsOriginAllowed(origin)) {
    callback(null, true);
    return;
  }
  callback(new AppError(
    403,
    'Request origin is not allowed',
    'CORS_ORIGIN_DENIED'
  ));
};

export const corsOptions: CorsOptions = {
  origin: resolveOrigin,
  credentials: true,
  methods: CORS_ALLOWED_METHODS,
  allowedHeaders: CORS_ALLOWED_HEADERS,
  optionsSuccessStatus: 204,
  preflightContinue: false,
  maxAge: 600
};
