import crypto from 'crypto';
import type { Request } from 'express';
import { env } from '../../config/env';
import { query } from '../../db';
import { AppError } from '../../shared/errors/app-error';
import type { AppRole } from '../../shared/middleware/auth';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import {
  createCloudinaryPrivateDownloadUrl,
  resolveCloudinaryAsset,
  type CloudinaryAssetMetadata,
  type CloudinaryDeliveryType,
  type UploadResourceType
} from '../uploads/uploads.service';

export const documentKindValues = [
  'TENANT_DOCUMENT',
  'PAYMENT_PROOF',
  'UTILITY_EVIDENCE',
  'CONTRACT_DOCUMENT'
] as const;
export type DocumentKind = typeof documentKindValues[number];
export type DocumentAccessAction = 'VIEW' | 'DOWNLOAD';
export type DocumentAuthScope = { userId: string; role: AppRole };

export interface DocumentAssetRow extends CloudinaryAssetMetadata {
  id: string;
  file_name: string | null;
  file_url: string | null;
  mime_type: string | null;
  file_size: number | string | null;
  source_kind: DocumentKind;
  tenant_id?: string | null;
  doc_type?: string | null;
}

interface DocumentAccessToken {
  kind: DocumentKind;
  documentId: string;
  actorUserId: string;
  role: AppRole;
  action: DocumentAccessAction;
  expiresAt: number;
}

const commonProjection = (alias: string, sourceKind: DocumentKind): string => `
  ${alias}.id,
  ${alias}.file_name,
  ${alias}.file_url,
  ${alias}.mime_type,
  ${alias}.file_size,
  ${alias}.cloudinary_asset_id AS asset_id,
  ${alias}.cloudinary_public_id AS public_id,
  ${alias}.cloudinary_resource_type AS resource_type,
  ${alias}.cloudinary_version AS version,
  ${alias}.cloudinary_format AS format,
  ${alias}.cloudinary_delivery_type AS delivery_type,
  '${sourceKind}'::text AS source_kind
`;

const getDocumentAccessSecret = (): string => env.DOCUMENT_ACCESS_SECRET || env.JWT_ACCESS_SECRET;

const encodeTokenPart = (value: string): string => Buffer.from(value).toString('base64url');

const signDocumentAccessPayload = (payload: string): string => (
  crypto.createHmac('sha256', getDocumentAccessSecret()).update(payload).digest('base64url')
);

const createDocumentAccessToken = (payload: DocumentAccessToken): string => {
  const encodedPayload = encodeTokenPart(JSON.stringify(payload));
  return `${encodedPayload}.${signDocumentAccessPayload(encodedPayload)}`;
};

export const verifyDocumentAccessToken = (token: string): DocumentAccessToken => {
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra) {
    throw new AppError(401, 'Document access link is invalid', 'DOCUMENT_ACCESS_INVALID');
  }

  const expected = signDocumentAccessPayload(encodedPayload);
  const valid = signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) throw new AppError(401, 'Document access link is invalid', 'DOCUMENT_ACCESS_INVALID');

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as DocumentAccessToken;
    if (
      !documentKindValues.includes(payload.kind)
      || !['MANAGER', 'TENANT'].includes(payload.role)
      || !['VIEW', 'DOWNLOAD'].includes(payload.action)
      || !payload.documentId
      || !payload.actorUserId
      || !Number.isInteger(payload.expiresAt)
    ) {
      throw new Error('Invalid token payload');
    }
    if (payload.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new AppError(410, 'Document access link has expired', 'DOCUMENT_ACCESS_EXPIRED');
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'Document access link is invalid', 'DOCUMENT_ACCESS_INVALID');
  }
};

const assertActiveActor = async (scope: DocumentAuthScope): Promise<void> => {
  const result = await query<{ role: AppRole; is_active: boolean; account_status: string }>(
    `SELECT role, is_active, account_status
     FROM app_user
     WHERE id=$1
     LIMIT 1`,
    [scope.userId]
  );
  const actor = result.rows[0];
  if (!actor || !actor.is_active || actor.account_status !== 'ACTIVE' || actor.role !== scope.role) {
    throw new AppError(403, 'You no longer have permission to access this document', 'DOCUMENT_ACCESS_FORBIDDEN');
  }
};

