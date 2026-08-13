import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';

export const FEATURE_KEYS = [
  'CSV_IMPORTS',
  'BULK_BILLING_ACTIONS',
  'LIVE_DASHBOARD',
  'INVOICE_BRANDING'
] as const;
export type FeatureKey = typeof FEATURE_KEYS[number];
export type FeatureFlagMap = Record<FeatureKey, boolean>;

const defaults: FeatureFlagMap = {
  CSV_IMPORTS: true,
  BULK_BILLING_ACTIONS: true,
  LIVE_DASHBOARD: true,
  INVOICE_BRANDING: true
};

interface FeatureFlagRow { feature_key: FeatureKey; enabled: boolean }

export const listFeatureFlags = async (managerUserId: string): Promise<FeatureFlagMap> => {
  const result = await query<FeatureFlagRow>(
    `SELECT feature_key, enabled FROM manager_feature_flag WHERE manager_user_id=$1`,
    [managerUserId]
  );
  return result.rows.reduce<FeatureFlagMap>(
    (flags, row) => ({ ...flags, [row.feature_key]: row.enabled }),
    { ...defaults }
  );
};

export const isFeatureEnabled = async (managerUserId: string, key: FeatureKey): Promise<boolean> => {
  const result = await query<{ enabled: boolean }>(
    `SELECT enabled FROM manager_feature_flag WHERE manager_user_id=$1 AND feature_key=$2`,
    [managerUserId, key]
  );
  return result.rows[0]?.enabled ?? defaults[key];
};

export const assertFeatureEnabled = async (managerUserId: string, key: FeatureKey): Promise<void> => {
  if (!await isFeatureEnabled(managerUserId, key)) {
    throw new AppError(403, 'This feature is currently disabled.', 'FEATURE_DISABLED');
  }
};

export const updateFeatureFlag = async (
  managerUserId: string,
  key: FeatureKey,
  enabled: boolean
): Promise<FeatureFlagMap> => {
  await withTransaction(async (client) => {
    const before = await client.query<{ enabled: boolean }>(
      `SELECT enabled FROM manager_feature_flag
       WHERE manager_user_id=$1 AND feature_key=$2 FOR UPDATE`,
      [managerUserId, key]
    );
    await client.query(
      `INSERT INTO manager_feature_flag(manager_user_id, feature_key, enabled, updated_by_user_id)
       VALUES($1,$2,$3,$1)
       ON CONFLICT(manager_user_id, feature_key) DO UPDATE SET
         enabled=EXCLUDED.enabled, updated_by_user_id=EXCLUDED.updated_by_user_id`,
      [managerUserId, key, enabled]
    );
    await writeAuditLog(client, {
      actorUserId: managerUserId,
      action: 'FEATURE_FLAG_UPDATED',
      entityType: 'FEATURE_FLAG',
      entityId: null,
      before: { key, enabled: before.rows[0]?.enabled ?? defaults[key] },
      after: { key, enabled }
    });
  });
  return listFeatureFlags(managerUserId);
};
