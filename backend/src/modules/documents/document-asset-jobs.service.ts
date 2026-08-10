import type { PoolClient } from 'pg';
import { env } from '../../config/env';
import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import {
  deleteCloudinaryUpload,
  getCloudinaryResource,
  isCloudinaryConfigured,
  listCloudinaryResources,
  migrateCloudinaryUploadToAuthenticated,
  resolveCloudinaryAsset,
  type CloudinaryAssetMetadata,
  type CloudinaryDeliveryType,
  type UploadResourceType
} from '../uploads/uploads.service';
import type { DocumentKind } from './document-assets.service';
import { processDueTenantAnonymization } from '../tenants/tenant-privacy.service';
import { logger } from '../../shared/services/logger.service';

type AssetJobAction = 'DELETE' | 'MIGRATE_AUTHENTICATED';
type AssetJobStatus = 'PENDING' | 'PROCESSING' | 'RETRY' | 'COMPLETED' | 'FAILED';

interface AssetJobRow {
  id: string;
  action: AssetJobAction;
  source_kind: DocumentKind | null;
  source_id: string | null;
  public_id: string;
  resource_type: UploadResourceType;
  delivery_type: CloudinaryDeliveryType;
  asset_version: number | string | null;
  asset_format: string | null;
  attempts: number;
  status: AssetJobStatus;
}

const assetJobColumns = `id, action, source_kind, source_id, public_id, resource_type,
  delivery_type, asset_version, asset_format, attempts, status, reason, last_error_code,
  next_attempt_at, completed_at, created_at, updated_at`;

interface StoredAssetRow extends CloudinaryAssetMetadata {
  id: string;
  doc_type?: string | null;
  tenant_id?: string | null;
}

const sourceConfig: Record<DocumentKind, { table: string; contextDays: number }> = {
  TENANT_DOCUMENT: { table: 'tenant_document', contextDays: env.TENANT_DOCUMENT_RETENTION_DAYS },
  PAYMENT_PROOF: { table: 'payment_proof', contextDays: env.PAYMENT_PROOF_RETENTION_DAYS },
  UTILITY_EVIDENCE: { table: 'utility_reading_evidence', contextDays: env.UTILITY_EVIDENCE_RETENTION_DAYS },
  CONTRACT_DOCUMENT: { table: 'contract_document', contextDays: env.CONTRACT_DOCUMENT_RETENTION_DAYS }
};

const assetProjection = `
  id,
  file_url,
  cloudinary_asset_id AS asset_id,
  cloudinary_public_id AS public_id,
  cloudinary_resource_type AS resource_type,
  cloudinary_version AS version,
  cloudinary_format AS format,
  cloudinary_delivery_type AS delivery_type
`;

const getErrorCode = (error: unknown): string => (
  error instanceof AppError ? error.code : 'DOCUMENT_ASSET_JOB_FAILED'
);

const nextRetryDate = (attempts: number): Date => {
  const delayMinutes = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
  return new Date(Date.now() + delayMinutes * 60_000);
};

export const enqueueCloudinaryAssetJob = async (
  client: Pick<PoolClient, 'query'>,
  action: AssetJobAction,
  sourceKind: DocumentKind | null,
  sourceId: string | null,
  metadata: CloudinaryAssetMetadata,
  reason: string
): Promise<void> => {
  const asset = resolveCloudinaryAsset(metadata);
  await client.query(
    `INSERT INTO cloudinary_asset_job(
       action, source_kind, source_id, public_id, resource_type, delivery_type,
       asset_version, asset_format, reason
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT DO NOTHING`,
    [
      action,
      sourceKind,
      sourceId,
      asset.publicId,
      asset.resourceType,
      asset.deliveryType,
      asset.version,
      asset.format,
      reason.slice(0, 80)
    ]
  );
};

export const enqueueCloudinaryDeletion = async (
  client: Pick<PoolClient, 'query'>,
  sourceKind: DocumentKind,
  row: StoredAssetRow,
  reason: string
): Promise<void> => {
  const storageRow = row as StoredAssetRow & Record<string, unknown>;
  await enqueueCloudinaryAssetJob(client, 'DELETE', sourceKind, row.id, {
    file_url: row.file_url,
    asset_id: row.asset_id ?? storageRow.cloudinary_asset_id as string | null | undefined,
    public_id: row.public_id ?? storageRow.cloudinary_public_id as string | null | undefined,
    resource_type: row.resource_type ?? storageRow.cloudinary_resource_type as UploadResourceType | null | undefined,
    version: row.version ?? storageRow.cloudinary_version as number | string | null | undefined,
    format: row.format ?? storageRow.cloudinary_format as string | null | undefined,
    delivery_type: row.delivery_type ?? storageRow.cloudinary_delivery_type as CloudinaryDeliveryType | null | undefined
  }, reason);
};