export const getAuthorizedDocumentAsset = async (
  kind: DocumentKind,
  documentId: string,
  scope: DocumentAuthScope
): Promise<DocumentAssetRow> => {
  await assertActiveActor(scope);
  let result;

  if (kind === 'TENANT_DOCUMENT') {
    result = await query<DocumentAssetRow>(
      `SELECT ${commonProjection('d', kind)}, d.tenant_id, d.doc_type
       FROM tenant_document d
       JOIN tenant t ON t.id=d.tenant_id
       WHERE d.id=$1
         AND (
           ($3='MANAGER' AND t.manager_user_id=$2)
           OR ($3='TENANT' AND t.user_id=$2)
         )
       LIMIT 1`,
      [documentId, scope.userId, scope.role]
    );
  } else if (kind === 'PAYMENT_PROOF') {
    result = await query<DocumentAssetRow>(
      `SELECT ${commonProjection('d', kind)}
       FROM payment_proof d
       JOIN payment_request pr ON pr.id=d.payment_request_id
       JOIN invoice i ON i.id=pr.invoice_id
       JOIN contract c ON c.id=i.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE d.id=$1
         AND (
           ($3='MANAGER' AND b.manager_user_id=$2)
           OR ($3='TENANT' AND d.submitted_by_user_id=$2)
         )
       LIMIT 1`,
      [documentId, scope.userId, scope.role]
    );
  } else if (kind === 'UTILITY_EVIDENCE') {
    result = await query<DocumentAssetRow>(
      `SELECT ${commonProjection('d', kind)}
       FROM utility_reading_evidence d
       JOIN utility_reading ur ON ur.id=d.utility_reading_id
       JOIN room r ON r.id=ur.room_id
       JOIN building b ON b.id=r.building_id
       WHERE d.id=$1
         AND (
           ($3='MANAGER' AND b.manager_user_id=$2)
           OR (
             $3='TENANT'
             AND EXISTS (
               SELECT 1
               FROM contract c
               JOIN contract_tenant ct ON ct.contract_id=c.id
               JOIN tenant t ON t.id=ct.tenant_id
               WHERE c.room_id=ur.room_id
                 AND t.user_id=$2
                 AND ct.joined_at <= (ur.month + interval '1 month - 1 day')::date
                 AND (ct.left_at IS NULL OR ct.left_at >= ur.month)
                 AND c.status <> 'CANCELLED'
             )
           )
         )
       LIMIT 1`,
      [documentId, scope.userId, scope.role]
    );
  } else {
    result = await query<DocumentAssetRow>(
      `SELECT ${commonProjection('d', kind)}
       FROM contract_document d
       JOIN contract c ON c.id=d.contract_id
       JOIN room r ON r.id=c.room_id
       JOIN building b ON b.id=r.building_id
       WHERE d.id=$1
         AND (
           ($3='MANAGER' AND b.manager_user_id=$2)
           OR (
             $3='TENANT'
             AND EXISTS (
               SELECT 1
               FROM contract_tenant ct
               JOIN tenant t ON t.id=ct.tenant_id
               WHERE ct.contract_id=c.id AND t.user_id=$2
             )
           )
         )
       LIMIT 1`,
      [documentId, scope.userId, scope.role]
    );
  }

  const asset = result.rows[0];
  if (!asset) throw new AppError(404, 'Document not found or access is not allowed', 'DOCUMENT_NOT_FOUND');
  resolveCloudinaryAsset(asset);
  return asset;
};

const getRequestOrigin = (req: Request): string => {
  if (env.DOCUMENT_DELIVERY_BASE_URL) return env.DOCUMENT_DELIVERY_BASE_URL.replace(/\/+$/, '');
  const forwardedHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.get('host');
  if (!host) throw new AppError(500, 'Document delivery URL is not configured', 'DOCUMENT_DELIVERY_NOT_CONFIGURED');
  return `${req.protocol}://${host}`;
};

