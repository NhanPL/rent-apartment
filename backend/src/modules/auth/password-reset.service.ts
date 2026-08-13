import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { env } from '../../config/env';
import { withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import {
  assertPasswordPolicy,
  hashPassword,
  verifyPasswordHash
} from '../../shared/utils/password';
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  type EmailLocale
} from '../../shared/services/email.service';
import { revokeUserSessions } from './session.service';
import { logger } from '../../shared/services/logger.service';

type PasswordResetClient = Pick<PoolClient, 'query'>;

interface ResetAccountRow {
  id: string;
  email: string;
  preferred_language: EmailLocale;
}

interface ResetTokenRow {
  id: string;
  user_id: string;
  email: string;
  password_hash: string;
  preferred_language: EmailLocale;
}

interface RateLimitRow {
  identifier_count: number;
  ip_count: number;
}

interface ResetDelivery {
  userId: string;
  email: string;
  token: string;
  expiresAt: string;
  locale: EmailLocale;
}

export const PASSWORD_RESET_REQUEST_MESSAGE =
  'If an active account exists for this email, password reset instructions will be sent shortly.';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

const hashToken = (token: string): string => (
  crypto.createHash('sha256').update(token, 'utf8').digest('hex')
);

const hashRateLimitValue = (value: string): string => (
  crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(value, 'utf8').digest('hex')
);

const invalidResetToken = (): AppError => (
  new AppError(
    400,
    'This password reset link is invalid, expired, or has already been used.',
    'PASSWORD_RESET_TOKEN_INVALID'
  )
);

const buildResetUrl = (token: string): string => {
  const baseUrl = env.FRONTEND_URL.endsWith('/') ? env.FRONTEND_URL : `${env.FRONTEND_URL}/`;
  const url = new URL('reset-password', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
};

const readRateLimit = async (
  client: PasswordResetClient,
  identifierHash: string,
  ipHash: string
): Promise<RateLimitRow> => {
  const result = await client.query<RateLimitRow>(
    `SELECT
       COUNT(*) FILTER (WHERE identifier_hash=$1)::int AS identifier_count,
       COUNT(*) FILTER (WHERE ip_hash=$2)::int AS ip_count
     FROM password_reset_request
     WHERE created_at > now() - ($3 * interval '1 minute')
       AND (identifier_hash=$1 OR ip_hash=$2)`,
    [identifierHash, ipHash, env.PASSWORD_RESET_RATE_WINDOW_MINUTES]
  );
  return result.rows[0] ?? { identifier_count: 0, ip_count: 0 };
};

export const requestPasswordReset = async (email: string, clientIp: string): Promise<void> => {
  const normalizedEmail = email.trim().toLowerCase();
  const identifierHash = hashRateLimitValue(normalizedEmail);
  const ipHash = hashRateLimitValue(clientIp || 'unknown');

  const delivery = await withTransaction<ResetDelivery | null>(async (client) => {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [ipHash]
    );
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [identifierHash]
    );

    const rateLimit = await readRateLimit(client, identifierHash, ipHash);
    const accountResult = await client.query<ResetAccountRow>(
      `SELECT id, email::text AS email, preferred_language
       FROM app_user
       WHERE email=$1
         AND account_status='ACTIVE'
         AND is_active=true
         AND password_hash IS NOT NULL
         AND btrim(password_hash) <> ''
       LIMIT 1
       FOR UPDATE OF app_user`,
      [normalizedEmail]
    );
    const account = accountResult.rows[0];
    const rateLimited = (
      rateLimit.identifier_count >= env.PASSWORD_RESET_MAX_PER_IDENTIFIER
      || rateLimit.ip_count >= env.PASSWORD_RESET_MAX_PER_IP
    );

    await client.query(
      `INSERT INTO password_reset_request(identifier_hash,ip_hash,user_id)
       VALUES($1,$2,$3)`,
      [identifierHash, ipHash, account?.id ?? null]
    );

    await writeAuditLog(client, {
      actorUserId: null,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'APP_USER',
      entityId: account?.id ?? null,
      metadata: {
        outcome: rateLimited ? 'RATE_LIMITED' : account ? 'ACCEPTED' : 'ACCOUNT_NOT_ELIGIBLE'
      }
    });

    if (!account || rateLimited) return null;

    await client.query(
      `UPDATE password_reset_token
       SET revoked_at=now()
       WHERE user_id=$1
         AND used_at IS NULL
         AND revoked_at IS NULL`,
      [account.id]
    );

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + env.PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000
    ).toISOString();
    await client.query(
      `INSERT INTO password_reset_token(user_id,token_hash,expires_at)
       VALUES($1,$2,$3)`,
      [account.id, hashToken(token), expiresAt]
    );

    return {
      userId: account.id,
      email: account.email,
      token,
      expiresAt,
      locale: account.preferred_language
    };
  });

  if (!delivery) return;

  try {
    await sendPasswordResetEmail({
      to: delivery.email,
      resetUrl: buildResetUrl(delivery.token),
      expiresAt: delivery.expiresAt,
      locale: delivery.locale
    });
  } catch (error) {
    logger.error({
      userId: delivery.userId,
      error
    }, 'Failed to send password reset email');
  }
};

