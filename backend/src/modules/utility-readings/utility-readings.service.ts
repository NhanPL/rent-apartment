import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { firstDayOfMonth } from '../../shared/utils/date';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { enqueueUtilityReadingRejected } from '../../shared/services/notification.service';
import {
  getDocumentRetentionUntil,
  resolveCloudinaryAsset,
  type CloudinaryDeliveryType,
  type UploadResourceType
} from '../uploads/uploads.service';
import type {
  DatabaseDate,
  DatabaseNumeric,
  DatabaseTimestamp,
  UtilityReadingStatus
} from '../../shared/types/database';
import {
  paginationOffset,
  sqlSortDirection,
  type PaginatedResult,
  type PaginationParams
} from '../../shared/utils/pagination';

interface UtilityReadingBoundaryRow {
  id: string;
  room_id: string;
  month: DatabaseDate;
  electricity_prev: DatabaseNumeric | null;
  electricity_curr: DatabaseNumeric | null;
  water_prev: DatabaseNumeric | null;
  water_curr: DatabaseNumeric | null;
  electricity_meter_reset: boolean;
  water_meter_reset: boolean;
  meter_reset_note: string | null;
  status: UtilityReadingStatus;
  rejection_reason: string | null;
  note: string | null;
  manager_note: string | null;
  reported_by_user_id: string | null;
  reported_at: DatabaseTimestamp | null;
  submitted_at: DatabaseTimestamp | null;
  verified_by_user_id: string | null;
  verified_at: DatabaseTimestamp | null;
  approved_by_user_id: string | null;
  approved_at: DatabaseTimestamp | null;
  rejected_by_user_id: string | null;
  rejected_at: DatabaseTimestamp | null;
  contract_id: string;
  tenant_user_id: string;
  room_code: string;
  building_id: string;
  building_name: string;
  tenant_id: string | null;
  tenant_name: string | null;
  evidence_count: number;
  invoice_id: string | null;
  [column: string]: unknown;
}
type DbRow = UtilityReadingBoundaryRow;

interface UtilityEvidenceRow {
  id: string;
  utility_reading_id: string;
  evidence_type: 'ELECTRIC' | 'WATER' | 'OTHER';
  file_name: string | null;
  file_url: string | null;
  mime_type: string | null;
  file_size: string | number | null;
  uploaded_by_user_id: string | null;
  uploaded_at: DatabaseTimestamp;
  note: string | null;
  cloudinary_asset_id: string | null;
  cloudinary_public_id: string;
  cloudinary_resource_type: string;
  cloudinary_version: number | null;
  cloudinary_format: string | null;
  cloudinary_delivery_type: string;
  retention_until: DatabaseTimestamp | null;
  created_at: DatabaseTimestamp;
}

const readingColumnNames = [
  'id', 'room_id', 'month', 'electricity_prev', 'electricity_curr', 'water_prev', 'water_curr',
  'electricity_meter_reset', 'water_meter_reset', 'meter_reset_note',
  'status', 'reported_by_user_id', 'reported_at', 'submitted_at', 'verified_by_user_id',
  'verified_at', 'approved_by_user_id', 'approved_at', 'rejected_by_user_id', 'rejected_at',
  'rejection_reason', 'manager_note', 'note', 'created_at', 'updated_at'
] as const;
const readingColumns = (alias?: string) => readingColumnNames
  .map((column) => alias ? `${alias}.${column}` : column)
  .join(', ');
const evidenceColumnNames = [
  'id', 'utility_reading_id', 'evidence_type', 'file_name', 'file_url', 'mime_type',
  'file_size', 'uploaded_by_user_id', 'uploaded_at', 'note', 'cloudinary_asset_id',
  'cloudinary_public_id', 'cloudinary_resource_type', 'cloudinary_version',
  'cloudinary_format', 'cloudinary_delivery_type', 'retention_until', 'created_at'
] as const;
const evidenceColumns = evidenceColumnNames.join(', ');
type AuthScope = { userId: string; role: 'MANAGER' | 'TENANT' };
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];

