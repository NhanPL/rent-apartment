import type { PoolClient } from 'pg';
import { withTransaction } from '../../db';
import { deleteCloudinaryUpload, type UploadFileMetadata } from '../uploads/uploads.service';
import { assertTenantBelongsToManager } from './tenants.repository';

export type TenantIdentityDocumentType = 'IDENTITY_FRONT' | 'IDENTITY_BACK';

export interface TenantIdentityDocumentRow {
  id: string;
  tenant_id: string;
  doc_type: TenantIdentityDocumentType;
  file_name: string | null;
  file_url: string;
  mime_type: string;
  file_size: number | string;
  uploaded_at: string;
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
    `SELECT id, tenant_id, doc_type, file_name, file_url, mime_type, file_size, uploaded_at
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
      `SELECT id, tenant_id, doc_type, file_name, file_url, mime_type, file_size, uploaded_at
       FROM tenant_document
       WHERE tenant_id=$1 AND doc_type IN ('IDENTITY_FRONT', 'IDENTITY_BACK')
       FOR UPDATE`,
      [tenantId]
    );
    const replacedUrls: string[] = [];

    for (const { key, docType } of slots) {
      if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

      const nextDocument = updates[key];
      const currentDocuments = existing.rows.filter((document) => document.doc_type === docType);
      const unchanged = currentDocuments.length === 1
        && nextDocument
        && currentDocuments[0].file_url === nextDocument.file_url;

      if (unchanged) {
        await client.query(
          `UPDATE tenant_document
           SET file_name=$1, mime_type=$2, file_size=$3, uploaded_by_user_id=$4, uploaded_at=now()
           WHERE id=$5`,
          [nextDocument.file_name ?? null, nextDocument.mime_type, nextDocument.file_size, uploadedByUserId, currentDocuments[0].id]
        );
        continue;
      }

      replacedUrls.push(...currentDocuments
        .map((document) => document.file_url)
        .filter((fileUrl) => fileUrl !== nextDocument?.file_url));
      await client.query('DELETE FROM tenant_document WHERE tenant_id=$1 AND doc_type=$2', [tenantId, docType]);

      if (nextDocument) {
        await client.query(
          `INSERT INTO tenant_document(tenant_id, doc_type, file_name, file_url, mime_type, file_size, uploaded_by_user_id)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [tenantId, docType, nextDocument.file_name ?? null, nextDocument.file_url, nextDocument.mime_type, nextDocument.file_size, uploadedByUserId]
        );
      }
    }

    return { documents: await listIdentityDocuments(client, tenantId), replacedUrls };
  });

  const retainedUrls = new Set(result.documents.map((document) => document.file_url));
  const urlsToDelete = [...new Set(result.replacedUrls)].filter((fileUrl) => !retainedUrls.has(fileUrl));
  await Promise.all(urlsToDelete.map((fileUrl) => deleteCloudinaryUpload({ file_url: fileUrl })));

  return mapTenantIdentityDocuments(result.documents);
};
