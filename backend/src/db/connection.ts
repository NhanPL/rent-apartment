import { pool } from './pool';

function explainConnectionError(error: NodeJS.ErrnoException): string {
  if (error.code === 'ENOTFOUND') {
    return 'Database host not found. Check DATABASE_URL host from Supabase and make sure it is the DB host, not the REST/API URL.';
  }

  if (error.code === 'ETIMEDOUT') {
    return 'Connection timed out. Check network egress/firewall settings and Supabase connection limits.';
  }

  if (error.code === 'ECONNREFUSED') {
    return 'Connection refused. Verify host/port (Supabase PostgreSQL uses port 5432).';
  }

  const message = error.message.toLowerCase();
  if (message.includes('self signed certificate') || message.includes('ssl')) {
    return 'SSL handshake failed. For Supabase, enable SSL and set DB_SSL_REJECT_UNAUTHORIZED=false when needed.';
  }

  if (message.includes('password authentication failed')) {
    return 'Authentication failed. Verify database user and password from Supabase project settings.';
  }

  return 'Unknown database connection issue. Verify DATABASE_URL and SSL settings.';
}

export async function assertDatabaseConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    const hint = explainConnectionError(err);
    throw new Error(`Database connection failed (${err.code ?? 'UNKNOWN'}): ${err.message}. ${hint}`);
  }
}
