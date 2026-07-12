import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { firstDayOfMonth } from '../../shared/utils/date';

type DbRow = Record<string, any>;
type AuthScope = { userId: string; role: 'MANAGER' | 'TENANT' };
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];

export interface UtilityReadingListParams {
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
  note?: string | null;
}

export interface UtilityEvidencePayload {
  evidence_type: 'ELECTRIC' | 'WATER' | 'OTHER';
  file_name?: string | null;
  file_url: string;
  mime_type: string;
  file_size: number;
  note?: string | null;
}

const readingProjection = `
  ur.*,
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
    `SELECT ur.*
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

export const getUtilityReadingById = async (id: string, scope: AuthScope): Promise<DbRow & { evidence: DbRow[] }> => {
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

  const evidence = await query<DbRow>(
    `SELECT *
     FROM utility_reading_evidence
     WHERE utility_reading_id=$1
     ORDER BY uploaded_at DESC, created_at DESC`,
    [id]
  );

  return { ...reading, evidence: evidence.rows };
};

export const listUtilityReadings = async (scope: AuthScope, filters: UtilityReadingListParams = {}) => {
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

  if (filters.buildingId && scope.role === 'MANAGER') {
    params.push(filters.buildingId);
    conditions.push(`b.id=$${params.length}`);
  }
  if (filters.roomId) {
    params.push(filters.roomId);
    conditions.push(`ur.room_id=$${params.length}`);
  }
  if (filters.month) {
    params.push(firstDayOfMonth(filters.month));
    conditions.push(`ur.month=$${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`ur.status=$${params.length}`);
  }

  return (await query<DbRow>(
    `SELECT ${readingProjection}
     FROM utility_reading ur
     ${readingJoins}
     WHERE ${conditions.join(' AND ')}
     ORDER BY ur.month DESC, ur.created_at DESC`,
    params
  )).rows;
};

export const createUtilityReading = async (payload: UtilityReadingCreatePayload, userId: string) => {
  const month = firstDayOfMonth(payload.month ?? undefined);
  return withTransaction(async (client) => {
    const roomContract = await client.query(
      `SELECT c.id
       FROM contract c
       JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE c.room_id=$1 AND c.status='ACTIVE' AND t.user_id=$2
       LIMIT 1`,
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

    if (Number(payload.electricity_curr) < electricityPrev || Number(payload.water_curr) < waterPrev) {
      throw new AppError(400, 'Current reading must be greater or equal previous reading', 'INVALID_UTILITY_READING');
    }

    const existing = await client.query<DbRow>(
      'SELECT * FROM utility_reading WHERE room_id=$1 AND month=$2 FOR UPDATE',
      [payload.room_id, month]
    );

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
             status='SUBMITTED',
             reported_by_user_id=$5,
             reported_at=now(),
             submitted_at=now(),
             rejected_by_user_id=NULL,
             rejected_at=NULL,
             rejection_reason=NULL,
             note=$6
         WHERE id=$7
         RETURNING *`,
        [electricityPrev, payload.electricity_curr, waterPrev, payload.water_curr, userId, payload.note ?? null, existing.rows[0].id]
      );
      return updated.rows[0];
    }

    const created = await client.query<DbRow>(
      `INSERT INTO utility_reading(room_id, month, electricity_prev, electricity_curr, water_prev, water_curr, status, reported_by_user_id, reported_at, submitted_at, note)
       VALUES($1,$2,$3,$4,$5,$6,'SUBMITTED',$7,now(),now(),$8)
       RETURNING *`,
      [payload.room_id, month, electricityPrev, payload.electricity_curr, waterPrev, payload.water_curr, userId, payload.note ?? null]
    );
    return created.rows[0];
  });
};

export const approveUtilityReading = async (id: string, managerId: string) => {
  await withTransaction(async (client) => {
    const reading = await getScopedReadingForManager(client, id, managerId);
    if (reading.status !== 'SUBMITTED') {
      throw new AppError(409, 'Only submitted readings can be approved', 'UTILITY_READING_NOT_SUBMITTED');
    }

    const evidence = await client.query<{ evidence_type: string }>(
      `SELECT DISTINCT evidence_type
       FROM utility_reading_evidence
       WHERE utility_reading_id=$1 AND evidence_type IN ('ELECTRIC','WATER')`,
      [id]
    );
    const evidenceTypes = new Set(evidence.rows.map((item) => item.evidence_type));
    if (!evidenceTypes.has('ELECTRIC') || !evidenceTypes.has('WATER')) {
      throw new AppError(409, 'Electricity and water meter images are required before approval', 'UTILITY_READING_EVIDENCE_REQUIRED');
    }

    await client.query(
      `UPDATE utility_reading
       SET status='APPROVED',
           approved_by_user_id=$2,
           approved_at=now(),
           verified_by_user_id=$2,
           verified_at=now(),
           rejected_by_user_id=NULL,
           rejected_at=NULL,
           rejection_reason=NULL
       WHERE id=$1`,
      [id, managerId]
    );
  });

  return getUtilityReadingById(id, { userId: managerId, role: 'MANAGER' });
};

export const rejectUtilityReading = async (id: string, managerId: string, reason: string) => {
  await withTransaction(async (client) => {
    const reading = await getScopedReadingForManager(client, id, managerId);
    if (reading.status !== 'SUBMITTED') {
      throw new AppError(409, 'Only submitted readings can be rejected', 'UTILITY_READING_NOT_SUBMITTED');
    }

    await client.query(
      `UPDATE utility_reading
       SET status='REJECTED',
           rejected_by_user_id=$2,
           rejected_at=now(),
           rejection_reason=$3
       WHERE id=$1`,
      [id, managerId, reason]
    );
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
    const invoice = await client.query(
      `SELECT id FROM invoice WHERE utility_reading_id=$1 AND status<>'VOID' LIMIT 1`,
      [id]
    );
    if (invoice.rows[0]) throw new AppError(409, 'Void the invoice before requesting a reading correction', 'UTILITY_READING_LOCKED');

    await client.query(
      `UPDATE utility_reading
       SET status='REJECTED', rejected_by_user_id=$2, rejected_at=now(), rejection_reason=$3,
           approved_by_user_id=NULL, approved_at=NULL
       WHERE id=$1`,
      [id, managerId, reason]
    );
  });
  return getUtilityReadingById(id, { userId: managerId, role: 'MANAGER' });
};

export const attachUtilityReadingEvidence = async (readingId: string, payload: UtilityEvidencePayload, scope: AuthScope) => {
  const reading = await getUtilityReadingById(readingId, scope);
  if (scope.role === 'TENANT' && reading.status === 'INVOICED') {
    throw new AppError(409, 'Cannot attach evidence to invoiced reading', 'UTILITY_READING_LOCKED');
  }

  const { rows } = await query<DbRow>(
    `INSERT INTO utility_reading_evidence(utility_reading_id,evidence_type,file_name,file_url,mime_type,file_size,uploaded_by_user_id,note)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      readingId,
      payload.evidence_type,
      payload.file_name ?? null,
      payload.file_url,
      payload.mime_type ?? null,
      payload.file_size ?? null,
      scope.userId,
      payload.note ?? null
    ]
  );
  return rows[0];
};
