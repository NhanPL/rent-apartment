import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { env } from '../../config/env';
import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { logger } from '../../shared/services/logger.service';

type ThrottleScope = 'IDENTIFIER' | 'IP';
type ThrottleClient = Pick<PoolClient, 'query'>;

interface ThrottleRow {
  scope: ThrottleScope;
  key_hash: string;
  failed_count: number;
  locked_until: string | null;
}

interface FailureResult extends ThrottleRow {
  lockSeconds: number;
}

const hashValue = (value: string): string => (
  crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(value, 'utf8')
    .digest('hex')
);

const identifierHash = (identifier: string): string => (
  hashValue(identifier.trim().toLocaleLowerCase())
);

const ipHash = (ip: string): string => hashValue(ip.trim().toLocaleLowerCase());

const thresholdFor = (scope: ThrottleScope): number => (
  scope === 'IDENTIFIER'
    ? env.LOGIN_FAILURE_MAX_PER_IDENTIFIER
    : env.LOGIN_FAILURE_MAX_PER_IP
);

const lockSecondsFor = (failedCount: number, threshold: number): number => {
  if (failedCount < threshold) return 0;
  const exponent = Math.min(failedCount - threshold, 20);
  return Math.min(
    env.LOGIN_LOCK_BASE_SECONDS * (2 ** exponent),
    env.LOGIN_LOCK_MAX_MINUTES * 60
  );
};

const recordScopeFailure = async (
  client: ThrottleClient,
  scope: ThrottleScope,
  keyHash: string
): Promise<FailureResult> => {
  const result = await client.query<ThrottleRow>(
    `INSERT INTO auth_login_throttle(
       scope,key_hash,failed_count,window_started_at,last_failed_at,created_at,updated_at
     )
     VALUES($1,$2,1,now(),now(),now(),now())
     ON CONFLICT(scope,key_hash) DO UPDATE SET
       failed_count=CASE
         WHEN auth_login_throttle.window_started_at <= now() - make_interval(mins => $3)
           THEN 1
         ELSE auth_login_throttle.failed_count + 1
       END,
       window_started_at=CASE
         WHEN auth_login_throttle.window_started_at <= now() - make_interval(mins => $3)
           THEN now()
         ELSE auth_login_throttle.window_started_at
       END,
       last_failed_at=now(),
       updated_at=now()
     RETURNING scope,key_hash,failed_count,locked_until`,
    [scope, keyHash, env.LOGIN_FAILURE_WINDOW_MINUTES]
  );

  const row = result.rows[0];
  const lockSeconds = lockSecondsFor(row.failed_count, thresholdFor(scope));
  if (lockSeconds === 0) return { ...row, lockSeconds };

  const locked = await client.query<ThrottleRow>(
    `UPDATE auth_login_throttle
     SET locked_until=GREATEST(
       COALESCE(locked_until, now()),
       now() + make_interval(secs => $3)
     ),
     updated_at=now()
     WHERE scope=$1 AND key_hash=$2
     RETURNING scope,key_hash,failed_count,locked_until`,
    [scope, keyHash, lockSeconds]
  );

  return { ...locked.rows[0], lockSeconds };
};

const suspiciousLogMetadata = (result: FailureResult) => ({
  scope: result.scope,
  failedCount: result.failed_count,
  lockSeconds: result.lockSeconds,
  keyFingerprint: result.key_hash.slice(0, 12),
  lockedUntil: result.locked_until
});

export const assertLoginNotThrottled = async (
  identifier: string,
  clientIp: string
): Promise<void> => {
  const result = await query<ThrottleRow>(
    `SELECT scope,key_hash,failed_count,locked_until
     FROM auth_login_throttle
     WHERE (scope='IDENTIFIER' AND key_hash=$1)
        OR (scope='IP' AND key_hash=$2)`,
    [identifierHash(identifier), ipHash(clientIp)]
  );

  const activeLock = result.rows.find((row) => (
    row.locked_until && new Date(row.locked_until).getTime() > Date.now()
  ));
  if (!activeLock) return;

  throw new AppError(
    429,
    'Too many failed login attempts. Please wait and try again.',
    'LOGIN_TEMPORARILY_LOCKED'
  );
};

export const recordLoginFailure = async (
  identifier: string,
  clientIp: string
): Promise<void> => {
  await withTransaction(async (client) => {
    const identifierResult = await recordScopeFailure(
      client,
      'IDENTIFIER',
      identifierHash(identifier)
    );
    const ipResult = await recordScopeFailure(client, 'IP', ipHash(clientIp));
    const results = [identifierResult, ipResult];
    const locked = results.filter((result) => result.lockSeconds > 0);
    if (locked.length === 0) return;

    await writeAuditLog(client, {
      actorUserId: null,
      action: 'AUTH_LOGIN_BRUTE_FORCE_SUSPECTED',
      entityType: 'AUTHENTICATION',
      entityId: null,
      metadata: {
        throttles: locked.map(suspiciousLogMetadata)
      }
    });

    logger.warn({
      throttles: locked.map(suspiciousLogMetadata)
    }, 'Suspected login brute force blocked');
  });
};

export const clearIdentifierLoginFailures = async (
  identifier: string
): Promise<void> => {
  await query(
    `DELETE FROM auth_login_throttle
     WHERE scope='IDENTIFIER' AND key_hash=$1`,
    [identifierHash(identifier)]
  );
};
