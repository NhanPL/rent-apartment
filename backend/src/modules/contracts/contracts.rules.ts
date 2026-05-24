import { PoolClient } from 'pg';

import { AppError } from '../../shared/errors/app-error';

export const CURRENT_CONTRACT_STATUS = 'ACTIVE';

interface RoomRuleOptions {
  roomId: string;
  managerId?: string;
}

interface ActiveContractRoomOptions extends RoomRuleOptions {
  excludeContractId?: string;
  requestedOccupants?: number;
}

export interface ContractRoomRuleRow {
  id: string;
  building_id: string;
  max_occupants: number;
}

export const getContractRoomForManager = async (
  client: Pick<PoolClient, 'query'>,
  { roomId, managerId }: RoomRuleOptions
): Promise<ContractRoomRuleRow> => {
  const result = await client.query<ContractRoomRuleRow>(
    managerId
      ? `SELECT r.id, r.building_id, r.max_occupants
         FROM room r
         JOIN building b ON b.id=r.building_id
         WHERE r.id=$1 AND b.manager_user_id=$2
         LIMIT 1`
      : `SELECT id, building_id, max_occupants
         FROM room
         WHERE id=$1
         LIMIT 1`,
    managerId ? [roomId, managerId] : [roomId]
  );

  const room = result.rows[0];
  if (!room) {
    throw new AppError(400, 'Selected room does not exist', 'ROOM_NOT_FOUND');
  }

  return room;
};

export const assertRoomCanHostActiveContract = async (
  client: Pick<PoolClient, 'query'>,
  options: ActiveContractRoomOptions
): Promise<ContractRoomRuleRow> => {
  const room = await getContractRoomForManager(client, options);

  const params: unknown[] = [options.roomId, CURRENT_CONTRACT_STATUS];
  const excludeClause = options.excludeContractId ? 'AND id <> $3' : '';
  if (options.excludeContractId) params.push(options.excludeContractId);

  const activeContract = await client.query<{ id: string }>(
    `SELECT id
     FROM contract
     WHERE room_id=$1 AND status=$2 ${excludeClause}
     LIMIT 1`,
    params
  );

  if (activeContract.rows[0]) {
    throw new AppError(409, 'Selected room already has an active contract', 'ROOM_ALREADY_OCCUPIED');
  }

  const requestedOccupants = options.requestedOccupants ?? 0;
  if (requestedOccupants > Number(room.max_occupants)) {
    throw new AppError(409, 'Selected room does not have enough capacity', 'ROOM_MAX_OCCUPANTS_EXCEEDED');
  }

  return room;
};
