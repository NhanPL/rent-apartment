import type { PoolClient } from 'pg';
import { withTransaction } from '../../db';
import { writeAuditLog } from '../../shared/services/audit-log.service';
import {
  getDocumentRetentionUntil,
  resolveCloudinaryAsset,
  type UploadFileMetadata
} from '../uploads/uploads.service';
import {
  enqueueCloudinaryDeletion,
  processCloudinaryAssetJobs
} from '../documents/document-asset-jobs.service';
import { assertTenantBelongsToManager } from './tenants.repository';

export type TenantIdentityDocumentType = 'IDENTITY_FRONT' | 'IDENTITY_BACK';

export interface TenantIdentityDocumentRow {
  id: string;
  tenant_id: string;
  doc_type: TenantIdentityDocumentType;
  file_name: string | null;
  file_url: string | null;
  mime_type: string;
  file_size: number | string;
  uploaded_at: string;
  cloudinary_asset_id?: string | null;
  cloudinary_public_id?: string | null;
  cloudinary_resource_type?: 'image' | 'raw' | null;
  cloudinary_version?: number | string | null;
  cloudinary_format?: string | null;
  cloudinary_delivery_type?: 'upload' | 'private' | 'authenticated' | null;
}

export interface TenantIdentityDocumentUpdates {
  front?: UploadFileMetadata | null;
  back?: UploadFileMetadata | null;
}

export interface TenantIdentityDocuments {
  front: TenantIdentityDocumentRow | null;
  back: TenantIdentityDocumentRow | null;
}

const slots: Array<{ key: keyof TenantIdentityDocumentUpdates; docType: TenantIdentityDocumentType }> = [
  { key: 'front', docType: 'IDENTITY_FRONT' },
  { key: 'back', docType: 'IDENTITY_BACK' }
];

const normalizeDocument = (document: TenantIdentityDocumentRow | undefined): TenantIdentityDocumentRow | null => (
  document ? { ...document, file_size: Number(document.file_size) } : null
);

export const mapTenantIdentityDocuments = (rows: TenantIdentityDocumentRow[]): TenantIdentityDocuments => ({
  front: normalizeDocument(rows.find((row) => row.doc_type === 'IDENTITY_FRONT')),
  back: normalizeDocument(rows.find((row) => row.doc_type === 'IDENTITY_BACK'))
});

const listIdentityDocuments = async (client: PoolClient, tenantId: string): Promise<TenantIdentityDocumentRow[]> => (
  await client.query<TenantIdentityDocumentRow>(
    `SELECT id, tenant_id, doc_type, file_name, file_url, mime_type, file_size, uploaded_at,
            cloudinary_asset_id, cloudinary_public_id, cloudinary_resource_type,
            cloudinary_version, cloudinary_format, cloudinary_delivery_type
     FROM tenant_document
     WHERE tenant_id=$1 AND doc_type IN ('IDENTITY_FRONT', 'IDENTITY_BACK')
     ORDER BY uploaded_at DESC, created_at DESC`,
    [tenantId]
  )
).rows;

export const updateTenantIdentityDocuments = async (
  tenantId: string,
  managerId: string,
  uploadedByUserId: string,
  updates: TenantIdentityDocumentUpdates
): Promise<TenantIdentityDocuments> => {
  const result = await withTransaction(async (client) => {
    await assertTenantBelongsToManager(client, tenantId, managerId);
    const existing = await client.query<TenantIdentityDocumentRow>(
      `SELECT id, tenant_id, doc_type, file_name, file_url, mime_type, file_size, uploaded_at,
              cloudinary_asset_id, cloudinary_public_id, cloudinary_resource_type,
              cloudinary_version, cloudinary_format, cloudinary_delivery_type
       FROM tenant_document
       WHERE tenant_id=$1 AND doc_type IN ('IDENTITY_FRONT', 'IDENTITY_BACK')
       FOR UPDATE`,
      [tenantId]
    );
    for (const { key, docType } of slots) {
      if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

      const nextDocument = updates[key];
      const currentDocuments = existing.rows.filter((document) => document.doc_type === docType);
      const nextAsset = nextDocument ? resolveCloudinaryAsset(nextDocument) : null;
      const unchanged = currentDocuments.length === 1
        && nextAsset
        && resolveCloudinaryAsset({
          file_url: currentDocuments[0].file_url,
          public_id: currentDocuments[0].cloudinary_public_id,
          resource_type: currentDocuments[0].cloudinary_resource_type,
          version: currentDocuments[0].cloudinary_version,
          format: currentDocuments[0].cloudinary_format,
          delivery_type: currentDocuments[0].cloudinary_delivery_type
        }).publicId === nextAsset.publicId;

      if (unchanged && nextDocument) {
        await client.query(
          `UPDATE tenant_document
           SET file_name=$1, mime_type=$2, file_size=$3, uploaded_by_user_id=$4, uploaded_at=now(),
               retention_until=$5
           WHERE id=$6`,
          [
            nextDocument.file_name ?? null,
            nextDocument.mime_type,
            nextDocument.file_size,
            uploadedByUserId,
            getDocumentRetentionUntil('TENANT_DOCUMENT'),
            currentDocuments[0].id
          ]
        );
        continue;
      }

      for (const document of currentDocuments) {
        await enqueueCloudinaryDeletion(client, 'TENANT_DOCUMENT', document, 'TENANT_IDENTITY_DOCUMENT_REPLACED');
        await writeAuditLog(client, {
          actorUserId: uploadedByUserId,
          action: 'TENANT_IDENTITY_DOCUMENT_DELETED',
          entityType: 'tenant_document',
          entityId: document.id,
          metadata: { tenantId, documentType: document.doc_type, reason: 'REPLACED' },
          before: {
            tenantId,
            documentType: document.doc_type,
            fileName: document.file_name,
            mimeType: document.mime_type,
            fileSize: document.file_size,
            uploadedAt: document.uploaded_at
          }
        });
      }
      await client.query('DELETE FROM tenant_document WHERE tenant_id=$1 AND doc_type=$2', [tenantId, docType]);

      if (nextDocument && nextAsset) {
        const created = await client.query<{ id: string; uploaded_at: string }>(
          `INSERT INTO tenant_document(
             tenant_id, doc_type, file_name, file_url, mime_type, file_size, uploaded_by_user_id,
             cloudinary_asset_id, cloudinary_public_id, cloudinary_resource_type,
             cloudinary_version, cloudinary_format, cloudinary_delivery_type, retention_until
           )
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING id, uploaded_at`,
          [
            tenantId,
            docType,
            nextDocument.file_name ?? null,
            null,
            nextDocument.mime_type,
            nextDocument.file_size,
            uploadedByUserId,
            nextAsset.assetId,
            nextAsset.publicId,
            nextAsset.resourceType,
            nextAsset.version,
            nextAsset.format,
            nextAsset.deliveryType,
            getDocumentRetentionUntil('TENANT_DOCUMENT')
          ]
        );
        await writeAuditLog(client, {
          actorUserId: uploadedByUserId,
          action: 'TENANT_IDENTITY_DOCUMENT_CREATED',
          entityType: 'TENANT_DOCUMENT',
          entityId: created.rows[0].id,
          after: {
            tenantId,
            documentType: docType,
            fileName: nextDocument.file_name ?? null,
            mimeType: nextDocument.mime_type,
            fileSize: nextDocument.file_size,
            uploadedAt: created.rows[0].uploaded_at
          }
        });
      }
    }

    return { documents: await listIdentityDocuments(client, tenantId) };
  });

  void processCloudinaryAssetJobs();

  return mapTenantIdentityDocuments(result.documents);
};
