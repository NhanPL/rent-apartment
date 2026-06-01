import { API_ROUTES } from './apiRoutes'
import { apiRequest } from './apiClient'

export type UploadContext = 'TENANT_DOCUMENT' | 'UTILITY_EVIDENCE' | 'PAYMENT_PROOF' | 'CONTRACT_DOCUMENT'
export type UploadResourceType = 'image' | 'raw'

interface UploadSignature {
  cloud_name: string
  api_key: string
  timestamp: number
  signature: string
  folder: string
  resource_type: UploadResourceType
  upload_url: string
  allowed_mime_types: string[]
  max_file_size: number
}

interface CloudinaryUploadResponse {
  secure_url: string
  original_filename?: string
  bytes: number
  resource_type: UploadResourceType
  public_id: string
}

export interface UploadedCloudinaryFile {
  file_name: string
  file_url: string
  mime_type: string
  file_size: number
  resource_type: UploadResourceType
  public_id: string
}

const inferResourceType = (mimeType: string): UploadResourceType => (mimeType.startsWith('image/') ? 'image' : 'raw')

const getFileName = (file: File): string => file.name || 'upload'

const getMimeType = (file: File): string => file.type || 'application/octet-stream'

async function getUploadSignature(file: File, context: UploadContext): Promise<UploadSignature> {
  const searchParams = new URLSearchParams({
    context,
    file_size: String(file.size),
    mime_type: getMimeType(file),
    resource_type: inferResourceType(getMimeType(file)),
  })

  return apiRequest<UploadSignature>(`${API_ROUTES.uploads.signature}?${searchParams.toString()}`)
}

async function parseCloudinaryError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  return payload?.error?.message ?? 'Unable to upload file to Cloudinary'
}

export async function uploadFileToCloudinary(file: File, context: UploadContext): Promise<UploadedCloudinaryFile> {
  const signature = await getUploadSignature(file, context)
  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', signature.api_key)
  formData.append('timestamp', String(signature.timestamp))
  formData.append('signature', signature.signature)
  formData.append('folder', signature.folder)

  const response = await fetch(signature.upload_url, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await parseCloudinaryError(response))
  }

  const uploaded = (await response.json()) as CloudinaryUploadResponse
  return {
    file_name: getFileName(file),
    file_url: uploaded.secure_url,
    mime_type: getMimeType(file),
    file_size: uploaded.bytes || file.size,
    resource_type: uploaded.resource_type,
    public_id: uploaded.public_id,
  }
}
