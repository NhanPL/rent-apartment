import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { env } from '../../config/env';
import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import type { AppRole } from '../../shared/middleware/auth';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { signAccessToken } from '../../shared/utils/jwt';

type SessionClient = Pick<PoolClient, 'query'>;

export interface SessionRequestContext {
  clientIp: string;
  userAgent: string | null;
}

interface SessionUser {
  id: string;
  role: AppRole;
  sessionVersion: number;
}

interface RefreshTokenRow {
  id: string;
  session_id: string;
  token_expires_at: string;
  token_revoked_at: string | null;
  token_revocation_reason: string | null;
  session_expires_at: string;
  session_revoked_at: string | null;
  session_version: number;
  user_id: string;
  role: AppRole;
  user_session_version: number;
  is_active: boolean;
  account_status: string;
}

interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

type RotationResult =
  | { status: 'SUCCESS'; tokens: SessionTokens }
  | { status: 'INVALID' | 'REUSED' };

const hashRefreshToken = (token: string): string => (
  crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token, 'utf8').digest('hex')
);

const hashIp = (ip: string): string => (
  crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(ip || 'unknown', 'utf8').digest('hex')
);

const createOpaqueRefreshToken = (): string => crypto.randomBytes(48).toString('base64url');

const refreshExpiry = (): Date => (
  new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000)
);

const invalidRefreshToken = (): AppError => (
  new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN')
);

const revokeSession = async (
  client: SessionClient,
  sessionId: string,
  reason: string
): Promise<void> => {
  await client.query(
    `UPDATE auth_session
     SET revoked_at=COALESCE(revoked_at,now()),
         revocation_reason=COALESCE(revocation_reason,$2)
     WHERE id=$1`,
    [sessionId, reason]
  );
  await client.query(
    `UPDATE auth_refresh_token
     SET revoked_at=COALESCE(revoked_at,now()),
         revocation_reason=COALESCE(revocation_reason,$2)
     WHERE session_id=$1`,
    [sessionId, reason]
  );
};

export const revokeUserSessions = async (
  client: SessionClient,
  userId: string,
  reason: string
): Promise<void> => {
  await client.query(
    `UPDATE auth_session
     SET revoked_at=COALESCE(revoked_at,now()),
         revocation_reason=COALESCE(revocation_reason,$2)
     WHERE user_id=$1`,
    [userId, reason]
  );
  await client.query(
    `UPDATE auth_refresh_token refresh_token
     SET revoked_at=COALESCE(refresh_token.revoked_at,now()),
         revocation_reason=COALESCE(refresh_token.revocation_reason,$2)
     FROM auth_session session
     WHERE refresh_token.session_id=session.id
       AND session.user_id=$1`,
    [userId, reason]
  );
};

export const createAuthSession = async (
  user: SessionUser,
  context: SessionRequestContext
): Promise<SessionTokens> => withTransaction(async (client) => {
  const expiresAt = refreshExpiry();
  const sessionResult = await client.query<{ id: string }>(
    `INSERT INTO auth_session(
       user_id,session_version,expires_at,ip_hash,user_agent
     )
     VALUES($1,$2,$3,$4,$5)
     RETURNING id`,
    [
      user.id,
      user.sessionVersion,
      expiresAt.toISOString(),
      hashIp(context.clientIp),
      context.userAgent?.slice(0, 500) ?? null
    ]
  );
  const sessionId = sessionResult.rows[0]?.id;
  if (!sessionId) throw new AppError(500, 'Unable to create login session', 'SESSION_CREATE_FAILED');

  const refreshToken = createOpaqueRefreshToken();
  await client.query(
    `INSERT INTO auth_refresh_token(session_id,token_hash,expires_at)
     VALUES($1,$2,$3)`,
    [sessionId, hashRefreshToken(refreshToken), expiresAt.toISOString()]
  );

  await writeAuditLog(client, {
    actorUserId: user.id,
    actorRole: user.role,
    action: 'AUTH_SESSION_CREATED',
    entityType: 'AUTH_SESSION',
    entityId: sessionId
  });

  return {
    accessToken: signAccessToken({
      userId: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
      sessionId
    }),
    refreshToken,
    refreshTokenExpiresAt: expiresAt
  };
});

