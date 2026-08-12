import { z } from 'zod';
import { query, withTransaction } from '../../db';
import { AppError, type FieldErrors } from '../../shared/errors/app-error';
import { ROOM_STATUSES, TENANT_WRITABLE_STATUSES } from '../../shared/types/database';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import { createManagedTenant } from '../tenants/tenant-management.service';
import { env } from '../../config/env';

export const importEntityValues = ['BUILDING', 'ROOM', 'TENANT'] as const;
export type ImportEntity = typeof importEntityValues[number];

const emptyToUndefined = (value: unknown) => value === '' || value === null ? undefined : value;
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().max(500).optional());
const optionalNumber = z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional());
const optionalInteger = z.preprocess(emptyToUndefined, z.coerce.number().int().optional());

const buildingRowSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  note: optionalText
}).strict();

const roomRowSchema = z.object({
  building_code: z.string().trim().min(1).max(50),
  code: z.string().trim().min(1).max(50),
  floor: optionalInteger,
  area_m2: optionalNumber,
  status: z.preprocess(emptyToUndefined, z.enum(ROOM_STATUSES).default('ACTIVE')),
  base_rent: optionalNumber,
  deposit_default: optionalNumber,
  max_occupants: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(1)),
  note: optionalText
}).strict();

const tenantRowSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(1).max(30),
  identity_number: z.string().trim().min(1).max(50),
  dob: optionalText,
  gender: optionalText,
  identity_issued_date: optionalText,
  identity_issued_place: optionalText,
  permanent_address: optionalText,
  status: z.preprocess(emptyToUndefined, z.enum(TENANT_WRITABLE_STATUSES).default('ACTIVE')),
  note: optionalText
}).strict();

const schemas = {
  BUILDING: buildingRowSchema,
  ROOM: roomRowSchema,
  TENANT: tenantRowSchema
} satisfies Record<ImportEntity, z.ZodType<Record<string, unknown>>>;

export interface ImportRowError {
  row: number;
  field: string;
  code: string;
  message: string;
}

export interface ImportPreview {
  entity: ImportEntity;
  valid: boolean;
  total: number;
  rows: Record<string, unknown>[];
  errors: ImportRowError[];
}

const duplicateErrors = (
  rows: Record<string, unknown>[],
  keyFor: (row: Record<string, unknown>) => string,
  field: string
): ImportRowError[] => {
  const firstRows = new Map<string, number>();
  const errors: ImportRowError[] = [];
  rows.forEach((row, index) => {
    const key = keyFor(row).toLocaleLowerCase();
    const first = firstRows.get(key);
    if (first !== undefined) {
      errors.push({ row: index + 2, field, code: 'DUPLICATE_IN_FILE', message: `Duplicates CSV row ${first + 2}.` });
    } else {
      firstRows.set(key, index);
    }
  });
  return errors;
};

const databaseConflictErrors = async (
  managerId: string,
  entity: ImportEntity,
  rows: Record<string, unknown>[]
): Promise<ImportRowError[]> => {
  if (entity === 'BUILDING') {
    const existing = await query<{ code: string }>(
      'SELECT code FROM building WHERE manager_user_id=$1 AND lower(code)=ANY($2::text[])',
      [managerId, rows.map((row) => String(row.code).toLocaleLowerCase())]
    );
    const codes = new Set(existing.rows.map((row) => row.code.toLocaleLowerCase()));
    return rows.flatMap((row, index) => codes.has(String(row.code).toLocaleLowerCase())
      ? [{ row: index + 2, field: 'code', code: 'BUILDING_CODE_EXISTS', message: 'Building code already exists.' }]
      : []);
  }

  if (entity === 'ROOM') {
    const buildingCodes = [...new Set(rows.map((row) => String(row.building_code).toLocaleLowerCase()))];
    const buildings = await query<{ id: string; code: string }>(
      'SELECT id, code FROM building WHERE manager_user_id=$1 AND lower(code)=ANY($2::text[])',
      [managerId, buildingCodes]
    );
    const buildingByCode = new Map(buildings.rows.map((row) => [row.code.toLocaleLowerCase(), row.id]));
    const existing = await query<{ building_code: string; room_code: string }>(
      `SELECT building.code AS building_code, room.code AS room_code
       FROM room JOIN building ON building.id=room.building_id
       WHERE building.manager_user_id=$1
         AND lower(building.code)=ANY($2::text[])`,
      [managerId, buildingCodes]
    );
    const existingKeys = new Set(existing.rows.map((row) => `${row.building_code}:${row.room_code}`.toLocaleLowerCase()));
    return rows.flatMap((row, index) => {
      const buildingCode = String(row.building_code).toLocaleLowerCase();
      if (!buildingByCode.has(buildingCode)) {
        return [{ row: index + 2, field: 'building_code', code: 'BUILDING_NOT_FOUND', message: 'Building code does not belong to this manager.' }];
      }
      return existingKeys.has(`${buildingCode}:${String(row.code).toLocaleLowerCase()}`)
        ? [{ row: index + 2, field: 'code', code: 'ROOM_CODE_EXISTS', message: 'Room code already exists in this building.' }]
        : [];
    });
  }

  const existing = await query<{ email: string | null; identity_number: string }>(
    `SELECT app_user.email::text AS email, tenant.identity_number
     FROM tenant LEFT JOIN app_user ON app_user.id=tenant.user_id
     WHERE lower(COALESCE(app_user.email::text, tenant.email::text))=ANY($1::text[])
        OR tenant.identity_number=ANY($2::text[])`,
    [
      rows.map((row) => String(row.email).toLocaleLowerCase()),
      rows.map((row) => String(row.identity_number))
    ]
  );
  const emails = new Set(existing.rows.map((row) => row.email?.toLocaleLowerCase()).filter(Boolean));
  const identities = new Set(existing.rows.map((row) => row.identity_number));
  return rows.flatMap((row, index) => [
    ...(emails.has(String(row.email).toLocaleLowerCase())
      ? [{ row: index + 2, field: 'email', code: 'EMAIL_EXISTS', message: 'Email already exists.' }]
      : []),
    ...(identities.has(String(row.identity_number))
      ? [{ row: index + 2, field: 'identity_number', code: 'TENANT_ALREADY_EXISTS', message: 'Identity number already exists.' }]
      : [])
  ]);
};

