import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DB_SSL: z.enum(['true', 'false']).default('true'),
  DB_SSL_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).default('false'),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DEFAULT_BANK_CODE: z.string().optional(),
  DEFAULT_BANK_ACCOUNT_NO: z.string().optional(),
  DEFAULT_BANK_ACCOUNT_NAME: z.string().optional(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM_NAME: z.string().min(1),
  SMTP_FROM_EMAIL: z.string().email()
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