export const rotateRefreshToken = async (
  rawRefreshToken: string,
  context: SessionRequestContext
): Promise<SessionTokens> => {
  const result = await withTransaction<RotationResult>(async (client) => {
    const tokenResult = await client.query<RefreshTokenRow>(
      `SELECT refresh_token.id,
              refresh_token.session_id,
              refresh_token.expires_at AS token_expires_at,
              refresh_token.revoked_at AS token_revoked_at,
              refresh_token.revocation_reason AS token_revocation_reason,
              session.expires_at AS session_expires_at,
              session.revoked_at AS session_revoked_at,
              session.session_version,
              app_user.id AS user_id,
              app_user.role,
              app_user.session_version AS user_session_version,
              app_user.is_active,
              app_user.account_status
       FROM auth_refresh_token refresh_token
       JOIN auth_session session ON session.id=refresh_token.session_id
       JOIN app_user ON app_user.id=session.user_id
       WHERE refresh_token.token_hash=$1
       LIMIT 1
       FOR UPDATE OF refresh_token, session, app_user`,
      [hashRefreshToken(rawRefreshToken)]
    );
    const row = tokenResult.rows[0];
    if (!row) return { status: 'INVALID' };

    if (row.token_revoked_at) {
      if (row.token_revocation_reason === 'ROTATED') {
        await revokeSession(client, row.session_id, 'TOKEN_REUSE_DETECTED');
        await writeAuditLog(client, {
          actorUserId: row.user_id,
          actorRole: row.role,
          action: 'REFRESH_TOKEN_REUSE_DETECTED',
          entityType: 'AUTH_SESSION',
          entityId: row.session_id
        });
        return { status: 'REUSED' };
      }
      return { status: 'INVALID' };
    }

    const expired = (
      new Date(row.token_expires_at).getTime() <= Date.now()
      || new Date(row.session_expires_at).getTime() <= Date.now()
    );
    const accountInvalid = (
      !row.is_active
      || row.account_status !== 'ACTIVE'
      || row.session_version !== row.user_session_version
    );
    if (row.session_revoked_at || expired || accountInvalid) {
      await revokeSession(
        client,
        row.session_id,
        expired ? 'EXPIRED' : accountInvalid ? 'ACCOUNT_SECURITY_CHANGE' : 'SESSION_REVOKED'
      );
      return { status: 'INVALID' };
    }

    await client.query(
      `UPDATE auth_refresh_token
       SET revoked_at=now(),
           revocation_reason='ROTATED',
           last_used_at=now()
       WHERE id=$1`,
      [row.id]
    );

    const refreshToken = createOpaqueRefreshToken();
    const replacement = await client.query<{ id: string }>(
      `INSERT INTO auth_refresh_token(session_id,token_hash,expires_at)
       VALUES($1,$2,$3)
       RETURNING id`,
      [row.session_id, hashRefreshToken(refreshToken), row.session_expires_at]
    );
    await client.query(
      `UPDATE auth_refresh_token
       SET replaced_by_token_id=$1
       WHERE id=$2`,
      [replacement.rows[0]?.id ?? null, row.id]
    );
    await client.query(
      `UPDATE auth_session
       SET last_used_at=now(),
           ip_hash=$2,
           user_agent=$3
       WHERE id=$1`,
      [
        row.session_id,
        hashIp(context.clientIp),
        context.userAgent?.slice(0, 500) ?? null
      ]
    );

    return {
      status: 'SUCCESS',
      tokens: {
        accessToken: signAccessToken({
          userId: row.user_id,
          role: row.role,
          sessionVersion: row.user_session_version,
          sessionId: row.session_id
        }),
        refreshToken,
        refreshTokenExpiresAt: new Date(row.session_expires_at)
      }
    };
  });

  if (result.status !== 'SUCCESS') throw invalidRefreshToken();
  return result.tokens;
};

export const revokeSessionByRefreshToken = async (rawRefreshToken: string): Promise<void> => {
  await withTransaction(async (client) => {
    const result = await client.query<{ session_id: string; user_id: string }>(
      `SELECT refresh_token.session_id, session.user_id
       FROM auth_refresh_token refresh_token
       JOIN auth_session session ON session.id=refresh_token.session_id
       WHERE refresh_token.token_hash=$1
       LIMIT 1
       FOR UPDATE OF session`,
      [hashRefreshToken(rawRefreshToken)]
    );
    const row = result.rows[0];
    if (!row) return;
    await revokeSession(client, row.session_id, 'LOGOUT');
    await writeAuditLog(client, {
      actorUserId: row.user_id,
      action: 'AUTH_SESSION_REVOKED',
      entityType: 'AUTH_SESSION',
      entityId: row.session_id,
      metadata: { reason: 'LOGOUT' }
    });
  });
};

export const revokeAllUserSessions = async (userId: string): Promise<void> => {
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE app_user SET session_version=session_version + 1 WHERE id=$1',
      [userId]
    );
    await revokeUserSessions(client, userId, 'USER_REVOKED_ALL');
    await writeAuditLog(client, {
      actorUserId: userId,
      action: 'ALL_AUTH_SESSIONS_REVOKED',
      entityType: 'APP_USER',
      entityId: userId
    });
  });
};

export const cleanupExpiredSessions = async (): Promise<number> => {
  const result = await query<{ id: string }>(
    `DELETE FROM auth_session
     WHERE expires_at <= now()
        OR (
          revoked_at IS NOT NULL
          AND revoked_at < now() - ($1 * interval '1 day')
        )
     RETURNING id`,
    [env.SESSION_RETENTION_DAYS]
  );
  return result.rows.length;
};
