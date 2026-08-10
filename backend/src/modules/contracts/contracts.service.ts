import { contractQuery as query, withContractTransaction as withTransaction } from './contracts.repository';
import { AppError } from '../../shared/errors/app-error';
import {
  getDocumentRetentionUntil,
  normalizeStoredUpload,
  type CloudinaryDeliveryType,
  type UploadResourceType
} from '../uploads/uploads.service';
import {
  enqueueCloudinaryDeletion,
  processCloudinaryAssetJobs
} from '../documents/document-asset-jobs.service';
import { assertRoomCanHostActiveContract, CURRENT_CONTRACT_STATUS, getContractRoomForManager } from './contracts.rules';
import { assertTenantBelongsToManager } from '../tenants/tenants.repository';
import { businessStageSql, getContractBusinessStage } from './business-stage';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { maskIdentityNumber } from '../tenants/tenant-privacy.service';
import type {
  ContractStatus as DatabaseContractStatus,
  DatabaseDate,
  DatabaseNumeric,
  DatabaseTimestamp,
  TenantStatus
} from '../../shared/types/database';
import { toDateString } from '../../shared/types/database';

interface ContractBoundaryRow {
  id: string;
  room_id: string;
  building_id: string;
  room_code: string;
  building_name: string;
  max_occupants: number;
  contract_code: string | null;
  status: DatabaseContractStatus | TenantStatus;
  start_date: DatabaseDate;
  end_date: DatabaseDate | null;
  move_in_date: DatabaseDate | null;
  move_out_date: DatabaseDate | null;
  rent_price: DatabaseNumeric;
  deposit_amount: DatabaseNumeric;
  billing_day: number;
  note: string | null;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
  contract_id: string;
  tenant_id: string;
  is_primary: boolean;
  joined_at: DatabaseDate;
  left_at: DatabaseDate | null;
  full_name: string;
  phone: string;
  email: string | null;
  identity_number: string | null;
  doc_type: string;
  file_url: string | null;
  signed_document_count: number;
  [column: string]: unknown;
}
type DbRow = ContractBoundaryRow;
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];
type Queryable = Pick<TxClient, 'query'>;

const contractColumnNames = [
  'id', 'room_id', 'contract_code', 'status', 'start_date', 'end_date', 'move_in_date',
  'move_out_date', 'rent_price', 'deposit_amount', 'billing_day', 'note', 'created_at', 'updated_at'
] as const;
const contractColumns = (alias?: string) => contractColumnNames
  .map((column) => alias ? `${alias}.${column}` : column)
  .join(', ');
const contractTenantColumns = 'contract_id, tenant_id, is_primary, joined_at, left_at';
const contractDocumentColumns = `id, contract_id, doc_type, file_name, file_url, mime_type,
  file_size, uploaded_by_user_id, uploaded_at, note, cloudinary_asset_id,
  cloudinary_public_id, cloudinary_resource_type, cloudinary_version, cloudinary_format,
  cloudinary_delivery_type, retention_until, created_at`;

const contractAuditSnapshot = (contract: DbRow): Record<string, unknown> => ({
  roomId: contract.room_id,
  contractCode: contract.contract_code,
  status: contract.status,
  startDate: contract.start_date,
  endDate: contract.end_date,
  moveInDate: contract.move_in_date,
  moveOutDate: contract.move_out_date,
  rentPrice: contract.rent_price,
  depositAmount: contract.deposit_amount,
  billingDay: contract.billing_day,
  note: contract.note
});