const utilityAuditSnapshot = (reading: DbRow): Record<string, unknown> => ({
  roomId: reading.room_id,
  month: reading.month,
  status: reading.status,
  electricityPrevious: reading.electricity_prev,
  electricityCurrent: reading.electricity_curr,
  waterPrevious: reading.water_prev,
  waterCurrent: reading.water_curr,
  electricityMeterReset: reading.electricity_meter_reset,
  waterMeterReset: reading.water_meter_reset,
  meterResetNote: reading.meter_reset_note,
  rejectionReason: reading.rejection_reason,
  note: reading.note
});

export type UtilityReadingSortBy =
  | 'month'
  | 'createdAt'
  | 'submittedAt'
  | 'status'
  | 'building'
  | 'room'
  | 'tenant';

export interface UtilityReadingListParams extends PaginationParams<UtilityReadingSortBy> {
  search?: string;
  buildingId?: string;
  roomId?: string;
  month?: string;
  status?: string;
}

export interface UtilityReadingCreatePayload {
  room_id: string;
  month?: string | null;
  electricity_curr: number;
  water_curr: number;
  electricity_meter_reset?: boolean;
  water_meter_reset?: boolean;
  meter_reset_note?: string | null;
  note?: string | null;
  evidence?: {
    electricity: UtilityEvidenceFilePayload;
    water: UtilityEvidenceFilePayload;
  };
}

interface UtilityEvidenceFilePayload {
  file_name?: string | null;
  file_url: string;
  mime_type: string;
  file_size: number;
  resource_type?: UploadResourceType;
  public_id?: string;
  asset_id?: string;
  version?: number;
  format?: string;
  delivery_type?: CloudinaryDeliveryType;
}

export interface UtilityEvidencePayload {
  evidence_type: 'ELECTRIC' | 'WATER' | 'OTHER';
  file_name?: string | null;
  file_url: string;
  mime_type: string;
  file_size: number;
  resource_type?: UploadResourceType;
  public_id?: string;
  asset_id?: string;
  version?: number;
  format?: string;
  delivery_type?: CloudinaryDeliveryType;
  note?: string | null;
}

const readingProjection = `
  ${readingColumns('ur')},
  r.code AS room_code,
  r.building_id,
  b.name AS building_name,
  tenant.id AS tenant_id,
  tenant.full_name AS tenant_name,
  COALESCE(evidence.evidence_count, 0)::int AS evidence_count
`;

const readingJoins = `
  JOIN room r ON r.id=ur.room_id
  JOIN building b ON b.id=r.building_id
  LEFT JOIN LATERAL (
    SELECT t.id, t.full_name
    FROM contract c
    JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
    JOIN tenant t ON t.id=ct.tenant_id
    WHERE c.room_id=ur.room_id AND c.status='ACTIVE'
    ORDER BY ct.is_primary DESC, ct.joined_at DESC
    LIMIT 1
  ) tenant ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS evidence_count
    FROM utility_reading_evidence ure
    WHERE ure.utility_reading_id=ur.id
  ) evidence ON true
`;

const getScopedReadingForManager = async (client: TxClient, readingId: string, managerId: string) => {
  const { rows } = await client.query<DbRow>(
    `SELECT ${readingColumns('ur')}
     FROM utility_reading ur
     JOIN room r ON r.id=ur.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ur.id=$1 AND b.manager_user_id=$2
     FOR UPDATE OF ur`,
    [readingId, managerId]
  );

  const reading = rows[0];
  if (!reading) throw new AppError(404, 'Utility reading not found', 'UTILITY_READING_NOT_FOUND');
  return reading;
};

