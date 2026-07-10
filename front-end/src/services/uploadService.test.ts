import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadFileToCloudinary } from './uploadService'

const apiMocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock('./apiClient', () => ({
  apiRequest: apiMocks.apiRequest,
}))

describe('uploadFileToCloudinary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('infers application/pdf when the browser omits the PDF MIME type', async () => {
    apiMocks.apiRequest.mockResolvedValue({
      cloud_name: 'rentmate',
      api_key: 'api-key',
      timestamp: 123456,
      signature: 'signed-value',
      folder: 'rent-apartment/contract-documents',
      resource_type: 'raw',
      upload_url: 'https://api.cloudinary.com/v1_1/rentmate/raw/upload',
      allowed_mime_types: ['application/pdf'],
      max_file_size: 15 * 1024 * 1024,
    })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        secure_url: 'https://res.cloudinary.com/rentmate/raw/upload/signed-contract.pdf',
        bytes: 7,
        resource_type: 'raw',
        public_id: 'rent-apartment/contract-documents/signed-contract',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['content'], 'SIGNED-CONTRACT.PDF', { type: '' })
    const uploaded = await uploadFileToCloudinary(file, 'CONTRACT_DOCUMENT')

    const signatureUrl = String(apiMocks.apiRequest.mock.calls[0][0])
    const signatureParams = new URL(signatureUrl, 'http://localhost').searchParams
    expect(signatureParams.get('mime_type')).toBe('application/pdf')
    expect(signatureParams.get('resource_type')).toBe('raw')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudinary.com/v1_1/rentmate/raw/upload',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(uploaded).toMatchObject({
      file_name: 'SIGNED-CONTRACT.PDF',
      mime_type: 'application/pdf',
      resource_type: 'raw',
    })
  })
})
