import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  withTransaction: vi.fn()
}));
const repositoryMocks = vi.hoisted(() => ({
  assertTenantBelongsToManager: vi.fn()
}));
const uploadMocks = vi.hoisted(() => ({
  deleteCloudinaryUpload: vi.fn()
}));

vi.mock('../src/db', () => ({
  withTransaction: dbMocks.withTransaction
}));
vi.mock('../src/modules/tenants/tenants.repository', () => ({
  assertTenantBelongsToManager: repositoryMocks.assertTenantBelongsToManager
}));
vi.mock('../src/modules/uploads/uploads.service', () => ({
  deleteCloudinaryUpload: uploadMocks.deleteCloudinaryUpload
}));

import { updateTenantIdentityDocuments } from '../src/modules/tenants/tenant-identity-documents.service';

const oldFront = {
  id: 'front-old',
  tenant_id: 'tenant-1',
  doc_type: 'IDENTITY_FRONT',
  file_name: 'old-front.jpg',
  file_url: 'https://res.cloudinary.com/demo/image/upload/tenant-documents/old-front.jpg',
  mime_type: 'image/jpeg',
  file_size: 100,
  uploaded_at: '2026-07-01T00:00:00.000Z'
};
const oldBack = {
  ...oldFront,
  id: 'back-old',
  doc_type: 'IDENTITY_BACK',
  file_name: 'old-back.jpg',
  file_url: 'https://res.cloudinary.com/demo/image/upload/tenant-documents/old-back.jpg'
};
const newFront = {
  ...oldFront,
  id: 'front-new',
  file_name: 'new-front.jpg',
  file_url: 'https://res.cloudinary.com/demo/image/upload/tenant-documents/new-front.jpg',
  file_size: 200
};

describe('updateTenantIdentityDocuments', () => {
  beforeEach(() => {
    repositoryMocks.assertTenantBelongsToManager.mockResolvedValue(undefined);
    uploadMocks.deleteCloudinaryUpload.mockResolvedValue(undefined);
  });

  it('replaces selected identity images, removes cleared images, and deletes superseded Cloudinary assets', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [oldFront, oldBack] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [newFront] })
    };
    dbMocks.withTransaction.mockImplementation(async (callback: (transactionClient: typeof client) => unknown) => callback(client));

    const result = await updateTenantIdentityDocuments('tenant-1', 'manager-1', 'manager-1', {
      front: {
        file_name: 'new-front.jpg',
        file_url: newFront.file_url,
        mime_type: 'image/jpeg',
        file_size: 200,
        resource_type: 'image'
      },
      back: null
    });

    expect(repositoryMocks.assertTenantBelongsToManager).toHaveBeenCalledWith(client, 'tenant-1', 'manager-1');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO tenant_document'))).toBe(true);
    expect(uploadMocks.deleteCloudinaryUpload).toHaveBeenCalledTimes(2);
    expect(uploadMocks.deleteCloudinaryUpload).toHaveBeenCalledWith({ file_url: oldFront.file_url });
    expect(uploadMocks.deleteCloudinaryUpload).toHaveBeenCalledWith({ file_url: oldBack.file_url });
    expect(result.front?.file_url).toBe(newFront.file_url);
    expect(result.back).toBeNull();
  });
});