export const getUtilityReadingById = async (
  id: string,
  scope: AuthScope
): Promise<DbRow & { evidence: UtilityEvidenceRow[] }> => {
  const readingResult = scope.role === 'MANAGER'
    ? await query<DbRow>(
      `SELECT ${readingProjection}
       FROM utility_reading ur
       ${readingJoins}
       WHERE ur.id=$1 AND b.manager_user_id=$2`,
      [id, scope.userId]
    )
    : await query<DbRow>(
      `SELECT DISTINCT ${readingProjection}
       FROM utility_reading ur
       ${readingJoins}
       WHERE ur.id=$1
         AND EXISTS (
           SELECT 1
           FROM contract c_scope
           JOIN contract_tenant ct_scope ON ct_scope.contract_id=c_scope.id AND ct_scope.left_at IS NULL
           JOIN tenant t_scope ON t_scope.id=ct_scope.tenant_id
           WHERE c_scope.room_id=ur.room_id AND c_scope.status='ACTIVE' AND t_scope.user_id=$2
         )`,
      [id, scope.userId]
    );

  const reading = readingResult.rows[0];
  if (!reading) throw new AppError(404, 'Utility reading not found', 'UTILITY_READING_NOT_FOUND');

  const evidence = await query<UtilityEvidenceRow>(
    `SELECT ${evidenceColumns}
     FROM utility_reading_evidence
     WHERE utility_reading_id=$1
     ORDER BY uploaded_at DESC, created_at DESC`,
    [id]
  );

  return { ...reading, evidence: evidence.rows };
};

const utilityReadingSortColumns: Record<UtilityReadingSortBy, string> = {
  month: 'ur.month',
  createdAt: 'ur.created_at',
  submittedAt: 'ur.submitted_at',
  status: 'ur.status',
  building: 'b.name',
  room: 'r.code',
  tenant: 'tenant.full_name'
};