export type ContractStatus = DatabaseContractStatus;
export type ContractBusinessStage = 'RESERVED' | 'WAITING_SIGNATURE' | 'WAITING_HANDOVER' | 'ACTIVE' | 'CANCELLED' | 'ENDED';
export interface ContractListFilters {
  page: number; pageSize: number; search: string; building_id?: string; room_id?: string;
  tenant_id?: string; status?: ContractStatus; business_stage?: ContractBusinessStage;
}
export interface ContractTenantInput {
  tenant_id: string; is_primary?: boolean; joined_at?: string; left_at?: string | null;
}
export interface ContractCreateInput {
  room_id: string; contract_code?: string | null; status?: ContractStatus; start_date: string;
  end_date?: string | null; move_in_date?: string | null; move_out_date?: string | null;
  rent_price?: number | null; deposit_amount?: number | null; billing_day?: number | null;
  note?: string | null; tenants?: ContractTenantInput[];
}
export type ContractUpdateInput = Partial<Omit<ContractCreateInput, 'status' | 'tenants'>>;
export interface ContractCloseInput { end_date?: string | null; move_out_date?: string | null; note?: string | null; }
export interface ContractTenantUpdateInput { is_primary?: boolean; joined_at?: string; left_at?: string | null; }
export interface ContractDocumentInput {
  doc_type: 'SIGNED_SCAN' | 'ADDENDUM' | 'TERMINATION' | 'OTHER'; file_name?: string | null;
  file_url: string; mime_type: string; file_size: number; resource_type?: UploadResourceType;
  public_id?: string; asset_id?: string; version?: number; format?: string;
  delivery_type?: CloudinaryDeliveryType; note?: string | null;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const generateContractCode = async (client: Queryable): Promise<string> => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 5; i += 1) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `CONTRACT-${datePart}-${random}`;
    const exists = await client.query<{ exists: 1 }>('SELECT 1 FROM contract WHERE contract_code = $1 LIMIT 1', [code]);
    if (exists.rows.length === 0) return code;
  }
  throw new AppError(500, 'Unable to generate unique contract code', 'CONTRACT_CODE_ERROR');
};

const getScopedContract = async (client: Queryable, contractId: string, managerId: string, lock = false) => {
  const lockClause = lock ? 'FOR UPDATE OF c' : '';
  const rs = await client.query<DbRow>(
    `SELECT ${contractColumns('c')}, r.building_id, r.code AS room_code, r.max_occupants, b.name AS building_name
     FROM contract c
     JOIN room r ON r.id=c.room_id
     JOIN building b ON b.id=r.building_id
     WHERE c.id=$1 AND b.manager_user_id=$2
     ${lockClause}`,
    [contractId, managerId]
  );
  const contract = rs.rows[0];
  if (!contract) throw new AppError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
  return contract;
};

const getContractParticipants = async (client: Queryable, contractId: string): Promise<DbRow[]> => {
  const participants = await client.query<DbRow>(
    `SELECT ct.contract_id, ct.tenant_id, ct.is_primary, ct.joined_at, ct.left_at,
            t.full_name, t.phone, t.email, t.identity_number
     FROM contract_tenant ct
     JOIN tenant t ON t.id=ct.tenant_id
     WHERE ct.contract_id=$1
     ORDER BY ct.left_at NULLS FIRST, ct.is_primary DESC, ct.joined_at, t.full_name`,
    [contractId]
  );
  return participants.rows.map((tenant): DbRow => ({
    ...tenant,
    identity_number: maskIdentityNumber(tenant.identity_number)
  }));
};

const assertTenantVisibleToManager = async (client: Queryable, tenantId: string, managerId: string) => {
  const rs = await client.query<{ id: string }>(
    `SELECT tenant.id
     FROM tenant
     WHERE tenant.id=$1
       AND tenant.status <> 'DELETED'
       AND (
         NOT EXISTS (
           SELECT 1
           FROM contract_tenant ct_scope
           JOIN contract c_scope ON c_scope.id=ct_scope.contract_id
           WHERE ct_scope.tenant_id=tenant.id
             AND ct_scope.left_at IS NULL
             AND c_scope.status='ACTIVE'
         )
         OR EXISTS (
           SELECT 1
           FROM contract_tenant ct_scope
           JOIN contract c_scope ON c_scope.id=ct_scope.contract_id
           JOIN room r_scope ON r_scope.id=c_scope.room_id
           JOIN building b_scope ON b_scope.id=r_scope.building_id
           WHERE ct_scope.tenant_id=tenant.id
             AND ct_scope.left_at IS NULL
             AND c_scope.status='ACTIVE'
             AND b_scope.manager_user_id=$2
         )
       )
     LIMIT 1
     FOR UPDATE OF tenant`,
    [tenantId, managerId]
  );
  if (!rs.rows[0]) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
};

