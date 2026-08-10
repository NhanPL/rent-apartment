import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { env } from '../../config/env';
import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { assertPasswordPolicy, hashPassword } from '../../shared/utils/password';
import { sendTenantActivationEmail } from '../../shared/services/email.service';
import { logger } from '../../shared/services/logger.service';

type ActivationClient = Pick<PoolClient, 'query'>;

interface ActivationTokenRow {
  id: string;
  user_id: string;
  email: string;
  account_status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED';
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  manager_user_id: string | null;
}

interface PendingTenantAccountRow {
  tenant_id: string;
  tenant_name: string;
  user_id: string;
  email: string;
  username: string;
  account_status: 'PENDING_ACTIVATION' | 'ACTIVE' | 'DISABLED';
}

export interface ActivationInvitation {
  token: string;
  expiresAt: string;
}

const activationDb = { query };
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

const hashActivationToken = (token: string): string => (
  crypto.createHash('sha256').update(token, 'utf8').digest('hex')
);

const invalidActivationToken = (): AppError => (
  new AppError(400, 'This activation link is invalid, expired, or has already been used.', 'ACTIVATION_TOKEN_INVALID')
);

const assertTokenFormat = (token: string): void => {
  if (!TOKEN_PATTERN.test(token)) throw invalidActivationToken();
};