const claimNextJob = async (): Promise<AssetJobRow | null> => (
  withTransaction(async (client) => {
    const result = await client.query<AssetJobRow>(
      `SELECT ${assetJobColumns}
       FROM cloudinary_asset_job
       WHERE status IN ('PENDING','RETRY') AND next_attempt_at <= now()
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    const job = result.rows[0];
    if (!job) return null;
    await client.query(
      `UPDATE cloudinary_asset_job
       SET status='PROCESSING', attempts=attempts+1, updated_at=now()
       WHERE id=$1`,
      [job.id]
    );
    return { ...job, attempts: job.attempts + 1, status: 'PROCESSING' as const };
  })
);

const updateSourceAfterMigration = async (
  job: AssetJobRow,
  resource: {
    asset_id?: string;
    public_id: string;
    resource_type: UploadResourceType;
    type: CloudinaryDeliveryType;
    version?: number;
    format?: string;
  }
): Promise<void> => {
  if (!job.source_kind || !job.source_id) return;
  const table = sourceConfig[job.source_kind].table;
  await query(
    `UPDATE ${table}
     SET cloudinary_asset_id=$1,
         cloudinary_public_id=$2,
         cloudinary_resource_type=$3,
         cloudinary_version=$4,
         cloudinary_format=COALESCE($5, cloudinary_format),
         cloudinary_delivery_type='authenticated',
         file_url=NULL
     WHERE id=$6`,
    [
      resource.asset_id ?? null,
      resource.public_id,
      resource.resource_type,
      resource.version ?? null,
      resource.format ?? null,
      job.source_id
    ]
  );
};

const runJob = async (job: AssetJobRow): Promise<void> => {
  const metadata: CloudinaryAssetMetadata = {
    public_id: job.public_id,
    resource_type: job.resource_type,
    version: job.asset_version,
    format: job.asset_format,
    delivery_type: job.delivery_type
  };

  if (job.action === 'DELETE') {
    await deleteCloudinaryUpload(metadata);
    return;
  }

  try {
    const migrated = await migrateCloudinaryUploadToAuthenticated(metadata);
    await updateSourceAfterMigration(job, migrated);
  } catch (error) {
    const authenticated = await getCloudinaryResource(job.public_id, job.resource_type, 'authenticated');
    if (!authenticated) throw error;
    await updateSourceAfterMigration(job, authenticated);
  }
};

export const processCloudinaryAssetJobs = async (limit = 25): Promise<number> => {
  if (!isCloudinaryConfigured()) return 0;
  let processed = 0;

  while (processed < limit) {
    const job = await claimNextJob();
    if (!job) break;

    try {
      await runJob(job);
      await query(
        `UPDATE cloudinary_asset_job
         SET status='COMPLETED', completed_at=now(), updated_at=now(), last_error_code=NULL
         WHERE id=$1`,
        [job.id]
      );
    } catch (error) {
      const failed = job.attempts >= env.DOCUMENT_JOB_MAX_ATTEMPTS;
      await query(
        `UPDATE cloudinary_asset_job
         SET status=$2,
             next_attempt_at=$3,
             last_error_code=$4,
             updated_at=now()
         WHERE id=$1`,
        [
          job.id,
          failed ? 'FAILED' : 'RETRY',
          nextRetryDate(job.attempts),
          getErrorCode(error)
        ]
      );
    }
    processed += 1;
  }
  return processed;
};

export const processExpiredDocumentRetention = async (limitPerKind = 25): Promise<number> => {
  let deleted = 0;
  for (const [kind, config] of Object.entries(sourceConfig) as Array<[DocumentKind, typeof sourceConfig[DocumentKind]]>) {
    deleted += await withTransaction(async (client) => {
      const contractRetentionGuard = kind === 'CONTRACT_DOCUMENT'
        ? `AND EXISTS (
             SELECT 1
             FROM contract retention_contract
             WHERE retention_contract.id=source.contract_id
               AND retention_contract.status IN ('ENDED','CANCELLED')
               AND COALESCE(
                 retention_contract.end_date::timestamptz,
                 retention_contract.move_out_date::timestamptz,
                 retention_contract.updated_at
               ) + make_interval(days => $2::int) <= now()
           )`
        : '';
      const result = await client.query<StoredAssetRow>(
        `SELECT ${assetProjection}${kind === 'TENANT_DOCUMENT' ? ', tenant_id, doc_type' : ''}
         FROM ${config.table} source
         WHERE retention_until IS NOT NULL AND retention_until <= now()
         ${contractRetentionGuard}
         ORDER BY retention_until
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        kind === 'CONTRACT_DOCUMENT'
          ? [limitPerKind, config.contextDays]
          : [limitPerKind]
      );

      for (const row of result.rows) {
        try {
          await enqueueCloudinaryDeletion(client, kind, row, 'RETENTION_EXPIRED');
        } catch (error) {
          if (!(error instanceof AppError && error.code === 'CLOUDINARY_ASSET_METADATA_MISSING')) throw error;
        }
        if (
          kind === 'TENANT_DOCUMENT'
          && ['IDENTITY_FRONT', 'IDENTITY_BACK'].includes(row.doc_type ?? '')
        ) {
          await writeAuditLog(client, {
            actorUserId: null,
            action: 'TENANT_IDENTITY_DOCUMENT_DELETED_BY_RETENTION',
            entityType: 'tenant_document',
            entityId: row.id,
            metadata: { tenantId: row.tenant_id, documentType: row.doc_type }
          });
        }
      }
      const preservedKinds: DocumentKind[] = ['PAYMENT_PROOF', 'CONTRACT_DOCUMENT'];
      if (result.rows.length > 0 && preservedKinds.includes(kind)) {
        await client.query(
          `UPDATE ${config.table}
           SET file_url=NULL,
               cloudinary_asset_id=NULL,
               cloudinary_public_id=NULL,
               cloudinary_resource_type=NULL,
               cloudinary_version=NULL,
               cloudinary_format=NULL,
               cloudinary_delivery_type=NULL,
               retention_until=NULL,
               asset_purged_at=now()
           WHERE id = ANY($1::uuid[])`,
          [result.rows.map((row) => row.id)]
        );
      } else if (result.rows.length > 0) {
        await client.query(
          `DELETE FROM ${config.table} WHERE id = ANY($1::uuid[])`,
          [result.rows.map((row) => row.id)]
        );
      }
      return result.rows.length;
    });
  }
  return deleted;
};

