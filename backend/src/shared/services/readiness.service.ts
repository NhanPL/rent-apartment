import { query } from '../../db';
import { env } from '../../config/env';

let shuttingDown = false;

export const markApplicationShuttingDown = (): void => {
  shuttingDown = true;
};

export const resetReadinessForTests = (): void => {
  shuttingDown = false;
};

export const checkApplicationReadiness = async (
  databaseCheck: () => Promise<unknown> = () => query('SELECT 1 AS ready'),
  timeoutMs = env.READINESS_DB_TIMEOUT_MS
): Promise<{
  ready: boolean;
  checks: { database: 'up' | 'down' | 'not_checked'; lifecycle: 'running' | 'draining' };
}> => {
  if (shuttingDown) {
    return { ready: false, checks: { database: 'not_checked', lifecycle: 'draining' } };
  }

  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      databaseCheck(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Database readiness check timed out')), timeoutMs);
        timeout.unref();
      })
    ]);
    return { ready: true, checks: { database: 'up', lifecycle: 'running' } };
  } catch {
    return { ready: false, checks: { database: 'down', lifecycle: 'running' } };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