const maskEmail = (email: string): string => {
  const [localPart, domain] = email.split('@');
  if (!domain) return '***';
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${'*'.repeat(Math.max(3, localPart.length - visible.length))}@${domain}`;
};

const buildActivationUrl = (token: string): string => {
  const baseUrl = env.FRONTEND_URL.endsWith('/') ? env.FRONTEND_URL : `${env.FRONTEND_URL}/`;
  const url = new URL('activate-account', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
};

export const createActivationInvitation = async (
  client: ActivationClient,
  userId: string,
  actorUserId: string,
  source: 'TENANT_CREATED' | 'MANAGER_RESEND'
): Promise<ActivationInvitation> => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashActivationToken(token);
  const expiresAt = new Date(
    Date.now() + env.ACCOUNT_ACTIVATION_EXPIRES_HOURS * 60 * 60 * 1000
  ).toISOString();

  await client.query(
    `UPDATE account_activation_token
     SET revoked_at=now()
     WHERE user_id=$1
       AND used_at IS NULL
       AND revoked_at IS NULL`,
    [userId]
  );

  await client.query(
    `INSERT INTO account_activation_token(user_id,token_hash,expires_at,created_by_user_id)
     VALUES($1,$2,$3,$4)`,
    [userId, tokenHash, expiresAt, actorUserId]
  );

  await writeAuditLog(client, {
    actorUserId,
    action: 'TENANT_ACTIVATION_INVITATION_CREATED',
    entityType: 'APP_USER',
    entityId: userId,
    metadata: {
      source,
      expiresAt
    }
  });

  return { token, expiresAt };
};

export const deliverActivationInvitation = async (payload: {
  userId: string;
  actorUserId: string;
  tenantName: string;
  email: string;
  username: string;
  invitation: ActivationInvitation;
  source: 'TENANT_CREATED' | 'MANAGER_RESEND';
}): Promise<boolean> => {
  let deliveryStatus: 'SENT' | 'SKIPPED' | 'FAILED' = 'FAILED';
  let deliveryError: unknown;

  try {
    const sent = await sendTenantActivationEmail({
      to: payload.email,
      tenantName: payload.tenantName,
      activationUrl: buildActivationUrl(payload.invitation.token),
      username: payload.username,
      expiresAt: payload.invitation.expiresAt
    });
    deliveryStatus = sent ? 'SENT' : 'SKIPPED';
  } catch (error) {
    deliveryError = error;
  }

  await writeAuditLog(activationDb, {
    actorUserId: payload.actorUserId,
    action: 'TENANT_ACTIVATION_INVITATION_DELIVERY',
    entityType: 'APP_USER',
    entityId: payload.userId,
    metadata: {
      source: payload.source,
      deliveryStatus
    }
  });

  if (deliveryError) throw deliveryError;
  return deliveryStatus === 'SENT';
};

const findValidActivationToken = async (
  client: ActivationClient,
  token: string,
  lock: boolean
): Promise<ActivationTokenRow> => {
  assertTokenFormat(token);
  const tokenHash = hashActivationToken(token);
  const result = await client.query<ActivationTokenRow>(
    `SELECT activation.id, activation.user_id, activation.expires_at,
            activation.used_at, activation.revoked_at,
            app_user.email::text AS email, app_user.account_status,
            tenant.manager_user_id
     FROM account_activation_token activation
     JOIN app_user ON app_user.id=activation.user_id
     LEFT JOIN tenant ON tenant.user_id=app_user.id
     WHERE activation.token_hash=$1
       AND activation.used_at IS NULL
       AND activation.revoked_at IS NULL
       AND activation.expires_at > now()
       AND app_user.account_status='PENDING_ACTIVATION'
       AND app_user.is_active=false
     LIMIT 1
     ${lock ? 'FOR UPDATE OF activation, app_user' : ''}`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row?.email) throw invalidActivationToken();
  return row;
};

export const validateActivationToken = async (token: string) => {
  const activation = await findValidActivationToken(activationDb, token, false);
  return {
    valid: true as const,
    emailHint: maskEmail(activation.email),
    expiresAt: activation.expires_at
  };
};

export const activateTenantAccount = async (
  token: string,
  newPassword: string
): Promise<void> => {
  assertPasswordPolicy(newPassword);
  await withTransaction(async (client) => {
    const activation = await findValidActivationToken(client, token, true);
    const passwordHash = await hashPassword(newPassword);

    await client.query(
      `UPDATE app_user
       SET password_hash=$1,
           account_status='ACTIVE',
           is_active=true
       WHERE id=$2`,
      [passwordHash, activation.user_id]
    );

    await client.query(
      `UPDATE account_activation_token
       SET used_at=now()
       WHERE id=$1`,
      [activation.id]
    );

    await client.query(
      `UPDATE account_activation_token
       SET revoked_at=now()
       WHERE user_id=$1
         AND id<>$2
         AND used_at IS NULL
         AND revoked_at IS NULL`,
      [activation.user_id, activation.id]
    );

    await writeAuditLog(client, {
      actorUserId: activation.user_id,
      actorRole: 'TENANT',
      managerUserId: activation.manager_user_id,
      action: 'USER_ACTIVATED',
      entityType: 'APP_USER',
      entityId: activation.user_id,
      before: { accountStatus: 'PENDING_ACTIVATION', isActive: false },
      after: { accountStatus: 'ACTIVE', isActive: true }
    });
  });
};

export const resendTenantActivation = async (
  tenantId: string,
  managerId: string
): Promise<{ emailSent: boolean; expiresAt: string }> => {
  const { account, invitation } = await withTransaction(async (client) => {
    const result = await client.query<PendingTenantAccountRow>(
      `SELECT tenant.id AS tenant_id, tenant.full_name AS tenant_name,
              app_user.id AS user_id, app_user.email::text AS email,
              app_user.username::text AS username, app_user.account_status
       FROM tenant
       JOIN app_user ON app_user.id=tenant.user_id
       WHERE tenant.id=$1
         AND tenant.manager_user_id=$2
         AND tenant.status <> 'DELETED'
       FOR UPDATE OF app_user`,
      [tenantId, managerId]
    );
    const account = result.rows[0];
    if (!account) {
      throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
    }
    if (account.account_status === 'ACTIVE') {
      throw new AppError(409, 'This tenant account is already active.', 'ACCOUNT_ALREADY_ACTIVE');
    }
    if (account.account_status !== 'PENDING_ACTIVATION') {
      throw new AppError(409, 'This tenant account cannot be activated.', 'ACCOUNT_ACTIVATION_NOT_PENDING');
    }

    const invitation = await createActivationInvitation(
      client,
      account.user_id,
      managerId,
      'MANAGER_RESEND'
    );
    return { account, invitation };
  });

  let emailSent = false;
  try {
    emailSent = await deliverActivationInvitation({
      userId: account.user_id,
      actorUserId: managerId,
      tenantName: account.tenant_name,
      email: account.email,
      username: account.username,
      invitation,
      source: 'MANAGER_RESEND'
    });
  } catch (error) {
    logger.error({
      tenantId,
      userId: account.user_id,
      error
    }, 'Failed to resend tenant activation email');
  }

  return { emailSent, expiresAt: invitation.expiresAt };
};