export const listUtilityReadings = async (
  scope: AuthScope,
  filters: UtilityReadingListParams
): Promise<PaginatedResult<DbRow>> => {
  const params: unknown[] = [scope.userId];
  const conditions = scope.role === 'MANAGER'
    ? ['b.manager_user_id=$1']
    : [`EXISTS (
         SELECT 1
         FROM contract c_scope
         JOIN contract_tenant ct_scope ON ct_scope.contract_id=c_scope.id AND ct_scope.left_at IS NULL
         JOIN tenant t_scope ON t_scope.id=ct_scope.tenant_id
         WHERE c_scope.room_id=ur.room_id AND c_scope.status='ACTIVE' AND t_scope.user_id=$1
       )`];

  const addCondition = (sql: string, value: unknown) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.search) {
    addCondition(`(
      b.name ILIKE '%' || ? || '%'
      OR r.code ILIKE '%' || ? || '%'
      OR COALESCE(tenant.full_name, '') ILIKE '%' || ? || '%'
    )`, filters.search);
    const searchParameter = `$${params.length}`;
    conditions[conditions.length - 1] = conditions[conditions.length - 1].split('?').join(searchParameter);
  }

  if (filters.buildingId && scope.role === 'MANAGER') {
    addCondition('b.id=?', filters.buildingId);
  }
  if (filters.roomId) {
    addCondition('ur.room_id=?', filters.roomId);
  }
  if (filters.month) {
    addCondition('ur.month=?', firstDayOfMonth(filters.month));
  }
  if (filters.status) {
    addCondition('ur.status=?', filters.status);
  }

  const where = conditions.join(' AND ');
  const countParams = [...params];
  const itemParams = [...params, filters.pageSize, paginationOffset(filters)];
  const sortColumn = utilityReadingSortColumns[filters.sortBy];
  const direction = sqlSortDirection(filters.sortOrder);
  const [countResult, itemResult] = await Promise.all([
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM utility_reading ur
       ${readingJoins}
       WHERE ${where}`,
      countParams
    ),
    query<DbRow>(
      `SELECT ${readingProjection}
       FROM utility_reading ur
       ${readingJoins}
       WHERE ${where}
       ORDER BY ${sortColumn} ${direction} NULLS LAST, ur.created_at DESC, ur.id
       LIMIT $${itemParams.length - 1} OFFSET $${itemParams.length}`,
      itemParams
    )
  ]);

  return {
    total: countResult.rows[0]?.total ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    items: itemResult.rows
  };
};

export const createUtilityReading = async (payload: UtilityReadingCreatePayload, userId: string) => {
  const month = firstDayOfMonth(payload.month ?? undefined);
  return withTransaction(async (client) => {
    const roomContract = await client.query<{ id: string }>(
      `SELECT c.id
       FROM contract c
       JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE c.room_id=$1 AND c.status='ACTIVE' AND t.user_id=$2
       LIMIT 1
       FOR UPDATE OF c`,
      [payload.room_id, userId]
    );
    if (!roomContract.rows[0]) throw new AppError(403, 'Tenant is not active in this room', 'TENANT_ROOM_FORBIDDEN');

    const prev = await client.query<DbRow>(
      `SELECT electricity_curr, water_curr
       FROM utility_reading
       WHERE room_id=$1 AND month < $2 AND status IN ('APPROVED','INVOICED')
       ORDER BY month DESC
       LIMIT 1`,
      [payload.room_id, month]
    );
    const electricityPrev = Number(prev.rows[0]?.electricity_curr ?? 0);
    const waterPrev = Number(prev.rows[0]?.water_curr ?? 0);
    const electricityMeterReset = payload.electricity_meter_reset ?? false;
    const waterMeterReset = payload.water_meter_reset ?? false;
    const meterResetNote = payload.meter_reset_note?.trim() || null;

    if (
      (Number(payload.electricity_curr) < electricityPrev && !electricityMeterReset)
      || (Number(payload.water_curr) < waterPrev && !waterMeterReset)
    ) {
      throw new AppError(
        400,
        'A reading can be lower than the previous month only when that meter was reset.',
        'UTILITY_METER_READING_DECREASED'
      );
    }
    if ((electricityMeterReset || waterMeterReset) && !meterResetNote) {
      throw new AppError(400, 'A meter reset reason is required.', 'METER_RESET_NOTE_REQUIRED');
    }

    const existing = await client.query<DbRow>(
      `SELECT ${readingColumns()} FROM utility_reading WHERE room_id=$1 AND month=$2 FOR UPDATE`,
      [payload.room_id, month]
    );

    let reading: DbRow;
    const before = existing.rows[0] ? utilityAuditSnapshot(existing.rows[0]) : null;
    if (existing.rows[0]) {
      if (existing.rows[0].status !== 'REJECTED') {
        throw new AppError(409, 'Submitted readings can only be updated after manager rejection', 'UTILITY_READING_LOCKED');
      }

      const updated = await client.query<DbRow>(
        `UPDATE utility_reading
         SET electricity_prev=$1,
             electricity_curr=$2,
             water_prev=$3,
             water_curr=$4,
             electricity_meter_reset=$5,
             water_meter_reset=$6,
             meter_reset_note=$7,
             status='SUBMITTED',
             reported_by_user_id=$8,
             reported_at=now(),
             submitted_at=now(),
             rejected_by_user_id=NULL,
             rejected_at=NULL,
             rejection_reason=NULL,
             note=$9
         WHERE id=$10
         RETURNING ${readingColumns()}`,
        [
          electricityPrev,
          payload.electricity_curr,
          waterPrev,
          payload.water_curr,
          electricityMeterReset,
          waterMeterReset,
          meterResetNote,
          userId,
          payload.note ?? null,
          existing.rows[0].id
        ]
      );
      reading = updated.rows[0];
    } else {
      const created = await client.query<DbRow>(
        `INSERT INTO utility_reading(
           room_id, month, electricity_prev, electricity_curr, water_prev, water_curr,
           electricity_meter_reset, water_meter_reset, meter_reset_note,
           status, reported_by_user_id, reported_at, submitted_at, note
         )
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUBMITTED',$10,now(),now(),$11)
         RETURNING ${readingColumns()}`,
        [
          payload.room_id,
          month,
          electricityPrev,
          payload.electricity_curr,
          waterPrev,
          payload.water_curr,
          electricityMeterReset,
          waterMeterReset,
          meterResetNote,
          userId,
          payload.note ?? null
        ]
      );
      reading = created.rows[0];
    }

    if (payload.evidence) {
      const electricityAsset = resolveCloudinaryAsset(payload.evidence.electricity);
      const waterAsset = resolveCloudinaryAsset(payload.evidence.water);
      await client.query(
        `INSERT INTO utility_reading_evidence(
           utility_reading_id,evidence_type,file_name,file_url,mime_type,file_size,uploaded_by_user_id,
           cloudinary_asset_id,cloudinary_public_id,cloudinary_resource_type,
           cloudinary_version,cloudinary_format,cloudinary_delivery_type,retention_until
         )
         VALUES
           ($1,'ELECTRIC',$2,$3,$4,$5,$10,$11,$12,$13,$14,$15,$16,$17),
           ($1,'WATER',$6,$7,$8,$9,$10,$18,$19,$20,$21,$22,$23,$17)`,
        [
          reading.id,
          payload.evidence.electricity.file_name ?? null,
          null,
          payload.evidence.electricity.mime_type,
          payload.evidence.electricity.file_size,
          payload.evidence.water.file_name ?? null,
          null,
          payload.evidence.water.mime_type,
          payload.evidence.water.file_size,
          userId,
          electricityAsset.assetId,
          electricityAsset.publicId,
          electricityAsset.resourceType,
          electricityAsset.version,
          electricityAsset.format,
          electricityAsset.deliveryType,
          getDocumentRetentionUntil('UTILITY_EVIDENCE'),
          waterAsset.assetId,
          waterAsset.publicId,
          waterAsset.resourceType,
          waterAsset.version,
          waterAsset.format,
          waterAsset.deliveryType
        ]
      );
    }

    await writeAuditLog(client, {
      actorUserId: userId,
      action: 'UTILITY_READING_SUBMITTED',
      entityType: 'UTILITY_READING',
      entityId: reading.id,
      before,
      after: utilityAuditSnapshot(reading),
      metadata: { resubmission: Boolean(existing.rows[0]) }
    });

    return reading;
  });
};

export const approveUtilityReading = async (id: string, managerId: string) => {
  await withTransaction(async (client) => {
    const reading = await getScopedReadingForManager(client, id, managerId);
    if (reading.status !== 'SUBMITTED') {
      throw new AppError(409, 'Only submitted readings can be approved', 'UTILITY_READING_NOT_SUBMITTED');
    }

    const updated = await client.query<DbRow>(
      `UPDATE utility_reading
       SET status='APPROVED',
           approved_by_user_id=$2,
           approved_at=now(),
           verified_by_user_id=$2,
           verified_at=now(),
           rejected_by_user_id=NULL,
           rejected_at=NULL,
           rejection_reason=NULL
       WHERE id=$1
         RETURNING ${readingColumns()}`,
      [id, managerId]
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'UTILITY_READING_APPROVED',
      entityType: 'UTILITY_READING',
      entityId: id,
      before: utilityAuditSnapshot(reading),
      after: utilityAuditSnapshot(updated.rows[0])
    });
  });

  return getUtilityReadingById(id, { userId: managerId, role: 'MANAGER' });
};

export const rejectUtilityReading = async (id: string, managerId: string, reason: string) => {
  await withTransaction(async (client) => {
    const reading = await getScopedReadingForManager(client, id, managerId);
    if (reading.status !== 'SUBMITTED') {
      throw new AppError(409, 'Only submitted readings can be rejected', 'UTILITY_READING_NOT_SUBMITTED');
    }

    const updated = await client.query<DbRow>(
      `UPDATE utility_reading
       SET status='REJECTED',
           rejected_by_user_id=$2,
           rejected_at=now(),
           rejection_reason=$3
       WHERE id=$1
       RETURNING ${readingColumns()}`,
      [id, managerId, reason]
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'UTILITY_READING_REJECTED',
      entityType: 'UTILITY_READING',
      entityId: id,
      before: utilityAuditSnapshot(reading),
      after: utilityAuditSnapshot(updated.rows[0]),
      metadata: { reason }
    });
    await enqueueUtilityReadingRejected(client, id, reason, String(updated.rows[0].rejected_at));
  });

  return getUtilityReadingById(id, { userId: managerId, role: 'MANAGER' });
};

export const requestUtilityReadingCorrection = async (id: string, managerId: string, reason: string) => {
  await withTransaction(async (client) => {
    const reading = await getScopedReadingForManager(client, id, managerId);
    if (reading.status === 'INVOICED') {
      throw new AppError(409, 'Void the invoice before requesting a reading correction', 'UTILITY_READING_LOCKED');
    }
    if (reading.status !== 'APPROVED') {
      throw new AppError(409, 'Only approved readings can be returned for correction', 'UTILITY_READING_NOT_APPROVED');
    }
    const invoice = await client.query<{ id: string }>(
      `SELECT id FROM invoice WHERE utility_reading_id=$1 AND status<>'VOID' LIMIT 1`,
      [id]
    );
    if (invoice.rows[0]) throw new AppError(409, 'Void the invoice before requesting a reading correction', 'UTILITY_READING_LOCKED');

    const updated = await client.query<DbRow>(
      `UPDATE utility_reading
       SET status='REJECTED', rejected_by_user_id=$2, rejected_at=now(), rejection_reason=$3,
           approved_by_user_id=NULL, approved_at=NULL
       WHERE id=$1
       RETURNING ${readingColumns()}`,
      [id, managerId, reason]
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'UTILITY_READING_REJECTED',
      entityType: 'UTILITY_READING',
      entityId: id,
      before: utilityAuditSnapshot(reading),
      after: utilityAuditSnapshot(updated.rows[0]),
      metadata: { reason, correctionRequested: true }
    });
    await enqueueUtilityReadingRejected(client, id, reason, String(updated.rows[0].rejected_at));
  });
  return getUtilityReadingById(id, { userId: managerId, role: 'MANAGER' });
};

export const attachUtilityReadingEvidence = async (readingId: string, payload: UtilityEvidencePayload, scope: AuthScope) => {
  const reading = await getUtilityReadingById(readingId, scope);
  if (scope.role === 'TENANT' && reading.status === 'INVOICED') {
    throw new AppError(409, 'Cannot attach evidence to invoiced reading', 'UTILITY_READING_LOCKED');
  }

  const asset = resolveCloudinaryAsset(payload);
  const { rows } = await query<UtilityEvidenceRow>(
    `INSERT INTO utility_reading_evidence(
       utility_reading_id,evidence_type,file_name,file_url,mime_type,file_size,uploaded_by_user_id,note,
       cloudinary_asset_id,cloudinary_public_id,cloudinary_resource_type,
       cloudinary_version,cloudinary_format,cloudinary_delivery_type,retention_until
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING ${evidenceColumns}`,
    [
      readingId,
      payload.evidence_type,
      payload.file_name ?? null,
      null,
      payload.mime_type ?? null,
      payload.file_size ?? null,
      scope.userId,
      payload.note ?? null,
      asset.assetId,
      asset.publicId,
      asset.resourceType,
      asset.version,
      asset.format,
      asset.deliveryType,
      getDocumentRetentionUntil('UTILITY_EVIDENCE')
    ]
  );
  return rows[0];
};
