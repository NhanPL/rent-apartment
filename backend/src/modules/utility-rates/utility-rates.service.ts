import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';

type DbRow = Record<string, any>;
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];

export interface UtilityRatePayload {
  building_id: string;
  effective_from: string;
  electricity_unit_price: number;
  water_unit_price: number;
  note?: string | null;
}

export interface UtilityRateUpdatePayload {
  building_id?: string;
  effective_from?: string;
  electricity_unit_price?: number;
  water_unit_price?: number;
  note?: string | null;
}

const rateProjection = 'ur.*, b.name AS building_name';

const assertManagerBuilding = async (client: Pick<TxClient, 'query'>, buildingId: string, managerId: string) => {
  const { rows } = await client.query('SELECT id FROM building WHERE id=$1 AND manager_user_id=$2', [buildingId, managerId]);
  if (!rows[0]) throw new AppError(404, 'Building not found', 'BUILDING_NOT_FOUND');
};

const assertUniqueEffectiveDate = async (
  client: Pick<TxClient, 'query'>,
  buildingId: string,
  effectiveFrom: string,
  excludeId?: string
) => {
  const { rows } = await client.query(
    `SELECT id
     FROM utility_rate
     WHERE building_id=$1 AND effective_from=$2 AND ($3::uuid IS NULL OR id<>$3)
     LIMIT 1`,
    [buildingId, effectiveFrom, excludeId ?? null]
  );
  if (rows[0]) {
    throw new AppError(409, 'Utility rate already exists for this building and effective date', 'UTILITY_RATE_ALREADY_EXISTS');
  }
};

export const listUtilityRates = async (managerId: string, buildingId?: string) => {
  const params: unknown[] = [managerId];
  const conditions = ['b.manager_user_id=$1'];

  if (buildingId) {
    params.push(buildingId);
    conditions.push(`ur.building_id=$${params.length}`);
  }

  return (await query<DbRow>(
    `SELECT ${rateProjection}
     FROM utility_rate ur
     JOIN building b ON b.id=ur.building_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ur.effective_from DESC, ur.created_at DESC`,
    params
  )).rows;
};

export const getUtilityRate = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `SELECT ${rateProjection}
     FROM utility_rate ur
     JOIN building b ON b.id=ur.building_id
     WHERE ur.id=$1 AND b.manager_user_id=$2`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Utility rate not found', 'UTILITY_RATE_NOT_FOUND');
  return rows[0];
};

export const createUtilityRate = async (payload: UtilityRatePayload, managerId: string) =>
  withTransaction(async (client) => {
    await assertManagerBuilding(client, payload.building_id, managerId);
    await assertUniqueEffectiveDate(client, payload.building_id, payload.effective_from);

    const { rows } = await client.query<DbRow>(
      `INSERT INTO utility_rate(building_id,effective_from,electricity_unit_price,water_unit_price,note)
       VALUES($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        payload.building_id,
        payload.effective_from,
        payload.electricity_unit_price,
        payload.water_unit_price,
        payload.note ?? null
      ]
    );
    return rows[0];
  });

export const updateUtilityRate = async (id: string, payload: UtilityRateUpdatePayload, managerId: string) =>
  withTransaction(async (client) => {
    const currentRs = await client.query<DbRow>(
      `SELECT ur.*
       FROM utility_rate ur
       JOIN building b ON b.id=ur.building_id
       WHERE ur.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF ur`,
      [id, managerId]
    );
    const current = currentRs.rows[0];
    if (!current) throw new AppError(404, 'Utility rate not found', 'UTILITY_RATE_NOT_FOUND');

    const buildingId = payload.building_id ?? current.building_id;
    const effectiveFrom = payload.effective_from ?? current.effective_from;
    if (payload.building_id) await assertManagerBuilding(client, payload.building_id, managerId);
    await assertUniqueEffectiveDate(client, buildingId, effectiveFrom, id);

    const hasNote = Object.prototype.hasOwnProperty.call(payload, 'note');
    const { rows } = await client.query<DbRow>(
      `UPDATE utility_rate
       SET building_id=$1,
           effective_from=$2,
           electricity_unit_price=COALESCE($3, electricity_unit_price),
           water_unit_price=COALESCE($4, water_unit_price),
           note=CASE WHEN $5::boolean THEN $6 ELSE note END
       WHERE id=$7
       RETURNING *`,
      [
        buildingId,
        effectiveFrom,
        payload.electricity_unit_price ?? null,
        payload.water_unit_price ?? null,
        hasNote,
        payload.note ?? null,
        id
      ]
    );
    return rows[0];
  });

export const deleteUtilityRate = async (id: string, managerId: string) => {
  const { rows } = await query(
    `DELETE FROM utility_rate ur
     USING building b
     WHERE ur.id=$1 AND b.id=ur.building_id AND b.manager_user_id=$2
     RETURNING ur.id`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Utility rate not found', 'UTILITY_RATE_NOT_FOUND');
};
