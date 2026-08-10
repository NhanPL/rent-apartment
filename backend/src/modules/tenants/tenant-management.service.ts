import { z } from 'zod';
import { tenantQuery as query, withTenantTransaction as withTransaction } from './tenants.repository';
import { AppError } from '../../shared/errors/app-error';
import { CURRENT_CONTRACT_STATUS } from '../contracts/contracts.rules';
import { resendTenantActivation } from '../auth/account-activation.service';
import { revokeUserSessions } from '../auth/session.service';
import {
  createTenant as createTenantService,
  createTenantContract,
  normalizeTenantContractInput,
  validateTenantContractRoom,
  type TenantContractInputDto
} from './tenants.service';
import { assertTenantBelongsToManager } from './tenants.repository';
import {
  cloudinaryDeliveryTypeValues,
  normalizeStoredUpload
} from '../uploads/uploads.service';
import {
  processCloudinaryAssetJobs
} from '../documents/document-asset-jobs.service';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { logger } from '../../shared/services/logger.service';
import {
  mapTenantIdentityDocuments,
  updateTenantIdentityDocuments,
  type TenantIdentityDocumentRow
} from './tenant-identity-documents.service';
import {
  getTenantDataExport,
  maskIdentityNumber,
  requestTenantErasure
} from './tenant-privacy.service';
import {
  CONTRACT_STATUSES,
  TENANT_WRITABLE_STATUSES,
  type AccountStatus,
  type ContractStatus,
  type DatabaseDate,
  type DatabaseNumeric,
  type DatabaseTimestamp,
  type InvoiceStatus,
  type PaymentEntryType,
  type PaymentStatus,
  type TenantStatus
} from '../../shared/types/database';

const db = { query };

interface TenantListRow {
  id: string;
  user_id: string | null;
  full_name: string;
  dob: DatabaseDate | null;
  gender: string | null;
  identity_number: string;
  identity_issued_date: DatabaseDate | null;
  identity_issued_place: string | null;
  email: string | null;
  phone: string;
  permanent_address: string | null;
  status: TenantStatus;
  note: string | null;
  manager_user_id: string;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
  room_id: string | null;
  room_code: string | null;
  building_id: string | null;
  building_name: string | null;
  contract_id: string | null;
  start_date: DatabaseDate | null;
  contract_status: ContractStatus | null;
  account_status: AccountStatus | null;
}

interface CountRow {
  total: number;
}

interface TenantDeleteRow {
  id: string;
  user_id: string | null;
  status: TenantStatus;
  privacy_erasure_requested_at: DatabaseTimestamp | null;
  privacy_erasure_eligible_at: DatabaseTimestamp | null;
  anonymized_at: DatabaseTimestamp | null;
  account_status: string | null;
  account_is_active: boolean | null;
}

interface TenantUpdateScopeRow {
  id: string;
  user_id: string | null;
  account_email: string | null;
  account_status: AccountStatus | null;
}

interface TenantContractManagementRow {
  id: string;
  contract_id: string;
  room_id: string;
  contract_code: string | null;
  status: ContractStatus;
  start_date: DatabaseDate;
  end_date: DatabaseDate | null;
  move_in_date: DatabaseDate | null;
  move_out_date: DatabaseDate | null;
  rent_price: DatabaseNumeric;
  deposit_amount: DatabaseNumeric;
  billing_day: number;
  note: string | null;
  joined_at: DatabaseDate;
}

interface TenantInvoiceManagementRow {
  id: string;
  contract_id: string;
  room_id: string;
  utility_reading_id: string | null;
  month: DatabaseDate;
  status: InvoiceStatus;
  issued_at: DatabaseTimestamp | null;
  due_date: DatabaseDate | null;
  subtotal: DatabaseNumeric;
  discount: DatabaseNumeric;
  total: DatabaseNumeric;
  contract_code: string;
  room_code: string;
  building_name: string;
}

interface TenantPaymentManagementRow {
  id: string;
  invoice_id: string;
  payment_request_id: string | null;
  payment_proof_id: string | null;
  status: PaymentStatus;
  amount: DatabaseNumeric;
  paid_at: DatabaseTimestamp | null;
  entry_type: PaymentEntryType;
  signed_amount: DatabaseNumeric;
  month: DatabaseDate;
  invoice_total: DatabaseNumeric;
  invoice_status: InvoiceStatus;
  due_date: DatabaseDate | null;
}

