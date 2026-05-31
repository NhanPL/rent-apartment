import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { firstDayOfMonth } from '../../shared/utils/date';

type DbRow = Record<string, any>;
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];
type QueryClient = Pick<TxClient, 'query'>;

export type ChargeType = 'FLAT' | 'PER_PERSON' | 'PER_VEHICLE';
export type FixedChargeSource = 'CONTRACT_OVERRIDE' | 'ROOM_OVERRIDE' | 'BUILDING_DEFAULT';

export interface ChargeCatalogPayload {
  code: string;
  name: string;
  charge_type: ChargeType;
  is_active?: boolean;
  note?: string | null;
}

export type ChargeCatalogUpdatePayload = Partial<ChargeCatalogPayload>;

export interface BuildingChargePayload {
  building_id: string;
  charge_id: string;
  unit_price: number;
  effective_from: string;
  is_active?: boolean;
}

export type BuildingChargeUpdatePayload = Partial<BuildingChargePayload>;

export interface RoomChargeOverridePayload {
  room_id: string;
  charge_id: string;
  unit_price: number;
  effective_from: string;
  is_active?: boolean;
}

export type RoomChargeOverrideUpdatePayload = Partial<RoomChargeOverridePayload>;

export interface ContractChargeOverridePayload {
  contract_id: string;
  charge_id: string;
  unit_price: number;
  effective_from: string;
  effective_to?: string | null;
  is_active?: boolean;
}

export type ContractChargeOverrideUpdatePayload = Partial<ContractChargeOverridePayload>;

export interface RoomMonthExtraPayload {
  room_id: string;
  month: string;
  persons_count?: number | null;
  vehicles_count?: number | null;
  note?: string | null;
}

export type RoomMonthExtraUpdatePayload = Partial<RoomMonthExtraPayload>;

export interface ResolvedFixedCharge {
  charge_id: string;
  charge_code: string;
  charge_name: string;
  charge_type: ChargeType;
  source: FixedChargeSource;
  source_id: string;
  effective_from: string;
  quantity: number;
  unit_price: number;
  amount: number;
  persons_count: number;
  vehicles_count: number;
  room_month_extra_id: string | null;
}

export interface ResolveFixedChargeParams {
  contractId: string;
  roomId: string;
  buildingId: string;
  month: string;
}

const toNumber = (value: unknown): number => Number(value ?? 0);
const money = (value: number): number => Number(value.toFixed(2));
const normalizeCode = (value: string): string => value.trim().toUpperCase().replace(/\s+/g, '_');
const hasOwn = <T extends object>(payload: T, key: keyof T): boolean => Object.prototype.hasOwnProperty.call(payload, key);
const assertDateRange = (effectiveFrom: unknown, effectiveTo: unknown) => {
  if (effectiveTo && new Date(effectiveTo as string) < new Date(effectiveFrom as string)) {
    throw new AppError(400, 'effective_to must be after effective_from', 'INVALID_EFFECTIVE_DATE_RANGE');
  }
};

const catalogProjection = `
  cc.*
`;

const buildingChargeProjection = `
  bc.*,
  b.name AS building_name,
  cc.code AS charge_code,
  cc.name AS charge_name,
  cc.charge_type
`;

const roomChargeProjection = `
  rco.*,
  r.building_id,
  r.code AS room_code,
  b.name AS building_name,
  cc.code AS charge_code,
  cc.name AS charge_name,
  cc.charge_type
`;

const contractChargeProjection = `
  cco.*,
  c.room_id,
  c.contract_code,
  c.status AS contract_status,
  r.building_id,
  r.code AS room_code,
  b.name AS building_name,
  cc.code AS charge_code,
  cc.name AS charge_name,
  cc.charge_type,
  tenant.full_name AS tenant_name
`;

const roomMonthExtraProjection = `
  rme.*,
  r.building_id,
  r.code AS room_code,
  b.name AS building_name
`;

const assertChargeCatalog = async (client: QueryClient, chargeId: string) => {
  const { rows } = await client.query('SELECT id FROM charge_catalog WHERE id=$1', [chargeId]);
  if (!rows[0]) throw new AppError(404, 'Charge catalog item not found', 'CHARGE_NOT_FOUND');
};

