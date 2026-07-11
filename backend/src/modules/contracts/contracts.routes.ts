import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { parseBody } from '../../shared/utils/validation';
import { deleteCloudinaryUpload, validateStoredUpload } from '../uploads/uploads.service';
import { assertRoomCanHostActiveContract, CURRENT_CONTRACT_STATUS, getContractRoomForManager } from './contracts.rules';
import { assertTenantBelongsToManager } from '../tenants/tenants.repository';
import { businessStageSql, getContractBusinessStage } from './business-stage';

const router = Router();
type DbRow = Record<string, any>;
type TxClient = Parameters<Parameters<typeof withTransaction>[0]>[0];
type Queryable = Pick<TxClient, 'query'>;

const contractStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED']);
const nullableString = z.string().trim().nullable().optional();
const contractTenantSchema = z.object({
  tenant_id: z.string().uuid(),
  is_primary: z.boolean().optional(),
  joined_at: z.string().trim().min(1).optional(),
  left_at: nullableString
});

const contractCreateSchema = z.object({
  room_id: z.string().uuid(),
  contract_code: z.string().trim().min(1).nullable().optional(),
  status: contractStatusSchema.optional(),
  start_date: z.string().trim().min(1),
  end_date: nullableString,
  move_in_date: nullableString,
  move_out_date: nullableString,
  rent_price: z.coerce.number().nonnegative().nullable().optional(),
  deposit_amount: z.coerce.number().nonnegative().nullable().optional(),
  billing_day: z.coerce.number().int().min(1).max(28).nullable().optional(),
  note: nullableString,
  tenants: z.array(contractTenantSchema).optional()
});

const contractUpdateSchema = contractCreateSchema.omit({ status: true, tenants: true }).partial();

const contractEndSchema = z.object({
  end_date: z.string().trim().min(1).nullable().optional(),
  move_out_date: z.string().trim().min(1).nullable().optional(),
  note: nullableString
});

const contractTenantUpdateSchema = z.object({
  is_primary: z.boolean().optional(),
  joined_at: z.string().trim().min(1).optional(),
  left_at: nullableString
});

const contractDocumentSchema = z.object({
  doc_type: z.enum(['SIGNED_SCAN', 'ADDENDUM', 'TERMINATION', 'OTHER']),
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().url(),
  mime_type: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive(),
  note: nullableString
});

const parseIntParam = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const today = (): string => new Date().toISOString().slice(0, 10);

const generateContractCode = async (client: Queryable): Promise<string> => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 5; i += 1) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `CONTRACT-${datePart}-${random}`;
    const exists = await client.query('SELECT 1 FROM contract WHERE contract_code = $1 LIMIT 1', [code]);
    if (exists.rows.length === 0) return code;
  }
  throw new AppError(500, 'Unable to generate unique contract code', 'CONTRACT_CODE_ERROR');
};

