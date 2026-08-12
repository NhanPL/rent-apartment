import type { PoolClient } from 'pg';
import {
  getAuditRequestContext,
  type AuditActorRole
} from '../middleware/audit-context';

type AuditClient = Pick<PoolClient, 'query'>;

export const AUDIT_ACTIONS = [
  'ALL_AUTH_SESSIONS_REVOKED',
  'AUTH_LOGIN_BRUTE_FORCE_SUSPECTED',
  'AUTH_SESSION_CREATED',
  'AUTH_SESSION_REVOKED',
  'CONTRACT_ACTIVATED',
  'CONTRACT_CANCELLED',
  'CONTRACT_CREATED',
  'CONTRACT_ENDED',
  'CONTRACT_UPDATED',
  'DATA_IMPORTED',
  'FEATURE_FLAG_UPDATED',
  'INVOICE_CREATED',
  'INVOICE_BRANDING_UPDATED',
  'INVOICE_ISSUED',
  'INVOICE_UPDATED',
  'INVOICE_VOIDED',
  'MANAGER_TWO_FACTOR_DISABLED',
  'MANAGER_TWO_FACTOR_ENABLED',
  'MANAGER_TWO_FACTOR_SETUP_STARTED',
  'PASSWORD_RESET_REQUESTED',
  'PAYMENT_PROOF_APPROVED',
  'PAYMENT_PROOF_REJECTED',
  'PAYMENT_PROOF_SUBMITTED',
  'PAYMENT_REVERSED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'TENANT_ACCOUNT_CREATED',
  'TENANT_ACTIVATION_INVITATION_CREATED',
  'TENANT_ACTIVATION_INVITATION_DELIVERY',
  'TENANT_IDENTITY_DOCUMENT_CREATED',
  'TENANT_IDENTITY_DOCUMENT_DELETED',
  'TENANT_IDENTITY_DOCUMENT_DELETED_BY_RETENTION',
  'TENANT_IDENTITY_DOCUMENT_DOWNLOADED',
  'TENANT_IDENTITY_DOCUMENT_VIEWED',
  'TENANT_PRIVACY_CONSENT_RECORDED',
  'TENANT_PRIVACY_ERASURE_REQUESTED',
  'TENANT_ANONYMIZED',
  'TENANT_DATA_EXPORTED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'USER_PASSWORD_CHANGED',
  'UTILITY_READING_APPROVED',
  'UTILITY_READING_REJECTED',
  'UTILITY_READING_SUBMITTED'
] as const;

export type AuditActionCode = typeof AUDIT_ACTIONS[number];

export interface AuditLogPayload {
  actorUserId: string | null;
  actorRole?: AuditActorRole;
  managerUserId?: string | null;
  action: AuditActionCode;
  entityType: string;
  entityId: string | null;
  metadata?: Record<string, unknown>;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

const sensitiveKeyPattern = /(?:password|token|secret|authorization|cookie|credential|file_url|signed_url|access_url|qr_image_url|public_id|asset_id|identity_number|citizen_id)/i;
const urlPattern = /^https?:\/\//i;
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 2000;

const redactAuditValue = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (typeof value === 'string') {
    if (urlPattern.test(value)) return '[REDACTED_URL]';
    return value.slice(0, MAX_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactAuditValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        sensitiveKeyPattern.test(key) ? '[REDACTED]' : redactAuditValue(nestedValue, depth + 1)
      ])
    );
  }
  return value;
};

const sanitizeObject = (
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> | null => {
  if (!value) return null;
  return redactAuditValue(value) as Record<string, unknown>;
};

export const writeAuditLog = async (client: AuditClient, payload: AuditLogPayload): Promise<void> => {
  const context = getAuditRequestContext();
  let actorRole = payload.actorRole ?? context?.actorRole;
  let managerUserId = payload.managerUserId;

  if (payload.actorUserId && (
    !actorRole
    || actorRole === 'ANONYMOUS'
    || managerUserId === undefined
  )) {
    const actorScope = await client.query<{
      actor_role: AuditActorRole;
      manager_user_id: string | null;
    }>(
      `SELECT app_user.role::text AS actor_role,
              CASE WHEN app_user.role='MANAGER' THEN app_user.id ELSE tenant.manager_user_id END AS manager_user_id
       FROM app_user
       LEFT JOIN tenant ON tenant.user_id=app_user.id
       WHERE app_user.id=$1
       LIMIT 1`,
      [payload.actorUserId]
    );
    actorRole = payload.actorRole ?? actorScope.rows[0]?.actor_role ?? actorRole;
    managerUserId = payload.managerUserId ?? actorScope.rows[0]?.manager_user_id ?? null;
  }

  actorRole ??= payload.actorUserId ? 'SYSTEM' : context?.actorRole ?? 'SYSTEM';
  managerUserId ??= actorRole === 'MANAGER' ? payload.actorUserId : null;

  await client.query(
    `INSERT INTO audit_log(
       actor_user_id,actor_role,manager_user_id,action,entity_type,entity_id,
       request_id,client_ip_hash,user_agent,metadata,before_snapshot,after_snapshot
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb)`,
    [
      payload.actorUserId,
      actorRole,
      managerUserId,
      payload.action,
      payload.entityType.trim().toUpperCase(),
      payload.entityId,
      context?.requestId ?? null,
      context?.clientIpHash ?? null,
      context?.userAgent ?? null,
      JSON.stringify(sanitizeObject(payload.metadata) ?? {}),
      payload.before ? JSON.stringify(sanitizeObject(payload.before)) : null,
      payload.after ? JSON.stringify(sanitizeObject(payload.after)) : null
    ]
  );
};