const assertNoOtherActiveContract = async (client: Queryable, tenantId: string, contractId: string) => {
  const active = await client.query<{ id: string }>(
    `SELECT c.id
     FROM contract_tenant ct
     JOIN contract c ON c.id=ct.contract_id
     WHERE ct.tenant_id=$1
       AND ct.left_at IS NULL
       AND c.status='ACTIVE'
       AND c.id<>$2
     LIMIT 1`,
    [tenantId, contractId]
  );
  if (active.rows[0]) {
    throw new AppError(409, 'Tenant already has another active contract', 'TENANT_HAS_ACTIVE_CONTRACT');
  }
};

const assertSinglePrimary = (tenants: ContractTenantInput[]) => {
  const activeTenants = tenants.filter((tenant) => !tenant.left_at);
  const primaryCount = activeTenants.filter((tenant) => tenant.is_primary).length;
  if (primaryCount > 1) {
    throw new AppError(400, 'Only one primary tenant is allowed', 'CONTRACT_PRIMARY_TENANT_CONFLICT');
  }
};

const assertPrimaryConsistency = async (client: Queryable, contractId: string) => {
  const participants = await getContractParticipants(client, contractId);
  const activeParticipants = participants.filter((tenant) => !tenant.left_at);
  const primaryCount = activeParticipants.filter((tenant) => tenant.is_primary).length;

  if (activeParticipants.length > 0 && primaryCount !== 1) {
    throw new AppError(409, 'Contract must have exactly one primary tenant', 'CONTRACT_PRIMARY_TENANT_REQUIRED');
  }
};

const assertActiveParticipantsReady = async (client: Queryable, contractId: string, managerId: string) => {
  const contract = await getScopedContract(client, contractId, managerId);
  const participants = await getContractParticipants(client, contractId);
  const activeParticipants = participants.filter((tenant) => !tenant.left_at);
  const primaryCount = activeParticipants.filter((tenant) => tenant.is_primary).length;

  if (activeParticipants.length === 0) {
    throw new AppError(409, 'Contract must have at least one active tenant', 'CONTRACT_TENANT_REQUIRED');
  }
  if (primaryCount !== 1) {
    throw new AppError(409, 'Contract must have exactly one primary tenant', 'CONTRACT_PRIMARY_TENANT_REQUIRED');
  }
  if (activeParticipants.length > Number(contract.max_occupants)) {
    throw new AppError(409, 'Room max occupants exceeded', 'ROOM_MAX_OCCUPANTS_EXCEEDED');
  }

  for (const participant of activeParticipants) {
    await assertTenantVisibleToManager(client, participant.tenant_id, managerId);
    await assertNoOtherActiveContract(client, participant.tenant_id, contractId);
  }
};

const assertParticipantCapacity = async (client: Queryable, contractId: string, managerId: string) => {
  const contract = await getScopedContract(client, contractId, managerId);
  const count = await client.query<{ occupants_count: number }>(
    `SELECT COUNT(*)::int AS occupants_count
     FROM contract_tenant
     WHERE contract_id=$1 AND left_at IS NULL`,
    [contractId]
  );
  if (Number(count.rows[0]?.occupants_count ?? 0) > Number(contract.max_occupants)) {
    throw new AppError(409, 'Room max occupants exceeded', 'ROOM_MAX_OCCUPANTS_EXCEEDED');
  }
};