const getScopedContract = async (client: Queryable, contractId: string, managerId: string, lock = false) => {
  const lockClause = lock ? 'FOR UPDATE OF c' : '';
  const rs = await client.query<DbRow>(
    `SELECT c.*, r.building_id, r.code AS room_code, r.max_occupants, b.name AS building_name
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

const getContractParticipants = async (client: Queryable, contractId: string) =>
  (await client.query<DbRow>(
    `SELECT ct.contract_id, ct.tenant_id, ct.is_primary, ct.joined_at, ct.left_at,
            t.full_name, t.phone, t.email, t.identity_number
     FROM contract_tenant ct
     JOIN tenant t ON t.id=ct.tenant_id
     WHERE ct.contract_id=$1
     ORDER BY ct.left_at NULLS FIRST, ct.is_primary DESC, ct.joined_at, t.full_name`,
    [contractId]
  )).rows;

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
     LIMIT 1`,
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

const assertSinglePrimary = (tenants: z.infer<typeof contractTenantSchema>[]) => {
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
  tenant: z.infer<typeof contractTenantSchema>,
  managerId: string
) => {
  await assertTenantVisibleToManager(client, tenant.tenant_id, managerId);
  await assertNoOtherActiveContract(client, tenant.tenant_id, contractId);

  const existing = await client.query<DbRow>(
    `SELECT *
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

router.get('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const page = parseIntParam(req.query.page, 1);
  const pageSize = Math.min(parseIntParam(req.query.pageSize, 20), 100);
  const offset = (page - 1) * pageSize;

  const search = String(req.query.search ?? '').trim();
  const buildingId = String(req.query.building_id ?? '').trim();
  const roomId = String(req.query.room_id ?? '').trim();
  const tenantId = String(req.query.tenant_id ?? '').trim();
  const status = String(req.query.status ?? '').trim();
  const businessStage = String(req.query.business_stage ?? '').trim();

  const params: unknown[] = [req.auth!.userId];
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
    `SELECT c.*, r.code AS room_code, b.id AS building_id, b.name AS building_name,
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

  res.json({ items: rows.rows, page, pageSize, total: countRs.rows[0]?.total ?? 0 });
}));

router.get('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const contract = await getScopedContract({ query }, req.params.id, req.auth!.userId);
  const [tenants, documents] = await Promise.all([
    getContractParticipants({ query }, req.params.id),
    query(
      `SELECT *
       FROM contract_document
       WHERE contract_id=$1
       ORDER BY uploaded_at DESC NULLS LAST, created_at DESC`,
      [req.params.id]
    )
  ]);
  const signedDocumentCount = documents.rows.filter((document: DbRow) => document.doc_type === 'SIGNED_SCAN').length;
  res.json({
    ...contract,
    signed_document_count: signedDocumentCount,
    business_stage: getContractBusinessStage({ ...contract, signed_document_count: signedDocumentCount }),
    tenants,
    documents: documents.rows
  });
}));

router.post('/:id/documents', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(contractDocumentSchema, req.body);
  validateStoredUpload('CONTRACT_DOCUMENT', body, req.auth!.role);
  await getScopedContract({ query }, req.params.id, req.auth!.userId);

  const { rows } = await query<DbRow>(
    `INSERT INTO contract_document(contract_id,doc_type,file_name,file_url,mime_type,file_size,uploaded_by_user_id,note)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      req.params.id,
      body.doc_type,
      body.file_name ?? null,
      body.file_url,
      body.mime_type,
      body.file_size,
      req.auth!.userId,
      body.note ?? null
    ]
  );

  res.status(201).json(rows[0]);
}));

router.delete('/:id/documents/:documentId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  await getScopedContract({ query }, req.params.id, req.auth!.userId);
  const document = (await query<DbRow>(
    `SELECT *
     FROM contract_document
     WHERE id=$1 AND contract_id=$2
     LIMIT 1`,
    [req.params.documentId, req.params.id]
  )).rows[0];
  if (!document) throw new AppError(404, 'Contract document not found', 'CONTRACT_DOCUMENT_NOT_FOUND');

  await deleteCloudinaryUpload({
    file_url: document.file_url
  });
  await query('DELETE FROM contract_document WHERE id=$1 AND contract_id=$2', [req.params.documentId, req.params.id]);
  res.status(204).send();
}));

router.post('/', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(contractCreateSchema, req.body);
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
        managerId: req.auth!.userId,
        requestedOccupants: tenants.filter((tenant) => !tenant.left_at).length
      });
    } else {
      await getContractRoomForManager(client, { roomId: body.room_id, managerId: req.auth!.userId });
    }

    const contractCode = body.contract_code ?? (await generateContractCode(client));
    const created = await client.query<DbRow>(
      `INSERT INTO contract(room_id,contract_code,status,start_date,end_date,move_in_date,move_out_date,rent_price,deposit_amount,billing_day,note)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
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
        await assertTenantBelongsToManager(client, t.tenant_id, req.auth!.userId);

        await client.query(
          `INSERT INTO contract_tenant(contract_id,tenant_id,is_primary,joined_at,left_at) VALUES($1,$2,$3,$4,$5)`,
          [created.rows[0].id, t.tenant_id, t.is_primary ?? false, t.joined_at ?? body.start_date, t.left_at ?? null]
        );
      }
    }

    await assertParticipantCapacity(client, created.rows[0].id, req.auth!.userId);
    if (status === CURRENT_CONTRACT_STATUS) {
      await assertActiveParticipantsReady(client, created.rows[0].id, req.auth!.userId);
    }

    return created.rows[0];
  });

  res.status(201).json(data);
}));

