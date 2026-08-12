import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { generateSecret, generateURI, verify } from 'otplib';
import { env } from '../../config/env';
import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { verifyPasswordHash } from '../../shared/utils/password';
import { revokeUserSessions } from './session.service';

const algorithm = 'aes-256-gcm';
const encryptionKey = crypto.createHash('sha256').update(env.MFA_ENCRYPTION_SECRET, 'utf8').digest();

interface ManagerTwoFactorRow {
  id: string;
  email: string | null;
  username: string | null;
  password_hash: string | null;
  role: 'MANAGER' | 'TENANT';
  two_factor_enabled: boolean;
  two_factor_secret_encrypted: string | null;
  two_factor_pending_secret_encrypted: string | null;
}

const encryptSecret = (secret: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
};

const decryptSecret = (encrypted: string): string => {
  const parts = encrypted.split('.');
  if (parts.length !== 3) throw new AppError(500, 'Two-factor authentication configuration is invalid', 'TWO_FACTOR_CONFIGURATION_INVALID');
  try {
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
    const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new AppError(500, 'Two-factor authentication configuration is invalid', 'TWO_FACTOR_CONFIGURATION_INVALID');
  }
};

const verifyCode = async (encryptedSecret: string, code: string): Promise<boolean> => {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    return (await verify({ secret: decryptSecret(encryptedSecret), token: code })).valid;
  } catch {
    return false;
  }
};

const managerById = async (
  client: Pick<PoolClient, 'query'>,
  userId: string,
  lock = false
): Promise<ManagerTwoFactorRow> => {
  const result = await client.query<ManagerTwoFactorRow>(
    `SELECT id,email,username,password_hash,role,two_factor_enabled,
            two_factor_secret_encrypted,two_factor_pending_secret_encrypted
     FROM app_user
     WHERE id=$1
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId]
  );
  const user = result.rows[0];
  if (!user || user.role !== 'MANAGER') {
    throw new AppError(403, 'Two-factor authentication is available to managers only', 'TWO_FACTOR_MANAGER_ONLY');
  }
  return user;
};

export const getManagerTwoFactorStatus = async (userId: string): Promise<{ enabled: boolean }> => {
  const user = await managerById({ query }, userId);
  return { enabled: user.two_factor_enabled };
};

export const beginManagerTwoFactorSetup = async (
  userId: string
): Promise<{ secret: string; otpauthUri: string }> => withTransaction(async (client) => {
  const user = await managerById(client, userId, true);
  if (user.two_factor_enabled) {
    throw new AppError(409, 'Two-factor authentication is already enabled', 'TWO_FACTOR_ALREADY_ENABLED');
  }
  const secret = generateSecret();
  await client.query(
    `UPDATE app_user
     SET two_factor_pending_secret_encrypted=$1
     WHERE id=$2`,
    [encryptSecret(secret), userId]
  );
  await writeAuditLog(client, {
    actorUserId: userId,
    actorRole: 'MANAGER',
    action: 'MANAGER_TWO_FACTOR_SETUP_STARTED',
    entityType: 'APP_USER',
    entityId: userId
  });
  return {
    secret,
    otpauthUri: generateURI({ issuer: 'Rent Apartment', label: user.email ?? user.username ?? user.id, secret })
  };
});

export const enableManagerTwoFactor = async (userId: string, code: string): Promise<void> => {
  await withTransaction(async (client) => {
    const user = await managerById(client, userId, true);
    if (user.two_factor_enabled) {
      throw new AppError(409, 'Two-factor authentication is already enabled', 'TWO_FACTOR_ALREADY_ENABLED');
    }
    if (!user.two_factor_pending_secret_encrypted) {
      throw new AppError(409, 'Start two-factor setup before enabling it', 'TWO_FACTOR_SETUP_REQUIRED');
    }
    if (!(await verifyCode(user.two_factor_pending_secret_encrypted, code))) {
      throw new AppError(400, 'The authentication code is invalid or expired', 'INVALID_TWO_FACTOR_CODE');
    }
    await client.query(
      `UPDATE app_user
       SET two_factor_enabled=true,
           two_factor_secret_encrypted=two_factor_pending_secret_encrypted,
           two_factor_pending_secret_encrypted=NULL,
           two_factor_enabled_at=now(),
           session_version=session_version + 1
       WHERE id=$1`,
      [userId]
    );
    await revokeUserSessions(client, userId, 'TWO_FACTOR_ENABLED');
    await writeAuditLog(client, {
      actorUserId: userId,
      actorRole: 'MANAGER',
      action: 'MANAGER_TWO_FACTOR_ENABLED',
      entityType: 'APP_USER',
      entityId: userId
    });
  });
};

export const disableManagerTwoFactor = async (
  userId: string,
  password: string,
  code: string
): Promise<void> => {
  await withTransaction(async (client) => {
    const user = await managerById(client, userId, true);
    if (!user.two_factor_enabled || !user.two_factor_secret_encrypted) {
      throw new AppError(409, 'Two-factor authentication is not enabled', 'TWO_FACTOR_NOT_ENABLED');
    }
    const applicationPasswordValid = user.password_hash
      ? await verifyPasswordHash(password, user.password_hash)
      : false;
    const passwordValid = applicationPasswordValid === null && user.password_hash
      ? Boolean((await client.query<{ is_valid: boolean }>(
        'SELECT crypt($1, $2) = $2 AS is_valid',
        [password, user.password_hash]
      )).rows[0]?.is_valid)
      : Boolean(applicationPasswordValid);
    if (!passwordValid) {
      throw new AppError(401, 'The current password is incorrect', 'CURRENT_PASSWORD_INCORRECT');
    }
    if (!(await verifyCode(user.two_factor_secret_encrypted, code))) {
      throw new AppError(400, 'The authentication code is invalid or expired', 'INVALID_TWO_FACTOR_CODE');
    }
    await client.query(
      `UPDATE app_user
       SET two_factor_enabled=false,
           two_factor_secret_encrypted=NULL,
           two_factor_pending_secret_encrypted=NULL,
           two_factor_enabled_at=NULL,
           session_version=session_version + 1
       WHERE id=$1`,
      [userId]
    );
    await revokeUserSessions(client, userId, 'TWO_FACTOR_DISABLED');
    await writeAuditLog(client, {
      actorUserId: userId,
      actorRole: 'MANAGER',
      action: 'MANAGER_TWO_FACTOR_DISABLED',
      entityType: 'APP_USER',
      entityId: userId
    });
  });
};

export const assertManagerLoginTwoFactor = async (
  encryptedSecret: string,
  code?: string
): Promise<void> => {
  if (!code) {
    throw new AppError(401, 'Enter the code from your authenticator app', 'TWO_FACTOR_REQUIRED');
  }
  if (!(await verifyCode(encryptedSecret, code))) {
    throw new AppError(401, 'The authentication code is invalid or expired', 'INVALID_TWO_FACTOR_CODE');
  }
};