interface TenantContractExportRow {
  tenant_name: string;
  phone: string;
  email: string | null;
  identity_number: string;
  permanent_address: string | null;
  contract_code: string;
  start_date: DatabaseDate;
  end_date: DatabaseDate | null;
  rent_price: DatabaseNumeric;
  deposit_amount: DatabaseNumeric;
  billing_day: number;
  contract_note: string | null;
  room_code: string;
  floor: number | null;
  area_m2: DatabaseNumeric | null;
  building_name: string;
  address: string;
}

const tenantContractColumns = `id, room_id, contract_code, status, start_date, end_date,
  move_in_date, move_out_date, rent_price, deposit_amount, billing_day, note, created_at, updated_at`;
const tenantColumnNames = [
  'id', 'user_id', 'manager_user_id', 'full_name', 'dob', 'gender', 'identity_number',
  'identity_issued_date', 'identity_issued_place', 'email', 'phone', 'permanent_address',
  'status', 'note', 'privacy_erasure_requested_at', 'privacy_erasure_eligible_at',
  'anonymized_at', 'created_at', 'updated_at'
] as const;
const tenantColumns = (alias?: string) => tenantColumnNames
  .map((column) => alias ? `${alias}.${column}` : column)
  .join(', ');
const contractColumns = (alias: string) => `
  ${alias}.id, ${alias}.room_id, ${alias}.contract_code, ${alias}.status, ${alias}.start_date,
  ${alias}.end_date, ${alias}.move_in_date, ${alias}.move_out_date, ${alias}.rent_price,
  ${alias}.deposit_amount, ${alias}.billing_day, ${alias}.note, ${alias}.created_at, ${alias}.updated_at`;
const invoiceColumns = (alias: string) => `
  ${alias}.id, ${alias}.contract_id, ${alias}.room_id, ${alias}.utility_reading_id, ${alias}.month,
  ${alias}.status, ${alias}.issued_at, ${alias}.due_date, ${alias}.note, ${alias}.subtotal,
  ${alias}.discount, ${alias}.total, ${alias}.void_reason, ${alias}.voided_at,
  ${alias}.replaces_invoice_id, ${alias}.created_at, ${alias}.updated_at`;
const paymentColumns = (alias: string) => `
  ${alias}.id, ${alias}.invoice_id, ${alias}.payment_request_id, ${alias}.payment_proof_id,
  ${alias}.method, ${alias}.status, ${alias}.amount, ${alias}.paid_at, ${alias}.reference_code,
  ${alias}.note, ${alias}.created_by_user_id, ${alias}.entry_type, ${alias}.original_payment_id,
  ${alias}.reversal_reason, ${alias}.idempotency_key, ${alias}.created_at, ${alias}.updated_at`;

const nullableString = z.string().trim().nullable().optional();
const tenantWritableStatusSchema = z.enum(TENANT_WRITABLE_STATUSES);
export const tenantAccountStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DISABLED'])
}).strict();
export const tenantListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().max(200).default(''),
  status: tenantWritableStatusSchema.optional(),
  building_id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional()
});

const tenantContractSchema = z.object({
  building_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  start_date: z.string().trim().min(1),
  end_date: nullableString,
  move_in_date: nullableString,
  move_out_date: nullableString,
  rent_price: z.coerce.number().nonnegative().nullable().optional(),
  deposit_amount: z.coerce.number().nonnegative().nullable().optional(),
  billing_day: z.coerce.number().int().min(1).max(28).nullable().optional(),
  note: nullableString
});

const tenantCreatePayloadSchema = z.object({
  full_name: z.string().trim().min(1),
  dob: nullableString,
  gender: nullableString,
  identity_number: z.string().trim().min(1),
  identity_issued_date: nullableString,
  identity_issued_place: nullableString,
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  permanent_address: nullableString,
  status: tenantWritableStatusSchema.optional(),
  note: nullableString
});

const tenantUpdatePayloadSchema = tenantCreatePayloadSchema.partial().extend({
  email: z.string().trim().email().nullable().optional()
});

