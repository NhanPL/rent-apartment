import { describe, expect, it } from 'vitest';
import {
  assertUploadContextAllowed,
  getUploadContextConfig,
  resolveCloudinaryAsset,
  validateStoredUpload,
  validateUploadFile
} from '../src/modules/uploads/uploads.service';

describe('Cloudinary asset metadata', () => {
  it('allows managers to upload tenant identity documents', () => {
    expect(() => assertUploadContextAllowed('TENANT_DOCUMENT', 'MANAGER')).not.toThrow();
  });

  it('resolves raw document public IDs from secure URLs', () => {
    expect(resolveCloudinaryAsset({
      file_url: 'https://res.cloudinary.com/rentmate/raw/upload/v123/rent-apartment/contract-documents/signed.pdf'
    })).toEqual({
      publicId: 'rent-apartment/contract-documents/signed.pdf',
      resourceType: 'raw'
    });
  });

  it('removes the delivery extension from image public IDs', () => {
    expect(resolveCloudinaryAsset({
      file_url: 'https://res.cloudinary.com/rentmate/image/upload/v123/rent-apartment/contract-documents/photo.jpg'
    })).toEqual({
      publicId: 'rent-apartment/contract-documents/photo',
      resourceType: 'image'
    });
  });

  it('uses a separate upload size limit for every file context', () => {
    expect(getUploadContextConfig('TENANT_DOCUMENT').maxBytes).toBe(10 * 1024 * 1024);
    expect(getUploadContextConfig('UTILITY_EVIDENCE').maxBytes).toBe(5 * 1024 * 1024);
    expect(getUploadContextConfig('PAYMENT_PROOF').maxBytes).toBe(5 * 1024 * 1024);
    expect(getUploadContextConfig('CONTRACT_DOCUMENT').maxBytes).toBe(15 * 1024 * 1024);
  });

  it('rejects a resource type that contradicts the declared MIME type', () => {
    expect(() => validateUploadFile('CONTRACT_DOCUMENT', {
      mime_type: 'application/pdf',
      file_size: 1024,
      resource_type: 'image'
    })).toThrow('Resource type does not match the declared file type');
  });

  it('rejects stored metadata outside its signed Cloudinary context', () => {
    expect(() => validateStoredUpload('PAYMENT_PROOF', {
      file_name: 'proof.jpg',
      file_url: 'https://res.cloudinary.com/rentmate/image/upload/v1/rent-apartment/tenant-documents/proof.jpg',
      mime_type: 'image/jpeg',
      file_size: 1024,
      resource_type: 'image'
    }, 'TENANT')).toThrow('Uploaded file does not match the signed upload context');
  });
});