const insertOrReactivateParticipant = async (
  client: TxClient,
  contractId: string,
  tenant: ContractTenantInput,
  managerId: string
) => {
  await assertTenantVisibleToManager(client, tenant.tenant_id, managerId);
  await assertNoOtherActiveContract(client, tenant.tenant_id, contractId);

  const existing = await client.query<DbRow>(
    `SELECT ${contractTenantColumns}
     FROM contract_tenant
     WHERE contract_id=$1 AND tenant_id=$2
     FOR UPDATE`,
    [contractId, tenant.tenant_id]
  );

  if (tenant.is_primary) {
    await client.query('UPDATE contract_tenant SET is_primary=false WHERE contract_id=$1 AND is_primary=true', [contractId]);
  }

  if (existing.rows[0]) {
    await client.query(
      `UPDATE contract_tenant
       SET is_primary=$1, joined_at=$2, left_at=$3
       WHERE contract_id=$4 AND tenant_id=$5`,
      [tenant.is_primary ?? false, tenant.joined_at ?? today(), tenant.left_at ?? null, contractId, tenant.tenant_id]
    );
    return;
  }

  await client.query(
    `INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at,left_at)
     VALUES($1,$2,$3,$4,$5)`,
    [contractId, tenant.tenant_id, tenant.is_primary ?? false, tenant.joined_at ?? today(), tenant.left_at ?? null]
  );
};

export const listContracts = async (filters: ContractListFilters, managerId: string) => {
  const { page, pageSize } = filters;
  const offset = (page - 1) * pageSize;

  const search = filters.search;
  const buildingId = filters.building_id;
  const roomId = filters.room_id;
  const tenantId = filters.tenant_id;
  const status = filters.status;
  const businessStage = filters.business_stage;

  const params: unknown[] = [managerId];
  const conditions = ['b.manager_user_id=$1'];

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(`(c.contract_code ILIKE $${idx} OR r.code ILIKE $${idx} OR b.name ILIKE $${idx} OR COALESCE(tenant_names.names, '') ILIKE $${idx})`);
  }
  if (buildingId) {
    params.push(buildingId);
    conditions.push(`b.id=$${params.length}`);
  }
  if (roomId) {
    params.push(roomId);
    conditions.push(`r.id=$${params.length}`);
  }
  if (tenantId) {
    params.push(tenantId);
    conditions.push(`EXISTS (SELECT 1 FROM contract_tenant ct_filter WHERE ct_filter.contract_id=c.id AND ct_filter.tenant_id=$${params.length})`);
  }
  if (status) {
    params.push(status);
    conditions.push(`c.status=$${params.length}`);
  }
  if (businessStage) {
    params.push(businessStage);
    conditions.push(`business_stage_filter.business_stage=$${params.length}`);
  }

  const joins = `
    JOIN room r ON r.id=c.room_id
    JOIN building b ON b.id=r.building_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS signed_document_count
      FROM contract_document cd
      WHERE cd.contract_id=c.id AND cd.doc_type='SIGNED_SCAN'
    ) contract_docs ON true
    LEFT JOIN LATERAL (
      SELECT ${businessStageSql.replace(' AS business_stage', '')} AS business_stage
    ) business_stage_filter ON true
    LEFT JOIN LATERAL (
      SELECT t.id, t.full_name
      FROM contract_tenant ct
      JOIN tenant t ON t.id=ct.tenant_id
      WHERE ct.contract_id=c.id AND ct.left_at IS NULL
      ORDER BY ct.is_primary DESC, ct.joined_at DESC
      LIMIT 1
    ) primary_tenant ON true
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(t.full_name, ', ' ORDER BY ct.is_primary DESC, t.full_name) AS names,
             COUNT(*)::int AS active_tenants_count
      FROM contract_tenant ct
      JOIN tenant t ON t.id=ct.tenant_id
      WHERE ct.contract_id=c.id AND ct.left_at IS NULL
    ) tenant_names ON true`;
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countRs = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM contract c
     ${joins}
     ${whereClause}`,
    params
  );

  params.push(pageSize, offset);
  const rows = await query<DbRow>(
    `SELECT ${contractColumns('c')}, r.code AS room_code, b.id AS building_id, b.name AS building_name,
            primary_tenant.id AS tenant_id, primary_tenant.full_name AS tenant_name,
            COALESCE(tenant_names.names, '') AS tenant_names,
            COALESCE(tenant_names.active_tenants_count, 0) AS active_tenants_count,
            business_stage_filter.business_stage
     FROM contract c
     ${joins}
     ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { items: rows.rows, page, pageSize, total: countRs.rows[0]?.total ?? 0 };
};