export const createAuthorizedDocumentAccessUrl = async (
  req: Request,
  kind: DocumentKind,
  documentId: string,
  scope: DocumentAuthScope,
  action: DocumentAccessAction = 'VIEW'
): Promise<{ url: string; expiresAt: string }> => {
  await getAuthorizedDocumentAsset(kind, documentId, scope);
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + env.DOCUMENT_ACCESS_TTL_SECONDS;
  const token = createDocumentAccessToken({
    kind,
    documentId,
    actorUserId: scope.userId,
    role: scope.role,
    action,
    expiresAt: expiresAtSeconds
  });
  return {
    url: `${getRequestOrigin(req)}/api/documents/delivery/${token}`,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString()
  };
};

export const presentDocumentAsset = async <T extends { id: string; file_url?: unknown }>(
  req: Request,
  kind: DocumentKind,
  row: T,
  scope: DocumentAuthScope
): Promise<T & { file_url: string; access_expires_at: string }> => {
  const access = await createAuthorizedDocumentAccessUrl(req, kind, row.id, scope);
  const {
    cloudinary_asset_id: _assetId,
    cloudinary_public_id: _publicId,
    cloudinary_resource_type: _resourceType,
    cloudinary_version: _version,
    cloudinary_format: _format,
    cloudinary_delivery_type: _deliveryType,
    ...safeRow
  } = row as T & Record<string, unknown>;
  return {
    ...safeRow,
    file_url: access.url,
    access_expires_at: access.expiresAt
  } as T & { file_url: string; access_expires_at: string };
};

const safeFileName = (value: string | null, fallback: string): string => (
  (value || fallback).replace(/[\r\n"\\/]/g, '_').slice(0, 180)
);

const auditIdentityDocumentAccess = async (
  asset: DocumentAssetRow,
  payload: DocumentAccessToken
): Promise<void> => {
  if (asset.source_kind !== 'TENANT_DOCUMENT' || !['IDENTITY_FRONT', 'IDENTITY_BACK'].includes(asset.doc_type ?? '')) return;
  await writeAuditLog({ query }, {
    actorUserId: payload.actorUserId,
    action: payload.action === 'DOWNLOAD' ? 'TENANT_IDENTITY_DOCUMENT_DOWNLOADED' : 'TENANT_IDENTITY_DOCUMENT_VIEWED',
    entityType: 'tenant_document',
    entityId: asset.id,
    metadata: { tenantId: asset.tenant_id, documentType: asset.doc_type }
  });
};

export const fetchAuthorizedDocument = async (
  token: string
): Promise<{
  body: Buffer;
  contentType: string;
  contentDisposition: string;
}> => {
  const payload = verifyDocumentAccessToken(token);
  const asset = await getAuthorizedDocumentAsset(payload.kind, payload.documentId, {
    userId: payload.actorUserId,
    role: payload.role
  });
  const resolved = resolveCloudinaryAsset(asset);
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const privateUrl = createCloudinaryPrivateDownloadUrl({
    ...asset,
    delivery_type: resolved.deliveryType
  }, expiresAt);

  let response = await fetch(privateUrl, { redirect: 'follow' });
  if (!response.ok && resolved.deliveryType === 'upload' && asset.file_url) {
    response = await fetch(asset.file_url, { redirect: 'follow' });
  }
  if (!response.ok) {
    throw new AppError(502, 'Document content is temporarily unavailable', 'DOCUMENT_DELIVERY_FAILED');
  }

  const declaredSize = Number(asset.file_size ?? 0);
  if (declaredSize > 0 && declaredSize > env.UPLOAD_MAX_CONTRACT_DOCUMENT_MB * 1024 * 1024) {
    throw new AppError(413, 'Document exceeds the configured delivery limit', 'DOCUMENT_DELIVERY_TOO_LARGE');
  }
  const body = Buffer.from(await response.arrayBuffer());
  const hardLimit = env.UPLOAD_MAX_CONTRACT_DOCUMENT_MB * 1024 * 1024;
  if (body.byteLength > hardLimit) {
    throw new AppError(413, 'Document exceeds the configured delivery limit', 'DOCUMENT_DELIVERY_TOO_LARGE');
  }

  await auditIdentityDocumentAccess(asset, payload);
  const fileName = safeFileName(asset.file_name, `${asset.id}.${resolved.format || 'bin'}`);
  return {
    body,
    contentType: asset.mime_type || response.headers.get('content-type') || 'application/octet-stream',
    contentDisposition: `${payload.action === 'DOWNLOAD' ? 'attachment' : 'inline'}; filename="${fileName}"`
  };
};