const assertUniqueCatalogCode = async (client: QueryClient, code: string, excludeId?: string) => {
  const { rows } = await client.query(
    `SELECT id FROM charge_catalog WHERE code=$1 AND ($2::uuid IS NULL OR id<>$2) LIMIT 1`,
    [code, excludeId ?? null]
  );
  if (rows[0]) throw new AppError(409, 'Charge code already exists', 'CHARGE_CODE_EXISTS');
};

const assertManagerBuilding = async (client: QueryClient, buildingId: string, managerId: string) => {
  const { rows } = await client.query('SELECT id FROM building WHERE id=$1 AND manager_user_id=$2', [buildingId, managerId]);
  if (!rows[0]) throw new AppError(404, 'Building not found', 'BUILDING_NOT_FOUND');
};

const assertManagerRoom = async (client: QueryClient, roomId: string, managerId: string) => {
  const { rows } = await client.query(
    `SELECT r.id
     FROM room r
     JOIN building b ON b.id=r.building_id
     WHERE r.id=$1 AND b.manager_user_id=$2`,
    [roomId, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');
};

const assertManagerContract = async (client: QueryClient, contractId: string, managerId: string) => {
  const { rows } = await client.query(
    `SELECT c.id
     FROM contract c
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE c.id=$1 AND b.manager_user_id=$2`,
    [contractId, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
};

const assertUniqueBuildingCharge = async (
  client: QueryClient,
  buildingId: string,
  chargeId: string,
  effectiveFrom: string,
  excludeId?: string
) => {
  const { rows } = await client.query(
    `SELECT id
     FROM building_charge
     WHERE building_id=$1 AND charge_id=$2 AND effective_from=$3 AND ($4::uuid IS NULL OR id<>$4)
     LIMIT 1`,
    [buildingId, chargeId, effectiveFrom, excludeId ?? null]
  );
  if (rows[0]) throw new AppError(409, 'Building charge already exists for this effective date', 'BUILDING_CHARGE_EXISTS');
};

const assertUniqueRoomCharge = async (
  client: QueryClient,
  roomId: string,
  chargeId: string,
  effectiveFrom: string,
  excludeId?: string
) => {
  const { rows } = await client.query(
    `SELECT id
     FROM room_charge_override
     WHERE room_id=$1 AND charge_id=$2 AND effective_from=$3 AND ($4::uuid IS NULL OR id<>$4)
     LIMIT 1`,
    [roomId, chargeId, effectiveFrom, excludeId ?? null]
  );
  if (rows[0]) throw new AppError(409, 'Room override already exists for this effective date', 'ROOM_CHARGE_EXISTS');
};

const assertUniqueContractCharge = async (
  client: QueryClient,
  contractId: string,
  chargeId: string,
  effectiveFrom: string,
  excludeId?: string
) => {
  const { rows } = await client.query(
    `SELECT id
     FROM contract_charge_override
     WHERE contract_id=$1 AND charge_id=$2 AND effective_from=$3 AND ($4::uuid IS NULL OR id<>$4)
     LIMIT 1`,
    [contractId, chargeId, effectiveFrom, excludeId ?? null]
  );
  if (rows[0]) throw new AppError(409, 'Contract override already exists for this effective date', 'CONTRACT_CHARGE_EXISTS');
};

const assertUniqueRoomMonthExtra = async (client: QueryClient, roomId: string, month: string, excludeId?: string) => {
  const { rows } = await client.query(
    `SELECT id
     FROM room_month_extra
     WHERE room_id=$1 AND month=$2 AND ($3::uuid IS NULL OR id<>$3)
     LIMIT 1`,
    [roomId, month, excludeId ?? null]
  );
  if (rows[0]) throw new AppError(409, 'Room monthly extras already exist for this month', 'ROOM_MONTH_EXTRA_EXISTS');
};

export const listChargeCatalog = async (isActive?: boolean) => {
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (isActive !== undefined) {
    params.push(isActive);
    conditions.push(`cc.is_active=$${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return (await query<DbRow>(
    `SELECT ${catalogProjection}
     FROM charge_catalog cc
     ${where}
     ORDER BY cc.is_active DESC, cc.code`,
    params
  )).rows;
};

export const getChargeCatalog = async (id: string) => {
  const { rows } = await query<DbRow>('SELECT * FROM charge_catalog WHERE id=$1', [id]);
  if (!rows[0]) throw new AppError(404, 'Charge catalog item not found', 'CHARGE_NOT_FOUND');
  return rows[0];
};

export const createChargeCatalog = async (payload: ChargeCatalogPayload) =>
  withTransaction(async (client) => {
    const code = normalizeCode(payload.code);
    await assertUniqueCatalogCode(client, code);

    const { rows } = await client.query<DbRow>(
      `INSERT INTO charge_catalog(code,name,charge_type,is_active,note)
       VALUES($1,$2,$3,$4,$5)
       RETURNING *`,
      [code, payload.name.trim(), payload.charge_type, payload.is_active ?? true, payload.note ?? null]
    );
    return rows[0];
  });

export const updateChargeCatalog = async (id: string, payload: ChargeCatalogUpdatePayload) =>
  withTransaction(async (client) => {
    const currentRs = await client.query<DbRow>('SELECT * FROM charge_catalog WHERE id=$1 FOR UPDATE', [id]);
    const current = currentRs.rows[0];
    if (!current) throw new AppError(404, 'Charge catalog item not found', 'CHARGE_NOT_FOUND');

    const code = payload.code ? normalizeCode(payload.code) : current.code;
    await assertUniqueCatalogCode(client, code, id);

    const noteProvided = hasOwn(payload, 'note');
    const { rows } = await client.query<DbRow>(
      `UPDATE charge_catalog
       SET code=$1,
           name=$2,
           charge_type=$3,
           is_active=$4,
           note=CASE WHEN $5::boolean THEN $6 ELSE note END
       WHERE id=$7
       RETURNING *`,
      [
        code,
        payload.name?.trim() ?? current.name,
        payload.charge_type ?? current.charge_type,
        payload.is_active ?? current.is_active,
        noteProvided,
        payload.note ?? null,
        id
      ]
    );
    return rows[0];
  });

export const deleteChargeCatalog = async (id: string) => {
  const { rows } = await query<DbRow>(
    `UPDATE charge_catalog
     SET is_active=false
     WHERE id=$1
     RETURNING id`,
    [id]
  );
  if (!rows[0]) throw new AppError(404, 'Charge catalog item not found', 'CHARGE_NOT_FOUND');
};

export const listBuildingCharges = async (managerId: string, buildingId?: string) => {
  const params: unknown[] = [managerId];
  const conditions = ['b.manager_user_id=$1'];
  if (buildingId) {
    params.push(buildingId);
    conditions.push(`bc.building_id=$${params.length}`);
  }

  return (await query<DbRow>(
    `SELECT ${buildingChargeProjection}
     FROM building_charge bc
     JOIN building b ON b.id=bc.building_id
     JOIN charge_catalog cc ON cc.id=bc.charge_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.name, cc.code, bc.effective_from DESC`,
    params
  )).rows;
};

export const getBuildingCharge = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `SELECT ${buildingChargeProjection}
     FROM building_charge bc
     JOIN building b ON b.id=bc.building_id
     JOIN charge_catalog cc ON cc.id=bc.charge_id
     WHERE bc.id=$1 AND b.manager_user_id=$2`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Building charge not found', 'BUILDING_CHARGE_NOT_FOUND');
  return rows[0];
};

export const createBuildingCharge = async (payload: BuildingChargePayload, managerId: string) =>
  withTransaction(async (client) => {
    await assertManagerBuilding(client, payload.building_id, managerId);
    await assertChargeCatalog(client, payload.charge_id);
    await assertUniqueBuildingCharge(client, payload.building_id, payload.charge_id, payload.effective_from);

    const { rows } = await client.query<DbRow>(
      `INSERT INTO building_charge(building_id,charge_id,unit_price,effective_from,is_active)
       VALUES($1,$2,$3,$4,$5)
       RETURNING *`,
      [payload.building_id, payload.charge_id, payload.unit_price, payload.effective_from, payload.is_active ?? true]
    );
    return rows[0];
  });

export const updateBuildingCharge = async (id: string, payload: BuildingChargeUpdatePayload, managerId: string) =>
  withTransaction(async (client) => {
    const currentRs = await client.query<DbRow>(
      `SELECT bc.*
       FROM building_charge bc
       JOIN building b ON b.id=bc.building_id
       WHERE bc.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF bc`,
      [id, managerId]
    );
    const current = currentRs.rows[0];
    if (!current) throw new AppError(404, 'Building charge not found', 'BUILDING_CHARGE_NOT_FOUND');

    const buildingId = payload.building_id ?? current.building_id;
    const chargeId = payload.charge_id ?? current.charge_id;
    const effectiveFrom = payload.effective_from ?? current.effective_from;
    await assertManagerBuilding(client, buildingId, managerId);
    await assertChargeCatalog(client, chargeId);
    await assertUniqueBuildingCharge(client, buildingId, chargeId, effectiveFrom, id);

    const { rows } = await client.query<DbRow>(
      `UPDATE building_charge
       SET building_id=$1,charge_id=$2,unit_price=$3,effective_from=$4,is_active=$5
       WHERE id=$6
       RETURNING *`,
      [
        buildingId,
        chargeId,
        payload.unit_price ?? current.unit_price,
        effectiveFrom,
        payload.is_active ?? current.is_active,
        id
      ]
    );
    return rows[0];
  });

export const deleteBuildingCharge = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `DELETE FROM building_charge bc
     USING building b
     WHERE bc.id=$1 AND b.id=bc.building_id AND b.manager_user_id=$2
     RETURNING bc.id`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Building charge not found', 'BUILDING_CHARGE_NOT_FOUND');
};

export const listRoomChargeOverrides = async (managerId: string, filters: { buildingId?: string; roomId?: string }) => {
  const params: unknown[] = [managerId];
  const conditions = ['b.manager_user_id=$1'];
  if (filters.buildingId) {
    params.push(filters.buildingId);
    conditions.push(`r.building_id=$${params.length}`);
  }
  if (filters.roomId) {
    params.push(filters.roomId);
    conditions.push(`rco.room_id=$${params.length}`);
  }

  return (await query<DbRow>(
    `SELECT ${roomChargeProjection}
     FROM room_charge_override rco
     JOIN room r ON r.id=rco.room_id
     JOIN building b ON b.id=r.building_id
     JOIN charge_catalog cc ON cc.id=rco.charge_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.name, r.code, cc.code, rco.effective_from DESC`,
    params
  )).rows;
};

export const getRoomChargeOverride = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `SELECT ${roomChargeProjection}
     FROM room_charge_override rco
     JOIN room r ON r.id=rco.room_id
     JOIN building b ON b.id=r.building_id
     JOIN charge_catalog cc ON cc.id=rco.charge_id
     WHERE rco.id=$1 AND b.manager_user_id=$2`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Room charge override not found', 'ROOM_CHARGE_NOT_FOUND');
  return rows[0];
};

export const createRoomChargeOverride = async (payload: RoomChargeOverridePayload, managerId: string) =>
  withTransaction(async (client) => {
    await assertManagerRoom(client, payload.room_id, managerId);
    await assertChargeCatalog(client, payload.charge_id);
    await assertUniqueRoomCharge(client, payload.room_id, payload.charge_id, payload.effective_from);

    const { rows } = await client.query<DbRow>(
      `INSERT INTO room_charge_override(room_id,charge_id,unit_price,effective_from,is_active)
       VALUES($1,$2,$3,$4,$5)
       RETURNING *`,
      [payload.room_id, payload.charge_id, payload.unit_price, payload.effective_from, payload.is_active ?? true]
    );
    return rows[0];
  });

export const updateRoomChargeOverride = async (id: string, payload: RoomChargeOverrideUpdatePayload, managerId: string) =>
  withTransaction(async (client) => {
    const currentRs = await client.query<DbRow>(
      `SELECT rco.*
       FROM room_charge_override rco
       JOIN room r ON r.id=rco.room_id
       JOIN building b ON b.id=r.building_id
       WHERE rco.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF rco`,
      [id, managerId]
    );
    const current = currentRs.rows[0];
    if (!current) throw new AppError(404, 'Room charge override not found', 'ROOM_CHARGE_NOT_FOUND');

    const roomId = payload.room_id ?? current.room_id;
    const chargeId = payload.charge_id ?? current.charge_id;
    const effectiveFrom = payload.effective_from ?? current.effective_from;
    await assertManagerRoom(client, roomId, managerId);
    await assertChargeCatalog(client, chargeId);
    await assertUniqueRoomCharge(client, roomId, chargeId, effectiveFrom, id);

    const { rows } = await client.query<DbRow>(
      `UPDATE room_charge_override
       SET room_id=$1,charge_id=$2,unit_price=$3,effective_from=$4,is_active=$5
       WHERE id=$6
       RETURNING *`,
      [roomId, chargeId, payload.unit_price ?? current.unit_price, effectiveFrom, payload.is_active ?? current.is_active, id]
    );
    return rows[0];
  });

export const deleteRoomChargeOverride = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `DELETE FROM room_charge_override rco
     USING room r, building b
     WHERE rco.id=$1 AND r.id=rco.room_id AND b.id=r.building_id AND b.manager_user_id=$2
     RETURNING rco.id`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Room charge override not found', 'ROOM_CHARGE_NOT_FOUND');
};

export const listContractChargeOverrides = async (
  managerId: string,
  filters: { buildingId?: string; roomId?: string; contractId?: string }
) => {
  const params: unknown[] = [managerId];
  const conditions = ['b.manager_user_id=$1'];
  if (filters.buildingId) {
    params.push(filters.buildingId);
    conditions.push(`r.building_id=$${params.length}`);
  }
  if (filters.roomId) {
    params.push(filters.roomId);
    conditions.push(`c.room_id=$${params.length}`);
  }
  if (filters.contractId) {
    params.push(filters.contractId);
    conditions.push(`cco.contract_id=$${params.length}`);
  }

  return (await query<DbRow>(
    `SELECT ${contractChargeProjection}
     FROM contract_charge_override cco
     JOIN contract c ON c.id=cco.contract_id
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     JOIN charge_catalog cc ON cc.id=cco.charge_id
     LEFT JOIN LATERAL (
       SELECT t.full_name
       FROM contract_tenant ct
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE ct.contract_id=c.id AND ct.left_at IS NULL
       ORDER BY ct.is_primary DESC, ct.joined_at DESC
       LIMIT 1
     ) tenant ON true
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.name, r.code, cc.code, cco.effective_from DESC`,
    params
  )).rows;
};

export const getContractChargeOverride = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `SELECT ${contractChargeProjection}
     FROM contract_charge_override cco
     JOIN contract c ON c.id=cco.contract_id
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     JOIN charge_catalog cc ON cc.id=cco.charge_id
     LEFT JOIN LATERAL (
       SELECT t.full_name
       FROM contract_tenant ct
       JOIN tenant t ON t.id=ct.tenant_id
       WHERE ct.contract_id=c.id AND ct.left_at IS NULL
       ORDER BY ct.is_primary DESC, ct.joined_at DESC
       LIMIT 1
     ) tenant ON true
     WHERE cco.id=$1 AND b.manager_user_id=$2`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Contract charge override not found', 'CONTRACT_CHARGE_NOT_FOUND');
  return rows[0];
};

export const createContractChargeOverride = async (payload: ContractChargeOverridePayload, managerId: string) =>
  withTransaction(async (client) => {
    assertDateRange(payload.effective_from, payload.effective_to);
    await assertManagerContract(client, payload.contract_id, managerId);
    await assertChargeCatalog(client, payload.charge_id);
    await assertUniqueContractCharge(client, payload.contract_id, payload.charge_id, payload.effective_from);

    const { rows } = await client.query<DbRow>(
      `INSERT INTO contract_charge_override(contract_id,charge_id,unit_price,effective_from,effective_to,is_active)
       VALUES($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [payload.contract_id, payload.charge_id, payload.unit_price, payload.effective_from, payload.effective_to ?? null, payload.is_active ?? true]
    );
    return rows[0];
  });

export const updateContractChargeOverride = async (id: string, payload: ContractChargeOverrideUpdatePayload, managerId: string) =>
  withTransaction(async (client) => {
    const currentRs = await client.query<DbRow>(
      `SELECT cco.*
       FROM contract_charge_override cco
       JOIN contract c ON c.id=cco.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE cco.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF cco`,
      [id, managerId]
    );
    const current = currentRs.rows[0];
    if (!current) throw new AppError(404, 'Contract charge override not found', 'CONTRACT_CHARGE_NOT_FOUND');

    const contractId = payload.contract_id ?? current.contract_id;
    const chargeId = payload.charge_id ?? current.charge_id;
    const effectiveFrom = payload.effective_from ?? current.effective_from;
    const effectiveTo = hasOwn(payload, 'effective_to') ? payload.effective_to ?? null : current.effective_to;
    assertDateRange(effectiveFrom, effectiveTo);
    await assertManagerContract(client, contractId, managerId);
    await assertChargeCatalog(client, chargeId);
    await assertUniqueContractCharge(client, contractId, chargeId, effectiveFrom, id);

    const { rows } = await client.query<DbRow>(
      `UPDATE contract_charge_override
       SET contract_id=$1,charge_id=$2,unit_price=$3,effective_from=$4,effective_to=$5,is_active=$6
       WHERE id=$7
       RETURNING *`,
      [contractId, chargeId, payload.unit_price ?? current.unit_price, effectiveFrom, effectiveTo, payload.is_active ?? current.is_active, id]
    );
    return rows[0];
  });

export const deleteContractChargeOverride = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `DELETE FROM contract_charge_override cco
     USING contract c, room r, building b
     WHERE cco.id=$1 AND c.id=cco.contract_id AND r.id=c.room_id AND b.id=r.building_id AND b.manager_user_id=$2
     RETURNING cco.id`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Contract charge override not found', 'CONTRACT_CHARGE_NOT_FOUND');
};

export const listRoomMonthExtras = async (managerId: string, filters: { buildingId?: string; roomId?: string; month?: string }) => {
  const params: unknown[] = [managerId];
  const conditions = ['b.manager_user_id=$1'];
  if (filters.buildingId) {
    params.push(filters.buildingId);
    conditions.push(`r.building_id=$${params.length}`);
  }
  if (filters.roomId) {
    params.push(filters.roomId);
    conditions.push(`rme.room_id=$${params.length}`);
  }
  if (filters.month) {
    params.push(firstDayOfMonth(filters.month));
    conditions.push(`rme.month=$${params.length}`);
  }

  return (await query<DbRow>(
    `SELECT ${roomMonthExtraProjection}
     FROM room_month_extra rme
     JOIN room r ON r.id=rme.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY rme.month DESC, b.name, r.code`,
    params
  )).rows;
};

export const getRoomMonthExtra = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `SELECT ${roomMonthExtraProjection}
     FROM room_month_extra rme
     JOIN room r ON r.id=rme.room_id
     JOIN building b ON b.id=r.building_id
     WHERE rme.id=$1 AND b.manager_user_id=$2`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Room monthly extras not found', 'ROOM_MONTH_EXTRA_NOT_FOUND');
  return rows[0];
};

export const createRoomMonthExtra = async (payload: RoomMonthExtraPayload, managerId: string) =>
  withTransaction(async (client) => {
    const month = firstDayOfMonth(payload.month);
    await assertManagerRoom(client, payload.room_id, managerId);
    await assertUniqueRoomMonthExtra(client, payload.room_id, month);

    const { rows } = await client.query<DbRow>(
      `INSERT INTO room_month_extra(room_id,month,persons_count,vehicles_count,reported_by_user_id,reported_at,note)
       VALUES($1,$2,$3,$4,$5,now(),$6)
       RETURNING *`,
      [payload.room_id, month, payload.persons_count ?? null, payload.vehicles_count ?? null, managerId, payload.note ?? null]
    );
    return rows[0];
  });

export const updateRoomMonthExtra = async (id: string, payload: RoomMonthExtraUpdatePayload, managerId: string) =>
  withTransaction(async (client) => {
    const currentRs = await client.query<DbRow>(
      `SELECT rme.*
       FROM room_month_extra rme
       JOIN room r ON r.id=rme.room_id
       JOIN building b ON b.id=r.building_id
       WHERE rme.id=$1 AND b.manager_user_id=$2
       FOR UPDATE OF rme`,
      [id, managerId]
    );
    const current = currentRs.rows[0];
    if (!current) throw new AppError(404, 'Room monthly extras not found', 'ROOM_MONTH_EXTRA_NOT_FOUND');

    const roomId = payload.room_id ?? current.room_id;
    const month = payload.month ? firstDayOfMonth(payload.month) : current.month;
    await assertManagerRoom(client, roomId, managerId);
    await assertUniqueRoomMonthExtra(client, roomId, month, id);

    const personsProvided = hasOwn(payload, 'persons_count');
    const vehiclesProvided = hasOwn(payload, 'vehicles_count');
    const noteProvided = hasOwn(payload, 'note');
    const { rows } = await client.query<DbRow>(
      `UPDATE room_month_extra
       SET room_id=$1,
           month=$2,
           persons_count=CASE WHEN $3::boolean THEN $4 ELSE persons_count END,
           vehicles_count=CASE WHEN $5::boolean THEN $6 ELSE vehicles_count END,
           reported_by_user_id=$7,
           reported_at=now(),
           note=CASE WHEN $8::boolean THEN $9 ELSE note END
       WHERE id=$10
       RETURNING *`,
      [
        roomId,
        month,
        personsProvided,
        payload.persons_count ?? null,
        vehiclesProvided,
        payload.vehicles_count ?? null,
        managerId,
        noteProvided,
        payload.note ?? null,
        id
      ]
    );
    return rows[0];
  });

export const deleteRoomMonthExtra = async (id: string, managerId: string) => {
  const { rows } = await query<DbRow>(
    `DELETE FROM room_month_extra rme
     USING room r, building b
     WHERE rme.id=$1 AND r.id=rme.room_id AND b.id=r.building_id AND b.manager_user_id=$2
     RETURNING rme.id`,
    [id, managerId]
  );
  if (!rows[0]) throw new AppError(404, 'Room monthly extras not found', 'ROOM_MONTH_EXTRA_NOT_FOUND');
};

export const resolveFixedChargesForContract = async (
  client: QueryClient,
  params: ResolveFixedChargeParams
): Promise<ResolvedFixedCharge[]> => {
  const month = firstDayOfMonth(params.month);
  const extraRs = await client.query<DbRow>(
    `SELECT *
     FROM room_month_extra
     WHERE room_id=$1 AND month=$2
     LIMIT 1`,
    [params.roomId, month]
  );
  const extra = extraRs.rows[0];

  const activeTenantsRs = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM contract_tenant
     WHERE contract_id=$1 AND left_at IS NULL`,
    [params.contractId]
  );
  const personsCount = toNumber(extra?.persons_count ?? activeTenantsRs.rows[0]?.count);
  const vehiclesCount = toNumber(extra?.vehicles_count);

  const { rows } = await client.query<DbRow>(
    `WITH charge_ids AS (
       SELECT charge_id FROM building_charge WHERE building_id=$1 AND effective_from <= $4
       UNION
       SELECT charge_id FROM room_charge_override WHERE room_id=$2 AND effective_from <= $4
       UNION
       SELECT charge_id
       FROM contract_charge_override
       WHERE contract_id=$3 AND effective_from <= $4 AND (effective_to IS NULL OR effective_to >= $4)
     )
     SELECT
       cc.id AS charge_id,
       cc.code AS charge_code,
       cc.name AS charge_name,
       cc.charge_type,
       contract_row.id AS contract_row_id,
       contract_row.unit_price AS contract_unit_price,
       contract_row.effective_from AS contract_effective_from,
       contract_row.is_active AS contract_is_active,
       room_row.id AS room_row_id,
       room_row.unit_price AS room_unit_price,
       room_row.effective_from AS room_effective_from,
       room_row.is_active AS room_is_active,
       building_row.id AS building_row_id,
       building_row.unit_price AS building_unit_price,
       building_row.effective_from AS building_effective_from,
       building_row.is_active AS building_is_active
     FROM charge_ids ci
     JOIN charge_catalog cc ON cc.id=ci.charge_id AND cc.is_active=true
     LEFT JOIN LATERAL (
       SELECT *
       FROM contract_charge_override cco
       WHERE cco.contract_id=$3
         AND cco.charge_id=ci.charge_id
         AND cco.effective_from <= $4
         AND (cco.effective_to IS NULL OR cco.effective_to >= $4)
       ORDER BY cco.effective_from DESC, cco.created_at DESC
       LIMIT 1
     ) contract_row ON true
     LEFT JOIN LATERAL (
       SELECT *
       FROM room_charge_override rco
       WHERE rco.room_id=$2 AND rco.charge_id=ci.charge_id AND rco.effective_from <= $4
       ORDER BY rco.effective_from DESC, rco.created_at DESC
       LIMIT 1
     ) room_row ON true
     LEFT JOIN LATERAL (
       SELECT *
       FROM building_charge bc
       WHERE bc.building_id=$1 AND bc.charge_id=ci.charge_id AND bc.effective_from <= $4
       ORDER BY bc.effective_from DESC, bc.created_at DESC
       LIMIT 1
     ) building_row ON true
     ORDER BY cc.code`,
    [params.buildingId, params.roomId, params.contractId, month]
  );

  return rows.flatMap((row): ResolvedFixedCharge[] => {
    const source = row.contract_row_id
      ? {
          source: 'CONTRACT_OVERRIDE' as FixedChargeSource,
          source_id: row.contract_row_id,
          unit_price: toNumber(row.contract_unit_price),
          effective_from: row.contract_effective_from,
          is_active: row.contract_is_active
        }
      : row.room_row_id
        ? {
            source: 'ROOM_OVERRIDE' as FixedChargeSource,
            source_id: row.room_row_id,
            unit_price: toNumber(row.room_unit_price),
            effective_from: row.room_effective_from,
            is_active: row.room_is_active
          }
        : row.building_row_id
          ? {
              source: 'BUILDING_DEFAULT' as FixedChargeSource,
              source_id: row.building_row_id,
              unit_price: toNumber(row.building_unit_price),
              effective_from: row.building_effective_from,
              is_active: row.building_is_active
            }
          : null;

    if (!source || source.is_active !== true) return [];

    const chargeType = row.charge_type as ChargeType;
    const quantity = chargeType === 'PER_PERSON'
      ? personsCount
      : chargeType === 'PER_VEHICLE'
        ? vehiclesCount
        : 1;
    const amount = money(quantity * source.unit_price);

    return [{
      charge_id: row.charge_id,
      charge_code: row.charge_code,
      charge_name: row.charge_name,
      charge_type: chargeType,
      source: source.source,
      source_id: source.source_id,
      effective_from: source.effective_from,
      quantity,
      unit_price: source.unit_price,
      amount,
      persons_count: personsCount,
      vehicles_count: vehiclesCount,
      room_month_extra_id: extra?.id ?? null
    }];
  });
};

export const resolveFixedChargesPreview = async (contractId: string, monthValue: string, managerId: string) => {
  const month = firstDayOfMonth(monthValue);
  const contractRs = await query<DbRow>(
    `SELECT c.id, c.room_id, r.building_id, r.code AS room_code, b.name AS building_name
     FROM contract c
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE c.id=$1 AND b.manager_user_id=$2`,
    [contractId, managerId]
  );
  const contract = contractRs.rows[0];
  if (!contract) throw new AppError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');

  const items = await resolveFixedChargesForContract({ query }, {
    contractId: contract.id,
    roomId: contract.room_id,
    buildingId: contract.building_id,
    month
  });

  return {
    contract_id: contract.id,
    room_id: contract.room_id,
    room_code: contract.room_code,
    building_id: contract.building_id,
    building_name: contract.building_name,
    month,
    items,
    total: items.reduce((sum, item) => sum + item.amount, 0)
  };
};