const identityDocumentFileSchema = z.object({
  file_name: z.string().trim().min(1),
  file_url: z.string().trim().url(),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  file_size: z.coerce.number().int().positive(),
  resource_type: z.literal('image').optional(),
  public_id: z.string().trim().min(1).optional(),
  asset_id: z.string().trim().min(1).optional(),
  version: z.coerce.number().int().positive().optional(),
  format: z.string().trim().min(1).max(20).optional(),
  delivery_type: z.enum(cloudinaryDeliveryTypeValues).optional()
});

export const identityDocumentUpdateSchema = z.object({
  front: identityDocumentFileSchema.nullable().optional(),
  back: identityDocumentFileSchema.nullable().optional()
}).refine(
  (value) => Object.prototype.hasOwnProperty.call(value, 'front') || Object.prototype.hasOwnProperty.call(value, 'back'),
  { message: 'At least one identity document change is required' }
);

export const tenantCreateSchema = z.union([
  tenantCreatePayloadSchema.extend({
    contract: tenantContractSchema.nullable().optional(),
    privacy_consent: z.literal(true),
    privacy_policy_version: z.string().trim().min(1).max(40).optional()
  }),
  z.object({
    tenant: tenantCreatePayloadSchema,
    contract: tenantContractSchema.nullable().optional(),
    privacy_consent: z.literal(true),
    privacy_policy_version: z.string().trim().min(1).max(40).optional()
  })
]);

export const tenantPatchSchema = z.union([
  z.object({
    tenant: tenantUpdatePayloadSchema,
    contract: tenantContractSchema.nullable().optional()
  }).strict(),
  tenantUpdatePayloadSchema.extend({
    contract: tenantContractSchema.nullable().optional()
  }).strict()
]);

export type TenantCreateRequest = z.infer<typeof tenantCreateSchema>;
export type TenantPatchRequest = z.infer<typeof tenantPatchSchema>;
type TenantUpdateFields = z.infer<typeof tenantUpdatePayloadSchema>;

const upsertTenantContract = async (client: Parameters<Parameters<typeof withTransaction>[0]>[0], tenantId: string, contractInput: TenantContractInputDto | null, managerId: string) => {
  if (!contractInput) return;

  const payload = normalizeTenantContractInput(contractInput);

  const activeRs = await client.query<TenantContractManagementRow>(
    `SELECT c.id, c.room_id, c.contract_code, c.status, c.start_date::text, c.end_date::text,
            c.move_in_date::text, c.move_out_date::text, c.rent_price, c.deposit_amount,
            c.billing_day, c.note, ct.contract_id, ct.joined_at::text
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     WHERE ct.tenant_id=$1 AND ct.left_at IS NULL AND c.status=$2
     ORDER BY ct.joined_at DESC, c.created_at DESC
     LIMIT 1`,
    [tenantId, CURRENT_CONTRACT_STATUS]
  );

  const current = activeRs.rows[0];
  if (!current) {
    await createTenantContract(client, tenantId, contractInput, managerId);
    return;
  }

  if (current.room_id !== payload.room_id) {
    await validateTenantContractRoom(client, payload, managerId);
    const leftAt = payload.start_date > current.joined_at ? payload.start_date : current.joined_at;
    await client.query(
      'UPDATE contract_tenant SET left_at=$1 WHERE contract_id=$2 AND tenant_id=$3 AND left_at IS NULL',
      [leftAt, current.contract_id, tenantId]
    );
    const ended = await client.query<TenantContractManagementRow>(
      `UPDATE contract
       SET status='ENDED', end_date=COALESCE(end_date, $1), move_out_date=COALESCE(move_out_date, $1)
       WHERE id=$2
       RETURNING ${tenantContractColumns}`,
      [leftAt, current.contract_id]
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'CONTRACT_ENDED',
      entityType: 'CONTRACT',
      entityId: current.contract_id,
      before: { status: current.status, roomId: current.room_id, moveOutDate: current.move_out_date },
      after: { status: ended.rows[0].status, roomId: ended.rows[0].room_id, moveOutDate: ended.rows[0].move_out_date },
      metadata: { source: 'TENANT_ROOM_CHANGE', tenantId }
    });
    await createTenantContract(client, tenantId, contractInput, managerId);
    return;
  }

  await validateTenantContractRoom(client, payload, managerId, current.contract_id);
  const updated = await client.query<TenantContractManagementRow>(
    `UPDATE contract SET room_id=$1,status=$2,start_date=$3,end_date=$4,move_in_date=$5,move_out_date=$6,rent_price=$7,deposit_amount=$8,billing_day=$9,note=$10
     WHERE id=$11
     RETURNING ${tenantContractColumns}`,
    [payload.room_id, payload.status, payload.start_date, payload.end_date, payload.move_in_date, payload.move_out_date, payload.rent_price, payload.deposit_amount, payload.billing_day, payload.note, current.contract_id]
  );
  await client.query(
    'UPDATE contract_tenant SET joined_at=$1 WHERE contract_id=$2 AND tenant_id=$3 AND left_at IS NULL',
    [payload.start_date, current.contract_id, tenantId]
  );
  await writeAuditLog(client, {
    actorUserId: managerId,
    action: payload.status === 'ENDED'
      ? 'CONTRACT_ENDED'
      : payload.status === 'CANCELLED'
        ? 'CONTRACT_CANCELLED'
        : 'CONTRACT_UPDATED',
    entityType: 'CONTRACT',
    entityId: current.contract_id,
    before: {
      status: current.status,
      roomId: current.room_id,
      startDate: current.start_date,
      endDate: current.end_date,
      rentPrice: current.rent_price,
      depositAmount: current.deposit_amount
    },
    after: {
      status: updated.rows[0].status,
      roomId: updated.rows[0].room_id,
      startDate: updated.rows[0].start_date,
      endDate: updated.rows[0].end_date,
      rentPrice: updated.rows[0].rent_price,
      depositAmount: updated.rows[0].deposit_amount
    },
    metadata: { source: 'TENANT_FORM', tenantId }
  });
};