router.patch('/:id', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(contractUpdateSchema, req.body);
  const hasField = (field: keyof z.infer<typeof contractUpdateSchema>) => Object.prototype.hasOwnProperty.call(body, field);

  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.id, req.auth!.userId, true);

    if (body.room_id && body.room_id !== contract.room_id) {
      if (contract.status === CURRENT_CONTRACT_STATUS) {
        await assertRoomCanHostActiveContract(client, {
          roomId: body.room_id,
          managerId: req.auth!.userId,
          excludeContractId: req.params.id
        });
      } else {
        await getContractRoomForManager(client, { roomId: body.room_id, managerId: req.auth!.userId });
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
       RETURNING *`,
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
        req.params.id
      ]
    );

    await assertParticipantCapacity(client, req.params.id, req.auth!.userId);
    if (contract.status === CURRENT_CONTRACT_STATUS) {
      await assertActiveParticipantsReady(client, req.params.id, req.auth!.userId);
    }

    return updated.rows[0];
  });

  res.json(data);
}));

router.post('/:id/activate', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.id, req.auth!.userId, true);
    if (contract.status === CURRENT_CONTRACT_STATUS) return contract;
    if (contract.status === 'ENDED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Closed contracts cannot be activated', 'CONTRACT_CLOSED');
    }

    await assertRoomCanHostActiveContract(client, {
      roomId: contract.room_id,
      managerId: req.auth!.userId,
      excludeContractId: req.params.id
    });
    await assertActiveParticipantsReady(client, req.params.id, req.auth!.userId);

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET status='ACTIVE', move_in_date=COALESCE(move_in_date, start_date)
       WHERE id=$1
       RETURNING *`,
      [req.params.id]
    );
    return updated.rows[0];
  });

  res.json(data);
}));

