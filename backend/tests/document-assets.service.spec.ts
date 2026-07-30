import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn()
}));

vi.mock('../src/db', () => ({
  query: dbMocks.query
}));

import {
  createAuthorizedDocumentAccessUrl,
  getAuthorizedDocumentAsset,
  verifyDocumentAccessToken
} from '../src/modules/documents/document-assets.service';
import { resolveDocumentDeliveryBaseUrl } from '../src/config/env';

const activeManager = {
  role: 'MANAGER',
  is_active: true,
  account_status: 'ACTIVE'
};

const tenantDocument = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  file_name: 'identity-front.jpg',
  file_url: null,
  mime_type: 'image/jpeg',
  file_size: 100,
  asset_id: 'cloudinary-asset',
  public_id: 'rent-apartment/tenant-documents/identity-front',
  resource_type: 'image',
  version: 123,
  format: 'jpg',
  delivery_type: 'authenticated',
  source_kind: 'TENANT_DOCUMENT',
  tenant_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  doc_type: 'IDENTITY_FRONT'
};

describe('document asset authorization', () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
  });

  it('creates a short-lived signed URL only after the manager scope query succeeds', async () => {
    dbMocks.query
      .mockResolvedValueOnce({ rows: [activeManager] })
      .mockResolvedValueOnce({ rows: [tenantDocument] });
    const request = {
      protocol: 'https',
      get: (name: string) => name === 'host' ? 'api.example.test' : undefined
    } as any;

    const access = await createAuthorizedDocumentAccessUrl(
      request,
      'TENANT_DOCUMENT',
      tenantDocument.id,
      { userId: 'manager-1', role: 'MANAGER' },
      'DOWNLOAD'
    );

    expect(access.url).toMatch(/^https:\/\/api[.]example[.]test\/api\/documents\/delivery\//);
    const token = access.url.split('/').pop()!;
    expect(verifyDocumentAccessToken(token)).toMatchObject({
      kind: 'TENANT_DOCUMENT',
      documentId: tenantDocument.id,
      actorUserId: 'manager-1',
      role: 'MANAGER',
      action: 'DOWNLOAD'
    });
    expect(dbMocks.query.mock.calls[1][1]).toEqual([
      tenantDocument.id,
      'manager-1',
      'MANAGER'
    ]);
  });

  it('does not issue an access link when tenant ownership is not found', async () => {
    dbMocks.query
      .mockResolvedValueOnce({
        rows: [{ role: 'TENANT', is_active: true, account_status: 'ACTIVE' }]
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(getAuthorizedDocumentAsset(
      'PAYMENT_PROOF',
      tenantDocument.id,
      { userId: 'other-tenant', role: 'TENANT' }
    )).rejects.toMatchObject({
      statusCode: 404,
      code: 'DOCUMENT_NOT_FOUND'
    });
  });

  it('rejects expired and tampered access tokens', () => {
    const expiredPayload = Buffer.from(JSON.stringify({
      kind: 'TENANT_DOCUMENT',
      documentId: tenantDocument.id,
      actorUserId: 'manager-1',
      role: 'MANAGER',
      action: 'VIEW',
      expiresAt: Math.floor(Date.now() / 1000) - 1
    })).toString('base64url');
    const signature = crypto
      .createHmac('sha256', process.env.JWT_ACCESS_SECRET!)
      .update(expiredPayload)
      .digest('base64url');

    expect(() => verifyDocumentAccessToken(`${expiredPayload}.${signature}`)).toThrow(
      'Document access link has expired'
    );
    expect(() => verifyDocumentAccessToken(`${expiredPayload}.${signature}x`)).toThrow(
      'Document access link is invalid'
    );
  });

  it('requires a trusted delivery origin outside development and test', () => {
    expect(resolveDocumentDeliveryBaseUrl('development', '')).toBe('');
    expect(resolveDocumentDeliveryBaseUrl('production', 'https://api.example.test/')).toBe(
      'https://api.example.test'
    );
    expect(() => resolveDocumentDeliveryBaseUrl('staging', '')).toThrow(
      'DOCUMENT_DELIVERY_BASE_URL is required when APP_ENV=staging'
    );
  });
});