const loadDatabaseAssets = async (): Promise<Array<StoredAssetRow & { source_kind: DocumentKind }>> => {
  const selects = (Object.entries(sourceConfig) as Array<[DocumentKind, typeof sourceConfig[DocumentKind]]>)
    .map(([kind, config]) => (
      `SELECT ${assetProjection}, '${kind}'::text AS source_kind
       FROM ${config.table}
       WHERE cloudinary_public_id IS NOT NULL OR file_url IS NOT NULL`
    ));
  return (await query<StoredAssetRow & { source_kind: DocumentKind }>(selects.join(' UNION ALL '))).rows;
};

const recordIssue = async (
  issueType: 'ORPHAN_CLOUDINARY_ASSET' | 'ORPHAN_DATABASE_RECORD' | 'LEGACY_PUBLIC_ASSET',
  data: {
    sourceKind?: DocumentKind;
    sourceId?: string;
    publicId?: string;
    resourceType?: UploadResourceType;
    deliveryType?: CloudinaryDeliveryType;
  }
): Promise<void> => {
  const params = [
    issueType,
    data.sourceKind ?? null,
    data.sourceId ?? null,
    data.publicId ?? null,
    data.resourceType ?? null,
    data.deliveryType ?? null
  ];
  const existing = await query<{ id: string }>(
    `UPDATE cloudinary_orphan_issue
     SET last_detected_at=now()
     WHERE issue_type=$1
       AND source_kind IS NOT DISTINCT FROM $2
       AND source_id IS NOT DISTINCT FROM $3
       AND public_id IS NOT DISTINCT FROM $4
       AND resource_type IS NOT DISTINCT FROM $5
       AND delivery_type IS NOT DISTINCT FROM $6
       AND status='OPEN'
     RETURNING id`,
    params
  );
  if (existing.rows[0]) return;

  await query(
    `INSERT INTO cloudinary_orphan_issue(
       issue_type, source_kind, source_id, public_id, resource_type, delivery_type
     )
     VALUES($1,$2,$3,$4,$5,$6)`,
    params
  );
};

