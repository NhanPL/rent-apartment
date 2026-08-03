import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  ssl: env.DB_SSL === 'true'
    ? {
        rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
        ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA } : {})
      }
    : undefined
});
