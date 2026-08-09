import { withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { getContractBusinessStage } from '../contracts/business-stage';
import { maskIdentityNumber, recordTenantPrivacyConsent } from '../tenants/tenant-privacy.service';
import * as repository from './rental-registration.repository';

export interface TenantDraftInput {
  full_name: string;
  phone: string;
  identity_number: string;
  email?: string | null;
  dob?: string | null;
  gender?: string | null;
  identity_issued_date?: string | null;
  identity_issued_place?: string | null;
  permanent_address?: string | null;
  note?: string | null;
  privacy_consent: true;
  privacy_policy_version?: string;
}

export interface ReserveInput {
  room_id: string;
  tenant_id?: string;
  tenant?: TenantDraftInput;
  start_date: string;
  end_date?: string | null;
  rent_price: number;
  deposit_amount: number;
  billing_day: number;
  note?: string | null;
}

export interface HandoverInput {
  move_in_date: string;
  electricity_curr: number;
  water_curr: number;
  persons_count: number;
  vehicles_count: number;
  note?: string | null;
}

export interface CancelInput {
  reason: string;
  cancel_date?: string;
}

const generateContractCode = async (client: repository.RentalRegistrationClient): Promise<string> => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `CONTRACT-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await repository.contractCodeExists(client, code))) return code;
  }
  throw new AppError(500, 'Unable to generate unique contract code', 'CONTRACT_CODE_ERROR');
};

const requireScopedContract = async (
  client: repository.RentalRegistrationClient,
  contractId: string,
  managerId: string,
  lock = false
) => {
  const contract = await repository.findScopedContract(client, contractId, managerId, lock);
  if (!contract) throw new AppError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  return contract;
};

const assertRoomAvailable = async (
  client: repository.RentalRegistrationClient,
  roomId: string,
  managerId: string,
  excludeContractId?: string
) => {
  const room = await repository.findRoomForUpdate(client, roomId, managerId);
  if (!room) throw new AppError(404, 'Room not found', 'ROOM_NOT_FOUND');
  if (room.status !== 'ACTIVE') throw new AppError(409, 'Room is not available for reservation', 'ROOM_NOT_AVAILABLE');
  if (await repository.findRoomOccupyingContract(client, roomId, excludeContractId)) {
    throw new AppError(409, 'Selected room has a current or future occupant', 'ROOM_ALREADY_OCCUPIED');
  }
  return room;
};

const assertTenantAvailable = async (
  client: repository.RentalRegistrationClient,
  tenantId: string,
  managerId: string
) => {
  const tenant = await repository.findTenantForUpdate(client, tenantId, managerId);
  if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  if (await repository.findTenantCurrentRegistration(client, tenantId)) {
    throw new AppError(409, 'Tenant has a current or future rental registration', 'TENANT_NOT_AVAILABLE');
  }
};

export const getAvailableRooms = (managerId: string, buildingId?: string) => (
  repository.listAvailableRooms(managerId, buildingId)
);

export const getAvailableTenants = async (managerId: string) => (
  await repository.listAvailableTenants(managerId)
).map((tenant) => ({ ...tenant, identity_number: maskIdentityNumber(tenant.identity_number) }));

export const reserveRoom = async (payload: ReserveInput, managerId: string) => withTransaction(async (client) => {
  await assertRoomAvailable(client, payload.room_id, managerId);
  let tenantId = payload.tenant_id;

  if (tenantId) {
    await assertTenantAvailable(client, tenantId, managerId);
  } else if (payload.tenant) {
    if (await repository.findDuplicateTenant(client, managerId, payload.tenant.phone, payload.tenant.identity_number)) {
      throw new AppError(409, 'Tenant phone or identity number already exists', 'TENANT_DUPLICATE');
    }
    const tenant = await repository.insertTenant(client, managerId, payload.tenant);
    tenantId = tenant.id;
    await recordTenantPrivacyConsent(
      client,
      tenantId,
      managerId,
      true,
      payload.tenant.privacy_policy_version
    );
  }

  if (!tenantId) throw new AppError(400, 'tenant_id or tenant is required', 'VALIDATION_ERROR');
  const code = await generateContractCode(client);
  const contract = await repository.insertDraftContract(
    client,
    payload,
    code,
    `[RR_STAGE=RESERVED] ${payload.note ?? ''}`.trim()
  );
  await repository.insertPrimaryTenant(client, contract.id, tenantId, payload.start_date);
  await writeAuditLog(client, {
    actorUserId: managerId,
    action: 'CONTRACT_CREATED',
    entityType: 'CONTRACT',
    entityId: contract.id,
    after: {
      roomId: contract.room_id,
      contractCode: contract.contract_code,
      status: contract.status,
      startDate: contract.start_date,
      endDate: contract.end_date,
      rentPrice: contract.rent_price,
      depositAmount: contract.deposit_amount,
      billingDay: contract.billing_day
    },
    metadata: { source: 'RENTAL_REGISTRATION', tenantId }
  });
  return { ...contract, tenant_id: tenantId, business_stage: getContractBusinessStage(contract) };
});

export const handoverRental = async (contractId: string, payload: HandoverInput, managerId: string) => (
  withTransaction(async (client) => {
    const contract = await requireScopedContract(client, contractId, managerId, true);
    if (contract.status === 'ACTIVE') return { ...contract, business_stage: 'ACTIVE' };
    if (contract.status !== 'DRAFT') throw new AppError(409, 'Only draft contracts can be handed over', 'CONTRACT_NOT_DRAFT');
    await assertRoomAvailable(client, contract.room_id, managerId, contract.id);

    const tenants = await repository.listActiveContractTenants(client, contract.id);
    if (tenants.length === 0) throw new AppError(409, 'Contract must have at least one tenant', 'CONTRACT_TENANT_REQUIRED');
    if (tenants.length > Number(contract.max_occupants)) throw new AppError(409, 'Room max occupants exceeded', 'ROOM_MAX_OCCUPANTS_EXCEEDED');
    if (tenants.some((tenant) => tenant.status === 'BLACKLIST')) throw new AppError(409, 'Blacklisted tenants cannot be activated', 'TENANT_BLACKLISTED');
    if (await repository.findOtherActiveTenantContract(client, contract.id, tenants.map((tenant) => tenant.id))) {
      throw new AppError(409, 'Tenant already has another active contract', 'TENANT_HAS_ACTIVE_CONTRACT');
    }

    const month = `${payload.move_in_date.slice(0, 7)}-01`;
    await repository.upsertHandoverReading(
      client,
      contract.room_id,
      month,
      payload.electricity_curr,
      payload.water_curr,
      managerId,
      payload.note ?? 'Initial handover reading'
    );
    await repository.upsertRoomMonthExtra(
      client,
      contract.room_id,
      month,
      payload.persons_count,
      payload.vehicles_count,
      managerId,
      payload.note ?? null
    );
    const updated = await repository.activateContract(
      client,
      contract.id,
      payload.move_in_date,
      payload.note ? `Handover: ${payload.note}` : null
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'CONTRACT_ACTIVATED',
      entityType: 'CONTRACT',
      entityId: contract.id,
      before: { status: contract.status, moveInDate: contract.move_in_date },
      after: { status: updated.status, moveInDate: updated.move_in_date },
      metadata: { source: 'RENTAL_HANDOVER' }
    });
    return { ...updated, business_stage: 'ACTIVE' };
  })
);

export const cancelRental = async (contractId: string, payload: CancelInput, managerId: string) => {
  const closeDate = payload.cancel_date ?? new Date().toISOString().slice(0, 10);
  return withTransaction(async (client) => {
    const contract = await requireScopedContract(client, contractId, managerId, true);
    if (contract.status === 'ACTIVE') throw new AppError(409, 'Active contracts should be ended instead of cancelled', 'CONTRACT_ACTIVE');
    if (contract.status === 'ENDED') throw new AppError(409, 'Ended contracts cannot be cancelled', 'CONTRACT_ENDED');
    if (contract.status === 'CANCELLED') return { ...contract, business_stage: 'CANCELLED' };
    const updated = await repository.cancelContract(client, contract.id, closeDate, payload.reason);
    await repository.closeContractTenants(client, contract.id, closeDate);
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'CONTRACT_CANCELLED',
      entityType: 'CONTRACT',
      entityId: contract.id,
      before: { status: contract.status, moveOutDate: contract.move_out_date },
      after: { status: updated.status, moveOutDate: updated.move_out_date },
      metadata: { source: 'RENTAL_REGISTRATION', reason: payload.reason }
    });
    return { ...updated, business_stage: 'CANCELLED' };
  });
};