export const getContractDetails = async (contractId: string, managerId: string) => {
  const contract = await getScopedContract({ query }, contractId, managerId);
  const [tenants, documents] = await Promise.all([
    getContractParticipants({ query }, contractId),
    query<DbRow>(
      `SELECT ${contractTenantColumns}
       FROM contract_document
       WHERE contract_id=$1
       ORDER BY uploaded_at DESC NULLS LAST, created_at DESC`,
      [contractId]
    )
  ]);
  const signedDocumentCount = documents.rows.filter((document: DbRow) => document.doc_type === 'SIGNED_SCAN').length;
  return {
    ...contract,
    signed_document_count: signedDocumentCount,
    business_stage: getContractBusinessStage({ ...contract, signed_document_count: signedDocumentCount }),
    tenants,
    documents: documents.rows
  };
};

export const addContractDocument = async (
  contractId: string,
  body: ContractDocumentInput,
  actor: { userId: string; role: 'MANAGER' }
) => {
  const asset = normalizeStoredUpload('CONTRACT_DOCUMENT', body, actor.role, actor.userId);
  await getScopedContract({ query }, contractId, actor.userId);

  const { rows } = await query<DbRow>(
    `INSERT INTO contract_document(
       contract_id,doc_type,file_name,file_url,mime_type,file_size,uploaded_by_user_id,note,
       cloudinary_asset_id,cloudinary_public_id,cloudinary_resource_type,
       cloudinary_version,cloudinary_format,cloudinary_delivery_type,retention_until
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING ${contractDocumentColumns}`,
    [
      contractId,
      body.doc_type,
      body.file_name ?? null,
      null,
      body.mime_type,
      body.file_size,
      actor.userId,
      body.note ?? null,
      asset.assetId,
      asset.publicId,
      asset.resourceType,
      asset.version,
      asset.format,
      asset.deliveryType,
      getDocumentRetentionUntil('CONTRACT_DOCUMENT')
    ]
  );

  return rows[0];
};

export const deleteContractDocument = async (contractId: string, documentId: string, managerId: string) => {
  await getScopedContract({ query }, contractId, managerId);
  const document = (await query<DbRow>(
    `SELECT ${contractDocumentColumns}
     FROM contract_document
     WHERE id=$1 AND contract_id=$2
     LIMIT 1`,
    [documentId, contractId]
  )).rows[0];
  if (!document) throw new AppError(404, 'Contract document not found', 'CONTRACT_DOCUMENT_NOT_FOUND');

  await withTransaction(async (client) => {
    const locked = (await client.query<DbRow>(
      `SELECT ${contractDocumentColumns}
       FROM contract_document
       WHERE id=$1 AND contract_id=$2
       FOR UPDATE`,
      [documentId, contractId]
    )).rows[0];
    if (!locked) throw new AppError(404, 'Contract document not found', 'CONTRACT_DOCUMENT_NOT_FOUND');
    await enqueueCloudinaryDeletion(
      client,
      'CONTRACT_DOCUMENT',
      locked as { id: string; file_url: string | null },
      'CONTRACT_DOCUMENT_DELETED'
    );
    await client.query('DELETE FROM contract_document WHERE id=$1 AND contract_id=$2', [
      documentId,
      contractId
    ]);
  });
  void processCloudinaryAssetJobs();
};