const isUniqueConstraintError = (error: unknown): boolean => (
  Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: string }).code === '23505'
  )
);

export const listManagedTenants = async (
  filters: z.infer<typeof tenantListQuerySchema>,
  managerId: string
) => {
  const { page, pageSize } = filters;
  const offset = (page - 1) * pageSize;

  const search = filters.search;
  const status = filters.status;
  const buildingId = filters.building_id;
  const roomId = filters.room_id;

  const conditions: string[] = [
    `t.manager_user_id=$1`,
    `t.status <> 'DELETED'`
  ];
  const params: unknown[] = [managerId];

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(`(t.full_name ILIKE $${idx} OR t.phone ILIKE $${idx} OR COALESCE(t.email::text,'') ILIKE $${idx} OR t.identity_number ILIKE $${idx} OR COALESCE(v.room_code,'') ILIKE $${idx} OR COALESCE(v.building_name,'') ILIKE $${idx})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (buildingId) {
    params.push(buildingId);
    conditions.push(`v.building_id = $${params.length}`);
  }
  if (roomId) {
    params.push(roomId);
    conditions.push(`v.room_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const currentRentalJoin = `
     LEFT JOIN LATERAL (
       SELECT c.room_id, r.code AS room_code, b.id AS building_id, b.name AS building_name,
              c.id AS contract_id, c.start_date, c.status AS contract_status
       FROM contract_tenant ct
       JOIN contract c ON c.id=ct.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ct.tenant_id=t.id AND ct.left_at IS NULL AND c.status='ACTIVE'
        AND b.manager_user_id=$1
       ORDER BY c.start_date DESC, c.created_at DESC
       LIMIT 1
     ) v ON true`;

  const countRs = await query<CountRow>(
    `SELECT COUNT(*)::int AS total
     FROM tenant t
     ${currentRentalJoin}
     ${whereClause}`,
    params
  );

  params.push(pageSize, offset);

  const dataRs = await query<TenantListRow>(
    `SELECT ${tenantColumns('t')}, v.room_id, v.room_code, v.building_id, v.building_name, v.contract_id, v.start_date,
            v.contract_status, au.account_status
     FROM tenant t
     LEFT JOIN app_user au ON au.id=t.user_id
     ${currentRentalJoin}
     ${whereClause}
     ORDER BY t.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const items = dataRs.rows.map((row) => ({
    ...row,
    identity_number: maskIdentityNumber(row.identity_number),
    current_room: row.room_id
      ? {
          tenant_id: row.id,
          room_id: row.room_id,
          room_code: row.room_code,
          building_id: row.building_id,
          building_name: row.building_name,
          contract_id: row.contract_id,
          start_date: row.start_date,
          contract_status: row.contract_status
        }
      : null
  }));

  return { items, page, pageSize, total: countRs.rows[0]?.total ?? 0 };
};

export const getManagedTenant = async (tenantId: string, managerId: string) => {
  const tenantRs = await query<TenantListRow>(
    `SELECT ${tenantColumns('t')}, au.account_status,
            consent.policy_version AS privacy_policy_version,
            consent.granted AS privacy_consent_granted,
            consent.recorded_at AS privacy_consent_recorded_at
     FROM tenant t
     LEFT JOIN app_user au ON au.id=t.user_id
     LEFT JOIN LATERAL (
       SELECT policy_version, granted, recorded_at
       FROM tenant_privacy_consent
       WHERE tenant_id=t.id
       ORDER BY recorded_at DESC
       LIMIT 1
     ) consent ON true
     WHERE t.id=$1
       AND t.manager_user_id=$2
       AND t.status <> $3`,
    [tenantId, managerId, 'DELETED']
  );
  const tenant = tenantRs.rows[0];
  if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

  const [roomRs, contractRs, documentRs] = await Promise.all([
    query<TenantListRow>(
      `SELECT t.id AS tenant_id, t.full_name, t.phone, t.identity_number,
              c.room_id, r.code AS room_code, b.id AS building_id, b.name AS building_name,
              c.id AS contract_id, c.start_date, c.status AS contract_status
       FROM tenant t
       JOIN contract_tenant ct ON ct.tenant_id=t.id AND ct.left_at IS NULL
       JOIN contract c ON c.id=ct.contract_id AND c.status='ACTIVE'
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE t.id=$1 AND b.manager_user_id=$2
       ORDER BY c.start_date DESC, c.created_at DESC
       LIMIT 1`,
      [tenantId, managerId]
    ),
    query<TenantContractManagementRow>(
      `SELECT ${contractColumns('c')} FROM contract c
       JOIN contract_tenant ct ON ct.contract_id=c.id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE ct.tenant_id=$1 AND ct.left_at IS NULL AND c.status='ACTIVE' AND b.manager_user_id=$2
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [tenantId, managerId]
    ),
    query<TenantIdentityDocumentRow>(
      `SELECT id, tenant_id, doc_type, file_name, file_url, mime_type, file_size, uploaded_at
       FROM tenant_document
       WHERE tenant_id=$1 AND doc_type IN ('IDENTITY_FRONT', 'IDENTITY_BACK')
       ORDER BY uploaded_at DESC, created_at DESC`,
      [tenantId]
    )
  ]);

  return {
    ...tenant,
    current_room: roomRs.rows[0] ?? null,
    current_contract: contractRs.rows[0] ?? null,
    identity_documents: mapTenantIdentityDocuments(documentRs.rows)
  };
};