export const reconcileDocumentAssets = async (): Promise<{
  databaseOrphans: number;
  cloudinaryOrphans: number;
  legacyAssets: number;
}> => {
  if (!isCloudinaryConfigured()) return { databaseOrphans: 0, cloudinaryOrphans: 0, legacyAssets: 0 };
  const scanStartedAt = new Date();
  const databaseRows = await loadDatabaseAssets();
  const cloudinaryResources = (
    await Promise.all(
      (['image', 'raw'] as UploadResourceType[]).flatMap((resourceType) => (
        (['upload', 'authenticated'] as CloudinaryDeliveryType[]).map((deliveryType) => (
          listCloudinaryResources(resourceType, deliveryType, env.CLOUDINARY_UPLOAD_ROOT_FOLDER)
        ))
      ))
    )
  ).flat();
  const cloudinaryKeys = new Set(cloudinaryResources.map((asset) => (
    `${asset.resource_type}:${asset.type}:${asset.public_id}`
  )));
  const databaseKeys = new Set<string>();
  let databaseOrphans = 0;
  let legacyAssets = 0;

  for (const row of databaseRows) {
    let asset;
    try {
      asset = resolveCloudinaryAsset(row);
    } catch {
      databaseOrphans += 1;
      await recordIssue('ORPHAN_DATABASE_RECORD', {
        sourceKind: row.source_kind,
        sourceId: row.id
      });
      continue;
    }

    const key = `${asset.resourceType}:${asset.deliveryType}:${asset.publicId}`;
    databaseKeys.add(key);
    if (!cloudinaryKeys.has(key)) {
      databaseOrphans += 1;
      await recordIssue('ORPHAN_DATABASE_RECORD', {
        sourceKind: row.source_kind,
        sourceId: row.id,
        publicId: asset.publicId,
        resourceType: asset.resourceType,
        deliveryType: asset.deliveryType
      });
    }
    if (asset.deliveryType !== 'authenticated') {
      legacyAssets += 1;
      await recordIssue('LEGACY_PUBLIC_ASSET', {
        sourceKind: row.source_kind,
        sourceId: row.id,
        publicId: asset.publicId,
        resourceType: asset.resourceType,
        deliveryType: asset.deliveryType
      });
      await withTransaction(async (client) => {
        await enqueueCloudinaryAssetJob(
          client,
          'MIGRATE_AUTHENTICATED',
          row.source_kind,
          row.id,
          row,
          'RECONCILIATION_LEGACY_ASSET'
        );
      });
    }
  }

  let cloudinaryOrphans = 0;
  for (const asset of cloudinaryResources) {
    const key = `${asset.resource_type}:${asset.type}:${asset.public_id}`;
    if (databaseKeys.has(key)) continue;
    cloudinaryOrphans += 1;
    await recordIssue('ORPHAN_CLOUDINARY_ASSET', {
      publicId: asset.public_id,
      resourceType: asset.resource_type,
      deliveryType: asset.type
    });
  }

  await query(
    `UPDATE cloudinary_orphan_issue
     SET status='RESOLVED', resolved_at=now()
     WHERE status='OPEN' AND last_detected_at < $1`,
    [scanStartedAt]
  );

  return { databaseOrphans, cloudinaryOrphans, legacyAssets };
};

let scheduler: NodeJS.Timeout | null = null;
let reconciliationScheduler: NodeJS.Timeout | null = null;
let running = false;

const runMaintenance = async (): Promise<void> => {
  if (running) return;
  running = true;
  try {
    await processDueTenantAnonymization();
    await processExpiredDocumentRetention();
    await processCloudinaryAssetJobs();
  } catch (error) {
    logger.error({ code: getErrorCode(error) }, 'Document asset maintenance failed');
  } finally {
    running = false;
  }
};

const runReconciliation = async (): Promise<void> => {
  try {
    await reconcileDocumentAssets();
  } catch (error) {
    logger.error({ code: getErrorCode(error) }, 'Document asset reconciliation failed');
  }
};

export const startDocumentAssetScheduler = (): void => {
  if (scheduler) return;
  void runMaintenance();
  void runReconciliation();
  scheduler = setInterval(
    () => void runMaintenance(),
    env.DOCUMENT_JOB_INTERVAL_MINUTES * 60_000
  );
  scheduler.unref();

  reconciliationScheduler = setInterval(
    () => void runReconciliation(),
    env.DOCUMENT_RECONCILIATION_INTERVAL_HOURS * 60 * 60_000
  );
  reconciliationScheduler.unref();
};

export const stopDocumentAssetScheduler = (): void => {
  if (scheduler) clearInterval(scheduler);
  if (reconciliationScheduler) clearInterval(reconciliationScheduler);
  scheduler = null;
  reconciliationScheduler = null;
};
