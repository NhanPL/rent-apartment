import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import type { AccountStatus } from '../../shared/types/database';
import { AppRole } from '../../shared/middleware/auth';
import {
  assertPasswordPolicy,
  hashPassword,
  isCurrentPasswordHash,
  verifyPasswordHash
} from '../../shared/utils/password';
import {
  createAuthSession,
  revokeUserSessions,
  type SessionRequestContext
} from './session.service';
import {
  assertLoginNotThrottled,
  clearIdentifierLoginFailures,
  recordLoginFailure
} from './login-throttle.service';
import { writeAuditLog } from '../../shared/services/audit-log.service';

interface UserRow {
  id: string;
  role: AppRole;
  email: string | null;
  username: string | null;
  password_hash: string | null;
  is_active: boolean;
  account_status: AccountStatus;
  session_version: number;
}


interface UserProfile {
  id: string;
  role: AppRole;
  email: string | null;
  username: string | null;
  fullName: string | null;
  tenantId: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: UserProfile;
}

export const INVALID_CREDENTIALS_MESSAGE = 'The username or password is incorrect. Please try again.';

const toUserProfile = async (user: UserRow): Promise<UserProfile> => {
  const managerProfilePromise =
    user.role === 'MANAGER'
      ? query<{ full_name: string }>('SELECT full_name FROM manager_profile WHERE user_id = $1 LIMIT 1', [user.id])
      : Promise.resolve({ rows: [] as { full_name: string }[] });

  const tenantPromise =
    user.role === 'TENANT'
      ? query<{ id: string; full_name: string }>('SELECT id, full_name FROM tenant WHERE user_id = $1 LIMIT 1', [user.id])
      : Promise.resolve({ rows: [] as { id: string; full_name: string }[] });

  const [managerProfile, tenant] = await Promise.all([managerProfilePromise, tenantPromise]);

  return {
    id: user.id,
    role: user.role,
    email: user.email,
    username: user.username,
    fullName: managerProfile.rows[0]?.full_name ?? tenant.rows[0]?.full_name ?? null,
    tenantId: tenant.rows[0]?.id ?? null
  };
};

const hasPassword = (user: UserRow): user is UserRow & { password_hash: string } => Boolean(user.password_hash?.trim());

const verifyPassword = async (
  user: UserRow,
  plainPassword: string,
  upgradeHash = false
): Promise<boolean> => {
  if (!hasPassword(user)) {
    return false;
  }

  const applicationResult = await verifyPasswordHash(plainPassword, user.password_hash);
  if (applicationResult !== null) {
    if (applicationResult && upgradeHash && !isCurrentPasswordHash(user.password_hash)) {
      const upgradedHash = await hashPassword(plainPassword);
      await query('UPDATE app_user SET password_hash = $1 WHERE id = $2', [upgradedHash, user.id]);
    }
    return applicationResult;
  }

  const { rows } = await query<{ is_valid: boolean }>('SELECT crypt($1, $2) = $2 AS is_valid', [plainPassword, user.password_hash]);
  const isLegacyValid = Boolean(rows[0]?.is_valid);

  if (!isLegacyValid) {
    return false;
  }

  if (upgradeHash) {
    const rehashed = await hashPassword(plainPassword);
    await query('UPDATE app_user SET password_hash = $1 WHERE id = $2', [rehashed, user.id]);
  }
  return true;
};

const invalidCredentials = (): AppError => (
  new AppError(401, INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS')
);

const canAuthenticate = (user: UserRow | undefined): user is UserRow & { password_hash: string } => {
  if (!user) return false;
  return user.account_status === 'ACTIVE' && user.is_active && hasPassword(user);
};

export const authenticateLogin = async (
  identifier: string,
  password: string,
  context: SessionRequestContext
): Promise<LoginResult> => {
  await assertLoginNotThrottled(identifier, context.clientIp);

  const { rows } = await query<UserRow>(
    `SELECT id, role, email, username, password_hash, is_active, account_status, session_version
     FROM app_user
     WHERE email = $1 OR username = $1
     LIMIT 1`,
    [identifier]
  );

  const user = rows[0];
  if (!canAuthenticate(user)) {
    await recordLoginFailure(identifier, context.clientIp);
    throw invalidCredentials();
  }

  const passwordMatches = await verifyPassword(user, password, true);
  if (!passwordMatches) {
    await recordLoginFailure(identifier, context.clientIp);
    throw invalidCredentials();
  }

  const userProfile = await toUserProfile(user);

  await query('UPDATE app_user SET last_login_at = now() WHERE id = $1', [user.id]);
  const session = await createAuthSession({
    id: user.id,
    role: user.role,
    sessionVersion: user.session_version
  }, context);
  await clearIdentifierLoginFailures(identifier);

  return {
    ...session,
    user: userProfile
  };
};

export const getCurrentUser = async (userId: string): Promise<UserProfile> => {
  const { rows } = await query<UserRow>(
    'SELECT id, role, email, username, password_hash, is_active, account_status, session_version FROM app_user WHERE id = $1 LIMIT 1',
    [userId]
  );

  const user = rows[0];
  if (!user || !user.is_active || user.account_status !== 'ACTIVE') {
    throw new AppError(404, 'User not found');
  }

  return toUserProfile(user);
};

export const changePassword = async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
  assertPasswordPolicy(newPassword);
  const { rows } = await query<UserRow>(
    'SELECT id, role, email, username, password_hash, is_active, account_status, session_version FROM app_user WHERE id = $1 LIMIT 1',
    [userId]
  );

  const user = rows[0];
  if (!user || !user.is_active || user.account_status !== 'ACTIVE') {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  if (!hasPassword(user) || !(await verifyPassword(user, currentPassword))) {
    throw new AppError(400, 'Current password is incorrect', 'CURRENT_PASSWORD_INCORRECT');
  }

  if (currentPassword === newPassword || await verifyPassword(user, newPassword)) {
    throw new AppError(400, 'New password must be different from the current password', 'PASSWORD_REUSE_NOT_ALLOWED');
  }

  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE app_user SET password_hash = $1, session_version = session_version + 1 WHERE id = $2',
      [passwordHash, userId]
    );
    await revokeUserSessions(client, userId, 'PASSWORD_CHANGED');
    await writeAuditLog(client, {
      actorUserId: userId,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'APP_USER',
      entityId: userId,
      before: { sessionVersion: user.session_version, passwordConfigured: true },
      after: {
        sessionVersion: user.session_version + 1,
        passwordConfigured: true,
        sessionsRevoked: true
      },
      metadata: { method: 'CURRENT_PASSWORD' }
    });
  });
};
