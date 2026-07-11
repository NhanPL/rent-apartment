import { describe, expect, it } from 'vitest';
import { resolveCloudinaryAsset } from '../src/modules/uploads/uploads.service';

describe('Cloudinary asset metadata', () => {
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
});