export const createContract = async (body: ContractCreateInput, managerId: string) => {
  const data = await withTransaction(async (client) => {
    const status = body.status ?? 'DRAFT';
    const tenants = body.tenants ?? [];
    assertSinglePrimary(tenants);
    if (status === CURRENT_CONTRACT_STATUS && tenants.filter((tenant) => !tenant.left_at).filter((tenant) => tenant.is_primary).length !== 1) {
      throw new AppError(409, 'Active contracts require exactly one primary tenant', 'CONTRACT_PRIMARY_TENANT_REQUIRED');
    }

    if (status === CURRENT_CONTRACT_STATUS) {
      await assertRoomCanHostActiveContract(client, {
        roomId: body.room_id,
        managerId,
        requestedOccupants: tenants.filter((tenant) => !tenant.left_at).length
      });
    } else {
      await getContractRoomForManager(client, { roomId: body.room_id, managerId });
    }

    const contractCode = body.contract_code ?? (await generateContractCode(client));
    const created = await client.query<DbRow>(
      `INSERT INTO contract(room_id,contract_code,status,start_date,end_date,move_in_date,move_out_date,rent_price,deposit_amount,billing_day,note)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING ${contractColumns()}`,
      [
        body.room_id,
        contractCode,
        status,
        body.start_date,
        body.end_date ?? null,
        body.move_in_date ?? null,
        body.move_out_date ?? null,
        body.rent_price ?? 0,
        body.deposit_amount ?? 0,
        body.billing_day ?? 1,
        body.note ?? null
      ]
    );

    if (body.tenants) {
      for (const t of body.tenants) {
        await assertTenantBelongsToManager(client, t.tenant_id, managerId);

        await client.query(
          `INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at,left_at) VALUES($1,$2,$3,$4,$5)`,
          [created.rows[0].id, t.tenant_id, t.is_primary ?? false, t.joined_at ?? body.start_date, t.left_at ?? null]
        );
      }
    }

    await assertParticipantCapacity(client, created.rows[0].id, managerId);
    if (status === CURRENT_CONTRACT_STATUS) {
      await assertActiveParticipantsReady(client, created.rows[0].id, managerId);
    }

    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'CONTRACT_CREATED',
      entityType: 'CONTRACT',
      entityId: created.rows[0].id,
      after: contractAuditSnapshot(created.rows[0])
    });

    return created.rows[0];
  });

  return data;
};

export const updateContract = async (contractId: string, body: ContractUpdateInput, managerId: string) => {
  const hasField = (field: keyof ContractUpdateInput) => Object.prototype.hasOwnProperty.call(body, field);

  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, contractId, managerId, true);

    if (body.room_id && body.room_id !== contract.room_id) {
      if (contract.status === CURRENT_CONTRACT_STATUS) {
        await assertRoomCanHostActiveContract(client, {
          roomId: body.room_id,
          managerId,
          excludeContractId: contractId
        });
      } else {
        await getContractRoomForManager(client, { roomId: body.room_id, managerId });
      }
    }

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET room_id=COALESCE($1, room_id),
           contract_code=COALESCE($2, contract_code),
           start_date=COALESCE($3, start_date),
           end_date=CASE WHEN $4::boolean THEN $5 ELSE end_date END,
           move_in_date=CASE WHEN $6::boolean THEN $7 ELSE move_in_date END,
           move_out_date=CASE WHEN $8::boolean THEN $9 ELSE move_out_date END,
           rent_price=COALESCE($10, rent_price),
           deposit_amount=COALESCE($11, deposit_amount),
           billing_day=COALESCE($12, billing_day),
           note=CASE WHEN $13::boolean THEN $14 ELSE note END
       WHERE id=$15
       RETURNING ${contractColumns()}`,
      [
        body.room_id ?? null,
        body.contract_code ?? null,
        body.start_date ?? null,
        hasField('end_date'),
        body.end_date ?? null,
        hasField('move_in_date'),
        body.move_in_date ?? null,
        hasField('move_out_date'),
        body.move_out_date ?? null,
        body.rent_price ?? null,
        body.deposit_amount ?? null,
        body.billing_day ?? null,
        hasField('note'),
        body.note ?? null,
        contractId
      ]
    );

    await assertParticipantCapacity(client, contractId, managerId);
    if (contract.status === CURRENT_CONTRACT_STATUS) {
      await assertActiveParticipantsReady(client, contractId, managerId);
    }

    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'CONTRACT_UPDATED',
      entityType: 'CONTRACT',
      entityId: contractId,
      before: contractAuditSnapshot(contract),
      after: contractAuditSnapshot(updated.rows[0])
    });

    return updated.rows[0];
  });

  return data;
};

export const activateContract = async (contractId: string, managerId: string) => {
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, contractId, managerId, true);
    if (contract.status === CURRENT_CONTRACT_STATUS) return contract;
    if (contract.status === 'ENDED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Closed contracts cannot be activated', 'CONTRACT_CLOSED');
    }

    await assertRoomCanHostActiveContract(client, {
      roomId: contract.room_id,
      managerId,
      excludeContractId: contractId
    });
    await assertActiveParticipantsReady(client, contractId, managerId);

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET status='ACTIVE', move_in_date=COALESCE(move_in_date, start_date)
       WHERE id=$1
       RETURNING ${contractColumns()}`,
      [contractId]
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'CONTRACT_ACTIVATED',
      entityType: 'CONTRACT',
      entityId: contractId,
      before: contractAuditSnapshot(contract),
      after: contractAuditSnapshot(updated.rows[0])
    });
    return updated.rows[0];
  });

  return data;
};

