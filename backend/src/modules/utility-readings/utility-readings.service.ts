import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { firstDayOfMonth } from '../../shared/utils/date';

type DbRow = Record<string, any>;
type AuthScope = { userId: string; role: 'MANAGER' | 'TENANT' };

export const getUtilityReadingById = async (id: string, scope: AuthScope) => {
  const { rows } = scope.role === 'MANAGER'
    ? await query(
      `SELECT ur.*
       FROM utility_reading ur
       JOIN room r ON r.id=ur.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ur.id=$1 AND b.manager_user_id=$2`,
      [id, scope.userId]
    )
    : await query(
      `SELECT DISTINCT ur.*
       FROM utility_reading ur
       JOIN contract c ON c.room_id=ur.room_id AND c.status='ACTIVE'
       JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE ur.id=$1 AND t.user_id=$2`,
      [id, scope.userId]
    );
  if (!rows[0]) throw new AppError(404, 'Utility reading not found');
  return rows[0];
};

export const listUtilityReadings = async (scope: AuthScope, roomId?: string) => {
  if (scope.role === 'MANAGER') {
    return (await query(
      `SELECT ur.*
       FROM utility_reading ur
       JOIN room r ON r.id=ur.room_id
       JOIN building b ON b.id=r.building_id
       WHERE b.manager_user_id=$1
         AND ($2::uuid IS NULL OR ur.room_id=$2)
       ORDER BY ur.month DESC, ur.created_at DESC`,
      [scope.userId, roomId ?? null]
    )).rows;
  }

  return (await query(
    `SELECT DISTINCT ur.*
     FROM utility_reading ur
     JOIN contract c ON c.room_id=ur.room_id AND c.status='ACTIVE'
     JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
     JOIN tenant t ON t.id=ct.tenant_id
     WHERE t.user_id=$1
       AND ($2::uuid IS NULL OR ur.room_id=$2)
     ORDER BY ur.month DESC, ur.created_at DESC`,
    [scope.userId, roomId ?? null]
  )).rows;
};

export const createUtilityReading = async (payload: any, userId: string) => {
  const month = firstDayOfMonth(payload.month);
  return withTransaction(async (client) => {
    const roomContract = await client.query(
      `SELECT c.id FROM contract c
       JOIN contract_tenant ct ON ct.contract_id=c.id AND ct.left_at IS NULL
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE c.room_id=$1 AND c.status='ACTIVE' AND t.user_id=$2`,
      [payload.room_id, userId]
    );
    if (!roomContract.rows[0]) throw new AppError(403, 'Tenant is not active in this room');

    const prev = await client.query<DbRow>(
      `SELECT electricity_curr, water_curr FROM utility_reading WHERE room_id=$1 AND month < $2 AND status IN ('APPROVED','INVOICED') ORDER BY month DESC LIMIT 1`,
      [payload.room_id, month]
    );
    const ep = Number(prev.rows[0]?.electricity_curr ?? 0);
    const wp = Number(prev.rows[0]?.water_curr ?? 0);

    if (Number(payload.electricity_curr) < ep || Number(payload.water_curr) < wp) {
      throw new AppError(400, 'Current reading must be greater or equal previous reading');
    }

    const existing = await client.query('SELECT id FROM utility_reading WHERE room_id=$1 AND month=$2', [payload.room_id, month]);
    if (existing.rows[0]) throw new AppError(409, 'Reading already exists for this room and month');

    const created = await client.query(
      `INSERT INTO utility_reading(room_id, month, electricity_prev, electricity_curr, water_prev, water_curr, status, reported_by_user_id, reported_at, submitted_at)
       VALUES($1,$2,$3,$4,$5,$6,'SUBMITTED',$7,now(),now()) RETURNING *`,
      [payload.room_id, month, ep, payload.electricity_curr, wp, payload.water_curr, userId]
    );
    return created.rows[0];
  });
};

export const approveUtilityReading = async (id: string, managerId: string) => {
  const { rows } = await query(
    `UPDATE utility_reading SET status='APPROVED', approved_by_user_id=$2, approved_at=now(), verified_by_user_id=$2, verified_at=now(), rejection_reason=NULL
     WHERE id=$1
       AND status='SUBMITTED'
       AND room_id IN (
         SELECT r.id
         FROM room r
         JOIN building b ON b.id=r.building_id
         WHERE b.manager_user_id=$2
       )
     RETURNING *`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(409, 'Reading is not in SUBMITTED status');
  return rows[0];
};

export const rejectUtilityReading = async (id: string, managerId: string, reason: string) => {
  const { rows } = await query(
    `UPDATE utility_reading SET status='REJECTED', rejected_by_user_id=$2, rejected_at=now(), rejection_reason=$3
     WHERE id=$1
       AND status='SUBMITTED'
       AND room_id IN (
         SELECT r.id
         FROM room r
         JOIN building b ON b.id=r.building_id
         WHERE b.manager_user_id=$2
       )
     RETURNING *`,
    [id, managerId, reason]
  );
  if (!rows[0]) throw new AppError(409, 'Reading is not in SUBMITTED status');
  return rows[0];
};

export const attachUtilityReadingEvidence = async (readingId: string, payload: any, scope: AuthScope) => {
  await getUtilityReadingById(readingId, scope);
  const { rows } = await query(
    `INSERT INTO utility_reading_evidence(utility_reading_id,evidence_type,file_name,file_url,mime_type,file_size,uploaded_by_user_id,note)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [readingId, payload.evidence_type, payload.file_name ?? null, payload.file_url, payload.mime_type ?? null, payload.file_size ?? null, scope.userId, payload.note ?? null]
  );
  return rows[0];
};
