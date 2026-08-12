import { PoolClient } from 'pg';
import { withTransaction } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { recordTenantPrivacyConsent } from './tenant-privacy.service';
import {
  createActivationInvitation,
  deliverActivationInvitation
} from '../auth/account-activation.service';
import { assertRoomCanHostActiveContract, CURRENT_CONTRACT_STATUS, getContractRoomForManager } from '../contracts/contracts.rules';
import { createTenantRecord, createTenantUserAccount, findTenantByIdentityNumber, TenantInsertPayload } from './tenants.repository';
import type { ContractStatus } from '../../shared/types/database';
import { logger } from '../../shared/services/logger.service';

export type CreateTenantInput = Omit<TenantInsertPayload, 'manager_user_id'>;

export interface TenantCreateInputDto {
  full_name: string;
  phone: string;
  identity_number: string;
  email: string;
  dob?: string | null;
  gender?: string | null;
  identity_issued_date?: string | null;
  identity_issued_place?: string | null;
  permanent_address?: string | null;
  status?: CreateTenantInput['status'];
  note?: string | null;
}

export interface TenantContractInputDto {
  building_id?: string | null;
  room_id: string;
  status?: ContractStatus;
  start_date: string;
  end_date?: string | null;
  move_in_date?: string | null;
  move_out_date?: string | null;
  rent_price?: number | null;
  deposit_amount?: number | null;
  billing_day?: number | null;
  note?: string | null;
}

interface TenantCreationMetadata {
  contract?: TenantContractInputDto | null;
  privacy_consent: true;
  privacy_policy_version?: string;
}

export type CreateTenantCommand =
  | (TenantCreateInputDto & TenantCreationMetadata)
  | (TenantCreationMetadata & { tenant: TenantCreateInputDto });

export interface CreateTenantResult {
  tenantId: string;
  userId: string;
  emailSent: boolean;
}

export interface TenantContractPayload {
  building_id: string | null;
  room_id: string;
  status: ContractStatus;
  start_date: string;
  end_date: string | null;
  move_in_date: string | null;
  move_out_date: string | null;
  rent_price: number;
  deposit_amount: number;
  billing_day: number;
  note: string | null;
}

const validateCreateInput = (input: TenantCreateInputDto): CreateTenantInput => {
  if (!input.full_name || !input.phone || !input.identity_number || !input.email) {
    throw new AppError(400, 'full_name, phone, identity_number, email are required', 'VALIDATION_ERROR');
  }

  return {
    full_name: String(input.full_name),
    phone: String(input.phone),
    identity_number: String(input.identity_number),
    email: String(input.email),
    dob: (input.dob as string | null | undefined) ?? null,
    gender: (input.gender as string | null | undefined) ?? null,
    identity_issued_date: (input.identity_issued_date as string | null | undefined) ?? null,
    identity_issued_place: (input.identity_issued_place as string | null | undefined) ?? null,
    permanent_address: (input.permanent_address as string | null | undefined) ?? null,
    status: ((input.status as CreateTenantInput['status'] | undefined) ?? 'ACTIVE'),
    note: (input.note as string | null | undefined) ?? null
  };
};

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
};

const toRequiredString = (value: unknown, fieldName: string): string => {
  const parsed = toNullableString(value);
  if (!parsed) throw new AppError(400, `${fieldName} is required for contract`, 'VALIDATION_ERROR');
  return parsed;
};

const toNonNegativeNumber = (value: unknown, fieldName: string): number => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    throw new AppError(400, `${fieldName} must be a valid number`, 'VALIDATION_ERROR');
  }
  if (parsed < 0) {
    throw new AppError(400, `${fieldName} cannot be negative`, 'VALIDATION_ERROR');
  }
  return parsed;
};

const toBillingDay = (value: unknown): number => {
  const parsed = Number(value ?? 1);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 28) {
    throw new AppError(400, 'billing_day must be between 1 and 28', 'VALIDATION_ERROR');
  }
  return parsed;
};

const toContractStatus = (value: unknown): TenantContractPayload['status'] => {
  const parsed = String(value ?? 'DRAFT');
  if (!['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'].includes(parsed)) {
    throw new AppError(400, 'Invalid contract status', 'VALIDATION_ERROR');
  }
  return parsed as TenantContractPayload['status'];
};

export const normalizeTenantContractInput = (input: TenantContractInputDto): TenantContractPayload => ({
  building_id: toNullableString(input.building_id),
  room_id: toRequiredString(input.room_id, 'room_id'),
  status: toContractStatus(input.status),
  start_date: toRequiredString(input.start_date, 'start_date'),
  end_date: toNullableString(input.end_date),
  move_in_date: toNullableString(input.move_in_date),
  move_out_date: toNullableString(input.move_out_date),
  rent_price: toNonNegativeNumber(input.rent_price, 'rent_price'),
  deposit_amount: toNonNegativeNumber(input.deposit_amount, 'deposit_amount'),
  billing_day: toBillingDay(input.billing_day),
  note: toNullableString(input.note)
});

