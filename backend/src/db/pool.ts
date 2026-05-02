import { Pool } from 'pg';
import { env } from '../config/env';

const isSupabaseHost = env.DATABASE_URL.includes('.supabase.co');
const shouldUseSsl = env.DB_SSL === 'true' || isSupabaseHost;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  ssl: shouldUseSsl
    ? {
        rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
      }
    : undefined
});