export const createManagedTenant = async (body: TenantCreateRequest, managerId: string) => (
  createTenantService(body, managerId)
);

export const resendManagedTenantActivation = (tenantId: string, managerId: string) => (
  resendTenantActivation(tenantId, managerId)
);

export const updateManagedTenantAccountStatus = async (
  tenantId: string,
  managerId: string,
  status: 'ACTIVE' | 'DISABLED'
): Promise<{ accountStatus: 'ACTIVE' | 'DISABLED' }> => withTransaction(async (client) => {
  const result = await client.query<{
    user_id: string | null;
    account_status: AccountStatus | null;
    is_active: boolean | null;
    password_configured: boolean;
  }>(
    `SELECT tenant.user_id, app_user.account_status, app_user.is_active,
            (app_user.password_hash IS NOT NULL AND btrim(app_user.password_hash) <> '') AS password_configured
     FROM tenant
     LEFT JOIN app_user ON app_user.id=tenant.user_id
     WHERE tenant.id=$1
       AND tenant.manager_user_id=$2
       AND tenant.status <> 'DELETED'
     FOR UPDATE OF tenant, app_user`,
    [tenantId, managerId]
  );
  const account = result.rows[0];
  if (!account) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  if (!account.user_id || !account.account_status) {
    throw new AppError(409, 'This tenant does not have a login account.', 'TENANT_ACCOUNT_NOT_FOUND');
  }
  if (account.account_status === 'PENDING_ACTIVATION') {
    throw new AppError(
      409,
      'This account is pending activation. Resend the invitation instead.',
      'TENANT_ACCOUNT_PENDING_ACTIVATION'
    );
  }
  if (status === 'ACTIVE' && !account.password_configured) {
    throw new AppError(409, 'The tenant must set a password before the account can be activated.', 'TENANT_ACCOUNT_PASSWORD_REQUIRED');
  }
  if (account.account_status === status) return { accountStatus: status };

  await client.query(
    `UPDATE app_user
     SET account_status=$2,
         is_active=$3,
         session_version=session_version + 1
     WHERE id=$1`,
    [account.user_id, status, status === 'ACTIVE']
  );
  if (status === 'DISABLED') {
    await revokeUserSessions(client, account.user_id, 'ACCOUNT_DISABLED');
  }
  await writeAuditLog(client, {
    actorUserId: managerId,
    action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entityType: 'APP_USER',
    entityId: account.user_id,
    before: { accountStatus: account.account_status, isActive: account.is_active },
    after: { accountStatus: status, isActive: status === 'ACTIVE' },
    metadata: { tenantId, reason: 'MANAGER_ACCOUNT_STATUS_CHANGE' }
  });
  return { accountStatus: status };
});