export const endContract = async (contractId: string, body: ContractCloseInput, managerId: string) => {
  const endDate = body.move_out_date ?? body.end_date ?? today();
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, contractId, managerId, true);
    if (contract.status === 'CANCELLED') throw new AppError(409, 'Cancelled contracts cannot be ended', 'CONTRACT_CANCELLED');
    if (contract.status === 'ENDED') return contract;

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET status='ENDED', end_date=COALESCE($1, end_date), move_out_date=$2, note=COALESCE($3, note)
       WHERE id=$4
       RETURNING ${contractColumns()}`,
      [body.end_date ?? endDate, endDate, body.note ?? null, contractId]
    );
    await client.query(
      `UPDATE contract_tenant
       SET left_at=COALESCE(left_at, $1)
       WHERE contract_id=$2 AND left_at IS NULL`,
      [endDate, contractId]
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'CONTRACT_ENDED',
      entityType: 'CONTRACT',
      entityId: contractId,
      before: contractAuditSnapshot(contract),
      after: contractAuditSnapshot(updated.rows[0])
    });
    return updated.rows[0];
  });

  return data;
};

export const cancelContract = async (contractId: string, body: ContractCloseInput, managerId: string) => {
  const closeDate = body.move_out_date ?? body.end_date ?? today();
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, contractId, managerId, true);
    if (contract.status === 'ENDED') throw new AppError(409, 'Ended contracts cannot be cancelled', 'CONTRACT_ENDED');
    if (contract.status === 'CANCELLED') return contract;

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET status='CANCELLED',
           move_out_date=CASE
             WHEN move_in_date IS NULL THEN NULL
             ELSE COALESCE(move_out_date, GREATEST(move_in_date, $1::date))
           END,
           note=COALESCE($2, note)
       WHERE id=$3
       RETURNING ${contractColumns()}`,
      [closeDate, body.note ?? null, contractId]
    );
    await client.query(
      `UPDATE contract_tenant
       SET left_at=COALESCE(left_at, GREATEST(joined_at, $1::date))
       WHERE contract_id=$2 AND left_at IS NULL`,
      [closeDate, contractId]
    );
    await writeAuditLog(client, {
      actorUserId: managerId,
      action: 'CONTRACT_CANCELLED',
      entityType: 'CONTRACT',
      entityId: contractId,
      before: contractAuditSnapshot(contract),
      after: contractAuditSnapshot(updated.rows[0])
    });
    return updated.rows[0];
  });

  return data;
};