export const previewImport = async (
  managerId: string,
  entity: ImportEntity,
  rawRows: Record<string, unknown>[]
): Promise<ImportPreview> => {
  const rows: Record<string, unknown>[] = [];
  const errors: ImportRowError[] = [];
  rawRows.forEach((row, index) => {
    const result = schemas[entity].safeParse(row);
    if (result.success) {
      rows.push(result.data);
      return;
    }
    for (const issue of result.error.issues) {
      errors.push({
        row: index + 2,
        field: issue.path.join('.') || 'row',
        code: 'INVALID_VALUE',
        message: issue.message
      });
    }
  });

  if (errors.length === 0) {
    if (entity === 'BUILDING') errors.push(...duplicateErrors(rows, (row) => String(row.code), 'code'));
    if (entity === 'ROOM') errors.push(...duplicateErrors(rows, (row) => `${row.building_code}:${row.code}`, 'code'));
    if (entity === 'TENANT') {
      errors.push(...duplicateErrors(rows, (row) => String(row.email), 'email'));
      errors.push(...duplicateErrors(rows, (row) => String(row.identity_number), 'identity_number'));
    }
    errors.push(...await databaseConflictErrors(managerId, entity, rows));
  }

  return { entity, valid: errors.length === 0, total: rawRows.length, rows, errors };
};

const validationFieldErrors = (errors: ImportRowError[]): FieldErrors => Object.fromEntries(
  errors.map((error) => [`rows.${error.row}.${error.field}`, [error.message]])
);

export const commitImport = async (
  managerId: string,
  entity: ImportEntity,
  rawRows: Record<string, unknown>[]
) => {
  const preview = await previewImport(managerId, entity, rawRows);
  if (!preview.valid) {
    throw new AppError(400, 'Import contains invalid rows.', 'IMPORT_VALIDATION_FAILED', validationFieldErrors(preview.errors));
  }

  if (entity === 'BUILDING') {
    const ids = await withTransaction(async (client) => {
      const created: string[] = [];
      for (const row of preview.rows) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO building(manager_user_id,code,name,address,note)
           VALUES($1,$2,$3,$4,$5) RETURNING id`,
          [managerId, row.code, row.name, row.address, row.note ?? null]
        );
        created.push(inserted.rows[0].id);
      }
      await writeAuditLog(client, { actorUserId: managerId, action: 'DATA_IMPORTED', entityType: 'BUILDING', entityId: null, metadata: { count: created.length } });
      return created;
    });
    return { entity, imported: ids.length, ids, failed: [] };
  }

  if (entity === 'ROOM') {
    const ids = await withTransaction(async (client) => {
      const created: string[] = [];
      for (const row of preview.rows) {
        const building = await client.query<{ id: string }>(
          'SELECT id FROM building WHERE manager_user_id=$1 AND lower(code)=lower($2) LIMIT 1',
          [managerId, row.building_code]
        );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO room(building_id,code,floor,area_m2,status,base_rent,deposit_default,max_occupants,note)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [building.rows[0].id, row.code, row.floor ?? null, row.area_m2 ?? null, row.status, row.base_rent ?? 0, row.deposit_default ?? 0, row.max_occupants, row.note ?? null]
        );
        created.push(inserted.rows[0].id);
      }
      await writeAuditLog(client, { actorUserId: managerId, action: 'DATA_IMPORTED', entityType: 'ROOM', entityId: null, metadata: { count: created.length } });
      return created;
    });
    return { entity, imported: ids.length, ids, failed: [] };
  }

  const ids: string[] = [];
  const failed: Array<{ row: number; code: string; message: string }> = [];
  for (const [index, row] of preview.rows.entries()) {
    try {
      const result = await createManagedTenant({
        tenant: row as z.infer<typeof tenantRowSchema>,
        privacy_consent: true,
        privacy_policy_version: env.PRIVACY_POLICY_VERSION
      }, managerId);
      ids.push(result.tenantId);
    } catch (error) {
      failed.push({
        row: index + 2,
        code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'IMPORT_ROW_FAILED',
        message: error instanceof Error ? error.message : 'Tenant could not be imported.'
      });
    }
  }
  return { entity, imported: ids.length, ids, failed };
};