export const updateManagedTenant = async (
  tenantId: string,
  body: TenantPatchRequest,
  managerId: string
) => {
  const tenantPayload: TenantUpdateFields = 'tenant' in body ? body.tenant : body;
  const allowed: Array<keyof TenantUpdateFields> = ['full_name', 'dob', 'gender', 'identity_number', 'identity_issued_date', 'identity_issued_place', 'email', 'phone', 'permanent_address', 'status', 'note'];
  const entries = allowed.filter((field) => Object.prototype.hasOwnProperty.call(tenantPayload, field) && tenantPayload[field] !== undefined);
  const contractPayload = body.contract ?? null;
  if (entries.length === 0 && !contractPayload) throw new AppError(400, 'No fields to update', 'VALIDATION_ERROR');

  const params: unknown[] = [];
  const sets = entries.map((field) => {
    params.push(tenantPayload[field] ?? null);
    return `${field}=$${params.length}`;
  });
  params.push(tenantId);
  params.push(managerId);
  const idParam = params.length - 1;
  const managerParam = params.length;
  const scopedTenantWhere = `id=$${idParam}
    AND manager_user_id=$${managerParam}
    AND status <> 'DELETED'
  `;

  let result: TenantListRow;
  try {
    result = await withTransaction<TenantListRow>(async (client) => {
      const currentTenantRs = await client.query<TenantUpdateScopeRow>(
        `SELECT tenant.id, tenant.user_id, app_user.email::text AS account_email,
                app_user.account_status
         FROM tenant
         LEFT JOIN app_user ON app_user.id=tenant.user_id
         WHERE tenant.id=$1
           AND tenant.manager_user_id=$2
           AND tenant.status <> 'DELETED'
         FOR UPDATE OF tenant`,
        [tenantId, managerId]
      );
      const currentTenant = currentTenantRs.rows[0];
      if (!currentTenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

      if (tenantPayload.status === 'MOVED_OUT') {
        const activeContract = await client.query<{ id: string }>(
          `SELECT c.id
           FROM contract_tenant ct
           JOIN contract c ON c.id=ct.contract_id
           WHERE ct.tenant_id=$1
             AND ct.left_at IS NULL
             AND c.status='ACTIVE'
           LIMIT 1`,
          [tenantId]
        );
        if (activeContract.rows[0]) {
          throw new AppError(409, 'End active contract before marking tenant as moved out', 'TENANT_HAS_ACTIVE_CONTRACT');
        }
      }

      if (Object.prototype.hasOwnProperty.call(tenantPayload, 'email') && currentTenant.user_id) {
        const nextEmail = String(tenantPayload.email ?? '').trim();
        if (!nextEmail) {
          throw new AppError(
            400,
            'Email is required while the tenant has a login account.',
            'TENANT_EMAIL_REQUIRED'
          );
        }

        const emailChanged = nextEmail.toLocaleLowerCase() !== currentTenant.account_email?.toLocaleLowerCase();
        if (emailChanged) {
          await client.query(
            `UPDATE app_user
             SET email=$1,
                 username=CASE WHEN username=email THEN $1 ELSE username END
             WHERE id=$2`,
            [nextEmail, currentTenant.user_id]
          );

          if (currentTenant.account_status === 'PENDING_ACTIVATION') {
            await client.query(
              `UPDATE account_activation_token
               SET revoked_at=now()
               WHERE user_id=$1
                 AND used_at IS NULL
                 AND revoked_at IS NULL`,
              [currentTenant.user_id]
            );
          }
        }
      }

      const updated =
        entries.length > 0
          ? await client.query<TenantListRow>(
            `UPDATE tenant SET ${sets.join(',')} WHERE ${scopedTenantWhere} RETURNING ${tenantColumns()}`,
            params
          )
          : await client.query<TenantListRow>(
            `SELECT ${tenantColumns()} FROM tenant
             WHERE ${scopedTenantWhere}`,
            params
          );
      if (!updated.rows[0]) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
      await upsertTenantContract(client, tenantId, contractPayload, managerId);
      return updated.rows[0];
    });
  } catch (error) {
    if (error instanceof AppError || isUniqueConstraintError(error)) throw error;
    logger.error({
      tenantId,
      managerId,
      error
    }, 'Failed to update tenant');
    throw new AppError(
      500,
      'Unable to update tenant information. Please try again.',
      'TENANT_UPDATE_FAILED'
    );
  }
  return result;
};

export const updateManagedTenantIdentityDocuments = async (
  tenantId: string,
  body: z.infer<typeof identityDocumentUpdateSchema>,
  managerId: string
) => {
  const normalizeDocument = (document: NonNullable<typeof body.front>) => {
    const asset = normalizeStoredUpload('TENANT_DOCUMENT', document, 'MANAGER', managerId);
    return {
      ...document,
      public_id: asset.publicId,
      asset_id: asset.assetId ?? undefined,
      resource_type: asset.resourceType,
      version: asset.version ?? undefined,
      format: asset.format ?? undefined,
      delivery_type: asset.deliveryType
    };
  };
  const updates = {
    ...(Object.prototype.hasOwnProperty.call(body, 'front') && {
      front: body.front ? normalizeDocument(body.front) : null
    }),
    ...(Object.prototype.hasOwnProperty.call(body, 'back') && {
      back: body.back ? normalizeDocument(body.back) : null
    })
  };

  const documents = await updateTenantIdentityDocuments(
    tenantId,
    managerId,
    managerId,
    updates
  );
  return documents;
};

export const deleteManagedTenant = async (tenantId: string, managerId: string) => {
  const result = await withTransaction(async (client) => {
    const tenantRs = await client.query<TenantDeleteRow>(
      `SELECT tenant.id, tenant.user_id, tenant.status,
              tenant.privacy_erasure_requested_at,
              tenant.privacy_erasure_eligible_at,
              tenant.anonymized_at,
              app_user.account_status,
              app_user.is_active AS account_is_active
       FROM tenant
       LEFT JOIN app_user ON app_user.id=tenant.user_id
       WHERE tenant.id=$1
         AND tenant.manager_user_id=$2
         AND tenant.status <> $3
       FOR UPDATE OF tenant`,
      [tenantId, managerId, 'DELETED']
    );
    const tenant = tenantRs.rows[0];
    if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

    const activeAssignmentRs = await client.query<{ id: string }>(
      `SELECT c.id
       FROM contract_tenant ct
       JOIN contract c ON c.id=ct.contract_id
       WHERE ct.tenant_id=$1
         AND ct.left_at IS NULL
         AND c.status='ACTIVE'
       LIMIT 1`,
      [tenant.id]
    );
    if (activeAssignmentRs.rows[0]) {
      throw new AppError(400, 'Không thể xóa người thuê đang có hợp đồng hoặc phòng đang thuê', 'TENANT_HAS_ACTIVE_CONTRACT');
    }

    const unpaidInvoiceRs = await client.query<{ id: string }>(
      `SELECT i.id
       FROM contract_tenant ct
       JOIN invoice i ON i.contract_id=ct.contract_id
       WHERE ct.tenant_id=$1
         AND i.status NOT IN ('PAID','VOID')
       LIMIT 1`,
      [tenant.id]
    );
    if (unpaidInvoiceRs.rows[0]) {
      throw new AppError(400, 'Không thể xóa người thuê còn hóa đơn chưa thanh toán', 'TENANT_HAS_UNPAID_INVOICE');
    }

    const erasure = await requestTenantErasure(client, tenant, managerId);

    if (tenant.user_id) {
      await writeAuditLog(client, {
        actorUserId: managerId,
        action: 'USER_DEACTIVATED',
        entityType: 'APP_USER',
        entityId: tenant.user_id,
        before: {
          accountStatus: tenant.account_status,
          isActive: tenant.account_is_active
        },
        after: { accountStatus: 'DELETED', isActive: false },
        metadata: { reason: 'TENANT_DELETED', tenantId: tenant.id }
      });
      await client.query('DELETE FROM app_user WHERE id=$1', [tenant.user_id]);
    }
    return erasure;
  });

  void processCloudinaryAssetJobs();
  return result;
};

export const exportManagedTenantData = async (tenantId: string, managerId: string) => {
  const payload = await withTransaction(async (client) => {
    await assertTenantBelongsToManager(client, tenantId, managerId);
    const data = await getTenantDataExport(client, tenantId);
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'TENANT_DATA_EXPORTED',
      entityType: 'TENANT',
      entityId: tenantId,
      metadata: { scope: 'MANAGER' }
    });
    return data;
  });
  return payload;
};