const findValidResetToken = async (
  client: PasswordResetClient,
  token: string
): Promise<ResetTokenRow> => {
  if (!TOKEN_PATTERN.test(token)) throw invalidResetToken();

  const result = await client.query<ResetTokenRow>(
    `SELECT reset_token.id, reset_token.user_id,
            app_user.email::text AS email, app_user.password_hash,
            app_user.preferred_language
     FROM password_reset_token reset_token
     JOIN app_user ON app_user.id=reset_token.user_id
     WHERE reset_token.token_hash=$1
       AND reset_token.used_at IS NULL
       AND reset_token.revoked_at IS NULL
       AND reset_token.expires_at > now()
       AND app_user.account_status='ACTIVE'
       AND app_user.is_active=true
     LIMIT 1
     FOR UPDATE OF reset_token, app_user`,
    [hashToken(token)]
  );
  const resetToken = result.rows[0];
  if (!resetToken?.email) throw invalidResetToken();
  return resetToken;
};

export const confirmPasswordReset = async (token: string, newPassword: string): Promise<void> => {
  assertPasswordPolicy(newPassword);
  const completedReset = await withTransaction<{ email: string; userId: string; locale: EmailLocale }>(async (client) => {
    const resetToken = await findValidResetToken(client, token);
    const applicationPasswordMatch = await verifyPasswordHash(
      newPassword,
      resetToken.password_hash
    );
    const passwordMatches = applicationPasswordMatch ?? Boolean(
      (
        await client.query<{ is_valid: boolean }>(
          'SELECT crypt($1, $2) = $2 AS is_valid',
          [newPassword, resetToken.password_hash]
        )
      ).rows[0]?.is_valid
    );
    if (passwordMatches) {
      throw new AppError(
        400,
        'New password must be different from the current password',
        'PASSWORD_REUSE_NOT_ALLOWED'
      );
    }
    const passwordHash = await hashPassword(newPassword);

    await client.query(
      `UPDATE app_user
       SET password_hash=$1,
           session_version=session_version + 1
       WHERE id=$2`,
      [passwordHash, resetToken.user_id]
    );
    await revokeUserSessions(client, resetToken.user_id, 'PASSWORD_RESET');

    await client.query(
      `UPDATE password_reset_token
       SET used_at=now()
       WHERE id=$1`,
      [resetToken.id]
    );

    await client.query(
      `UPDATE password_reset_token
       SET revoked_at=now()
       WHERE user_id=$1
         AND id<>$2
         AND used_at IS NULL
         AND revoked_at IS NULL`,
      [resetToken.user_id, resetToken.id]
    );

    await writeAuditLog(client, {
      actorUserId: resetToken.user_id,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'APP_USER',
      entityId: resetToken.user_id,
      before: { passwordConfigured: true },
      after: { passwordConfigured: true, sessionsRevoked: true },
      metadata: { method: 'PASSWORD_RESET' }
    });

    return {
      email: resetToken.email,
      userId: resetToken.user_id,
      locale: resetToken.preferred_language
    };
  });

  try {
    await sendPasswordChangedEmail({ to: completedReset.email, locale: completedReset.locale });
  } catch (error) {
    logger.error({
      userId: completedReset.userId,
      error
    }, 'Failed to send password changed notification');
  }
};
