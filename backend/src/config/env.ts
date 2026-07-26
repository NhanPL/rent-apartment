import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const optionalString = z.string().optional().default('');
const optionalEmail = z.union([z.string().email(), z.literal('')]).optional().default('');
const defaultAppEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const optionalSameSite = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.enum(['strict', 'lax', 'none']).optional()
);

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default(defaultAppEnv),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DB_SSL: z.enum(['true', 'false']).default('true'),
  DB_SSL_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).default('false'),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  REFRESH_COOKIE_NAME: z.string().trim().min(1).default('rent_refresh_token'),
  REFRESH_COOKIE_DOMAIN: optionalString,
  REFRESH_COOKIE_SAME_SITE: optionalSameSite,
  SESSION_CLEANUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(6),
  SESSION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  ACCOUNT_ACTIVATION_EXPIRES_HOURS: z.coerce.number().int().min(1).max(168).default(48),
  PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  PASSWORD_RESET_RATE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  PASSWORD_RESET_MAX_PER_IDENTIFIER: z.coerce.number().int().min(1).max(20).default(3),
  PASSWORD_RESET_MAX_PER_IP: z.coerce.number().int().min(1).max(100).default(10),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DEFAULT_BANK_CODE: z.string().optional(),
  DEFAULT_BANK_ACCOUNT_NO: z.string().optional(),
  DEFAULT_BANK_ACCOUNT_NAME: z.string().optional(),
  VIETQR_IMAGE_BASE_URL: z.string().trim().url().default('https://img.vietqr.io/image'),
  VIETQR_TEMPLATE: z.string().trim().min(1).default('compact2'),
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_API_KEY: z.string().trim().optional(),
  CLOUDINARY_API_SECRET: z.string().trim().optional(),
  CLOUDINARY_UPLOAD_ROOT_FOLDER: z.string().trim().default('rent-apartment'),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM_NAME: optionalString,
  SMTP_FROM_EMAIL: optionalEmail
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