export const listManagedTenantContracts = async (tenantId: string, managerId: string) => {
  await assertTenantBelongsToManager(db, tenantId, managerId);
  const rs = await query<TenantContractManagementRow>(
    `SELECT ${contractColumns('c')}, r.code AS room_code, b.id AS building_id, b.name AS building_name, ct.is_primary, ct.joined_at, ct.left_at
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ct.tenant_id=$1 AND b.manager_user_id=$2
     ORDER BY c.start_date DESC`,
    [tenantId, managerId]
  );
  return rs.rows;
};
export const listManagedTenantInvoices = async (tenantId: string, managerId: string) => {
  await assertTenantBelongsToManager(db, tenantId, managerId);
  const rs = await query<TenantInvoiceManagementRow>(
    `SELECT ${invoiceColumns('i')}, c.contract_code, r.code AS room_code, b.name AS building_name
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     JOIN invoice i ON i.contract_id=c.id
     JOIN room r ON r.id=i.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ct.tenant_id=$1 AND b.manager_user_id=$2
     ORDER BY i.month DESC, i.created_at DESC`,
    [tenantId, managerId]
  );
  return rs.rows;
};
export const listManagedTenantPayments = async (tenantId: string, managerId: string) => {
  await assertTenantBelongsToManager(db, tenantId, managerId);
  const rs = await query<TenantPaymentManagementRow>(
    `SELECT ${paymentColumns('p')},
            CASE WHEN p.entry_type='REVERSAL' THEN -p.amount ELSE p.amount END::float AS signed_amount,
            i.month, i.total AS invoice_total, i.status AS invoice_status, i.due_date, i.id AS invoice_id
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     JOIN invoice i ON i.contract_id=c.id
     JOIN payment p ON p.invoice_id=i.id
     JOIN room r ON r.id=i.room_id
     JOIN building b ON b.id=r.building_id
     WHERE ct.tenant_id=$1 AND b.manager_user_id=$2
     ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC`,
    [tenantId, managerId]
  );
  return rs.rows;
};
export const exportManagedTenantContract = async (tenantId: string, managerId: string) => {
  await assertTenantBelongsToManager(db, tenantId, managerId);
  const detailRs = await query<TenantContractExportRow>(
    `SELECT t.full_name tenant_name,t.phone,t.email,t.identity_number,t.permanent_address,
            c.contract_code,c.start_date,c.end_date,c.rent_price,c.deposit_amount,c.billing_day,c.note contract_note,
            r.code room_code,r.floor,r.area_m2,b.name building_name,b.address
     FROM tenant t
     JOIN contract_tenant ct ON ct.tenant_id=t.id AND ct.left_at IS NULL
     JOIN contract c ON c.id=ct.contract_id AND c.status='ACTIVE'
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE t.id=$1 AND b.manager_user_id=$2
     LIMIT 1`,
    [tenantId, managerId]
  );
  const row = detailRs.rows[0];
  if (!row) throw new AppError(400, 'Missing active contract/room/building data for export', 'EXPORT_DATA_MISSING');
  return row;
};