router.post('/:id/end', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(contractEndSchema, req.body ?? {});
  const endDate = body.move_out_date ?? body.end_date ?? today();
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.id, req.auth!.userId, true);
    if (contract.status === 'CANCELLED') throw new AppError(409, 'Cancelled contracts cannot be ended', 'CONTRACT_CANCELLED');
    if (contract.status === 'ENDED') return contract;

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET status='ENDED', end_date=COALESCE($1, end_date), move_out_date=$2, note=COALESCE($3, note)
       WHERE id=$4
       RETURNING *`,
      [body.end_date ?? endDate, endDate, body.note ?? null, req.params.id]
    );
    await client.query(
      `UPDATE contract_tenant
       SET left_at=COALESCE(left_at, $1)
       WHERE contract_id=$2 AND left_at IS NULL`,
      [endDate, req.params.id]
    );
    return updated.rows[0];
  });

  res.json(data);
}));

router.post('/:id/cancel', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(contractEndSchema, req.body ?? {});
  const closeDate = body.move_out_date ?? body.end_date ?? today();
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.id, req.auth!.userId, true);
    if (contract.status === 'ENDED') throw new AppError(409, 'Ended contracts cannot be cancelled', 'CONTRACT_ENDED');
    if (contract.status === 'CANCELLED') return contract;

    const updated = await client.query<DbRow>(
      `UPDATE contract
       SET status='CANCELLED', move_out_date=COALESCE(move_out_date, $1), note=COALESCE($2, note)
       WHERE id=$3
       RETURNING *`,
      [closeDate, body.note ?? null, req.params.id]
    );
    await client.query(
      `UPDATE contract_tenant
       SET left_at=COALESCE(left_at, GREATEST(joined_at, $1::date))
       WHERE contract_id=$2 AND left_at IS NULL`,
      [closeDate, req.params.id]
    );
    return updated.rows[0];
  });

  res.json(data);
}));

router.post('/:id/tenants', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(contractTenantSchema, req.body);
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.id, req.auth!.userId, true);
    if (contract.status === 'ENDED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Closed contracts cannot change tenants', 'CONTRACT_CLOSED');
    }

    await insertOrReactivateParticipant(client, req.params.id, { ...body, joined_at: body.joined_at ?? contract.start_date }, req.auth!.userId);
    await assertParticipantCapacity(client, req.params.id, req.auth!.userId);
    await assertPrimaryConsistency(client, req.params.id);
    if (contract.status === CURRENT_CONTRACT_STATUS) await assertActiveParticipantsReady(client, req.params.id, req.auth!.userId);

    return getContractParticipants(client, req.params.id);
  });

  res.status(201).json(data);
}));

router.patch('/:id/tenants/:tenantId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const body = parseBody(contractTenantUpdateSchema, req.body);
  const data = await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.id, req.auth!.userId, true);
    if (contract.status === 'ENDED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Closed contracts cannot change tenants', 'CONTRACT_CLOSED');
    }

    const participant = await client.query<DbRow>(
      `SELECT *
       FROM contract_tenant
       WHERE contract_id=$1 AND tenant_id=$2
       FOR UPDATE`,
      [req.params.id, req.params.tenantId]
    );
    if (!participant.rows[0]) throw new AppError(404, 'Contract tenant not found', 'CONTRACT_TENANT_NOT_FOUND');

    if (body.is_primary === true) {
      if (body.left_at ?? participant.rows[0].left_at) {
        throw new AppError(409, 'Inactive tenant cannot be primary', 'CONTRACT_TENANT_INACTIVE');
      }
      await client.query('UPDATE contract_tenant SET is_primary=false WHERE contract_id=$1 AND is_primary=true', [req.params.id]);
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
        req.params.id,
        req.params.tenantId
      ]
    );
    await assertParticipantCapacity(client, req.params.id, req.auth!.userId);
    await assertPrimaryConsistency(client, req.params.id);
    if (contract.status === CURRENT_CONTRACT_STATUS) await assertActiveParticipantsReady(client, req.params.id, req.auth!.userId);

    return getContractParticipants(client, req.params.id);
  });

  res.json(data);
}));

router.delete('/:id/tenants/:tenantId', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  const leftAt = String(req.query.left_at ?? '').trim() || today();
  await withTransaction(async (client) => {
    const contract = await getScopedContract(client, req.params.id, req.auth!.userId, true);
    if (contract.status === 'ENDED' || contract.status === 'CANCELLED') {
      throw new AppError(409, 'Closed contracts cannot change tenants', 'CONTRACT_CLOSED');
    }

    const participant = await client.query<DbRow>(
      `SELECT *
       FROM contract_tenant
       WHERE contract_id=$1 AND tenant_id=$2 AND left_at IS NULL
       FOR UPDATE`,
      [req.params.id, req.params.tenantId]
    );
    if (!participant.rows[0]) throw new AppError(404, 'Contract tenant not found', 'CONTRACT_TENANT_NOT_FOUND');

    await client.query(
      `UPDATE contract_tenant
       SET left_at=$1, is_primary=false
       WHERE contract_id=$2 AND tenant_id=$3`,
      [leftAt, req.params.id, req.params.tenantId]
    );
    await assertPrimaryConsistency(client, req.params.id);
    if (contract.status === CURRENT_CONTRACT_STATUS) await assertActiveParticipantsReady(client, req.params.id, req.auth!.userId);
  });

  res.status(204).send();
}));

export default router;