export const validateTenantContractRoom = async (
  client: PoolClient,
  payload: TenantContractPayload,
  managerId?: string,
  excludeContractId?: string
): Promise<void> => {
  const room = payload.status === CURRENT_CONTRACT_STATUS
    ? await assertRoomCanHostActiveContract(client, {
      roomId: payload.room_id,
      managerId,
      excludeContractId,
      requestedOccupants: 1
    })
    : await getContractRoomForManager(client, { roomId: payload.room_id, managerId });

  if (payload.building_id && room.building_id !== payload.building_id) {
    throw new AppError(400, 'Selected room does not belong to selected building', 'ROOM_BUILDING_MISMATCH');
  }
};

const generateContractCode = async (client: PoolClient): Promise<string> => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 5; i += 1) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `CONTRACT-${datePart}-${random}`;
    const exists = await client.query<{ exists: 1 }>('SELECT 1 FROM contract WHERE contract_code = $1 LIMIT 1', [code]);
    if (exists.rows.length === 0) return code;
  }
  throw new AppError(500, 'Cannot generate contract code', 'CONTRACT_CODE_ERROR');
};

export const createTenantContract = async (
  client: PoolClient,
  tenantId: string,
  contractInput: TenantContractInputDto,
  managerId: string
): Promise<{ id: string }> => {
  const payload = normalizeTenantContractInput(contractInput);
  await validateTenantContractRoom(client, payload, managerId);

  const code = await generateContractCode(client);
  const contractRs = await client.query<{
    id: string;
    room_id: string;
    contract_code: string;
    status: TenantContractPayload['status'];
    start_date: string;
    end_date: string | null;
    rent_price: number | string;
    deposit_amount: number | string;
    billing_day: number;
  }>(
    `INSERT INTO contract(room_id,contract_code,status,start_date,end_date,move_in_date,move_out_date,rent_price,deposit_amount,billing_day,note)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, room_id, contract_code, status, start_date, end_date,
               rent_price, deposit_amount, billing_day`,
    [
      payload.room_id,
      code,
      payload.status,
      payload.start_date,
      payload.end_date,
      payload.move_in_date,
      payload.move_out_date,
      payload.rent_price,
      payload.deposit_amount,
      payload.billing_day,
      payload.note
    ]
  );

  await client.query(
    'INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at,left_at) VALUES($1,$2,true,$3,null)',
    [contractRs.rows[0].id, tenantId, payload.start_date]
  );

  await writeAuditLog(client, {
    actorUserId: managerId,
    action: 'CONTRACT_CREATED',
    entityType: 'CONTRACT',
    entityId: contractRs.rows[0].id,
    after: {
      roomId: contractRs.rows[0].room_id,
      contractCode: contractRs.rows[0].contract_code,
      status: contractRs.rows[0].status,
      startDate: contractRs.rows[0].start_date,
      endDate: contractRs.rows[0].end_date,
      rentPrice: contractRs.rows[0].rent_price,
      depositAmount: contractRs.rows[0].deposit_amount,
      billingDay: contractRs.rows[0].billing_day
    },
    metadata: { source: 'TENANT_FORM', tenantId }
  });

  return contractRs.rows[0];
};

export const createTenant = async (raw: CreateTenantCommand, managerId: string): Promise<CreateTenantResult> => {
  const tenantPayload = validateCreateInput('tenant' in raw ? raw.tenant : raw);
  const contractPayload = raw.contract ?? null;

  const { tenantId, userId, loginEmail, username, tenantName, invitation } = await withTransaction(async (client) => {
    const existing = await findTenantByIdentityNumber(client, tenantPayload.identity_number);
    if (existing) {
      throw new AppError(400, 'Tenant already exists', 'TENANT_ALREADY_EXISTS');
    }

    const tenant = await createTenantRecord(client, { ...tenantPayload, manager_user_id: managerId });
    if (raw.privacy_consent !== true) {
      throw new AppError(400, 'Tenant privacy consent must be recorded', 'PRIVACY_CONSENT_REQUIRED');
    }
    await recordTenantPrivacyConsent(
      client,
      tenant.id,
      managerId,
      true,
      typeof raw.privacy_policy_version === 'string' ? raw.privacy_policy_version : undefined
    );
    const tenantEmail = tenantPayload.email;
    if (!tenantEmail) {
      throw new AppError(400, 'email is required', 'VALIDATION_ERROR');
    }
    const username = tenantEmail;
    const user = await createTenantUserAccount(client, {
      email: tenantEmail,
      username,
      tenantId: tenant.id
    });
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'TENANT_ACCOUNT_CREATED',
      entityType: 'APP_USER',
      entityId: user.id,
      metadata: {
        tenantId: tenant.id,
        accountStatus: 'PENDING_ACTIVATION'
      }
    });
    const invitation = await createActivationInvitation(
      client,
      user.id,
      managerId,
      'TENANT_CREATED'
    );
    if (contractPayload) {
      await createTenantContract(client, tenant.id, contractPayload, managerId);
    }

    return {
      tenantId: tenant.id,
      userId: user.id,
      loginEmail: user.email,
      username: user.username,
      tenantName: tenant.full_name,
      invitation
    };
  });

  let emailSent = false;
  try {
    emailSent = await deliverActivationInvitation({
      userId,
      actorUserId: managerId,
      tenantName,
      email: loginEmail,
      username,
      invitation,
      source: 'TENANT_CREATED',
      locale: 'en'
    });
  } catch (error) {
    logger.error({
      tenantId,
      userId,
      error
    }, 'Failed to send tenant activation email');
  }

  return { tenantId, userId, emailSent };
};