export const addContractTenant = async (contractId: string, body: ContractTenantInput, managerId: string) => {
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, contractId, managerId, true);
    if (contract.status === 'ENDED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Closed contracts cannot change tenants', 'CONTRACT_CLOSED');
    }

    await insertOrReactivateParticipant(client, contractId, {
      ...body,
      joined_at: body.joined_at ?? toDateString(contract.start_date) ?? today()
    }, managerId);
    await assertParticipantCapacity(client, contractId, managerId);
    await assertPrimaryConsistency(client, contractId);
    if (contract.status === CURRENT_CONTRACT_STATUS) await assertActiveParticipantsReady(client, contractId, managerId);

    return getContractParticipants(client, contractId);
  });

  return data;
};

export const updateContractTenant = async (
  contractId: string,
  tenantId: string,
  body: ContractTenantUpdateInput,
  managerId: string
) => {
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, contractId, managerId, true);
    if (contract.status === 'ENDED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Closed contracts cannot change tenants', 'CONTRACT_CLOSED');
    }

    const participant = await client.query<DbRow>(
      `SELECT ${contractDocumentColumns}
       FROM contract_tenant
       WHERE contract_id=$1 AND tenant_id=$2
       FOR UPDATE`,
      [contractId, tenantId]
    );
    if (!participant.rows[0]) throw new AppError(404, 'Contract tenant not found', 'CONTRACT_TENANT_NOT_FOUND');

    if (body.is_primary === true) {
      if (body.left_at ?? participant.rows[0].left_at) {
        throw new AppError(409, 'Inactive tenant cannot be primary', 'CONTRACT_TENANT_INACTIVE');
      }
      await client.query('UPDATE contract_tenant SET is_primary=false WHERE contract_id=$1 AND is_primary=true', [contractId]);
    }

    await client.query(
      `UPDATE contract_tenant
       SET is_primary=COALESCE($1, is_primary),
           joined_at=COALESCE($2, joined_at),
           left_at=$3
       WHERE contract_id=$4 AND tenant_id=$5`,
      [
        body.is_primary ?? null,
        body.joined_at ?? null,
        Object.prototype.hasOwnProperty.call(body, 'left_at') ? body.left_at ?? null : participant.rows[0].left_at,
        contractId,
        tenantId
      ]
    );
    await assertParticipantCapacity(client, contractId, managerId);
    await assertPrimaryConsistency(client, contractId);
    if (contract.status === CURRENT_CONTRACT_STATUS) await assertActiveParticipantsReady(client, contractId, managerId);

    return getContractParticipants(client, contractId);
  });

  return data;
};

export const removeContractTenant = async (
  contractId: string,
  tenantId: string,
  leftAt: string | undefined,
  managerId: string
) => {
  const effectiveLeftAt = leftAt ?? today();
  await withTransaction(async (client) => {
    const contract = await getScopedContract(client, contractId, managerId, true);
    if (contract.status === 'ENDED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Closed contracts cannot change tenants', 'CONTRACT_CLOSED');
    }

    const participant = await client.query<DbRow>(
      `SELECT ${contractTenantColumns}
       FROM contract_tenant
       WHERE contract_id=$1 AND tenant_id=$2 AND left_at IS NULL
       FOR UPDATE`,
      [contractId, tenantId]
    );
    if (!participant.rows[0]) throw new AppError(404, 'Contract tenant not found', 'CONTRACT_TENANT_NOT_FOUND');

    await client.query(
      `UPDATE contract_tenant
       SET left_at=$1, is_primary=false
       WHERE contract_id=$2 AND tenant_id=$3`,
      [effectiveLeftAt, contractId, tenantId]
    );
    await assertPrimaryConsistency(client, contractId);
    if (contract.status === CURRENT_CONTRACT_STATUS) await assertActiveParticipantsReady(client, contractId, managerId);
  });

};
