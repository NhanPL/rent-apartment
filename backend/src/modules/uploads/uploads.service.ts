import crypto from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/app-error';
import type { AppRole } from '../../shared/middleware/auth';

export const uploadContextValues = ['TENANT_DOCUMENT', 'UTILITY_EVIDENCE', 'PAYMENT_PROOF', 'CONTRACT_DOCUMENT'] as const;
export type UploadContext = typeof uploadContextValues[number];

export const uploadResourceTypeValues = ['image', 'raw'] as const;
export type UploadResourceType = typeof uploadResourceTypeValues[number];

export interface UploadFileMetadata {
  file_name?: string | null;
  file_url: string;
  mime_type: string;
  file_size: number;
  resource_type?: UploadResourceType;
}

export interface CloudinaryAssetMetadata {
  file_url: string;
}

interface UploadContextConfig {
  folder: string;
  maxBytes: number;
  allowedMimeTypes: string[];
  allowedFormats: string[];
  allowedResourceTypes: UploadResourceType[];
  roles: AppRole[];
}

const rootFolder = env.CLOUDINARY_UPLOAD_ROOT_FOLDER.replace(/^\/+|\/+$/g, '') || 'rent-apartment';

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const imageAndPdfMimeTypes = [...imageMimeTypes, 'application/pdf'];
const megabytes = (value: number): number => value * 1024 * 1024;

const contextConfig: Record<UploadContext, UploadContextConfig> = {
  TENANT_DOCUMENT: {
    folder: `${rootFolder}/tenant-documents`,
    maxBytes: megabytes(env.UPLOAD_MAX_TENANT_DOCUMENT_MB),
    allowedMimeTypes: imageAndPdfMimeTypes,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    allowedResourceTypes: ['image', 'raw'],
    roles: ['TENANT', 'MANAGER']
  },
  UTILITY_EVIDENCE: {
    folder: `${rootFolder}/utility-evidence`,
    maxBytes: megabytes(env.UPLOAD_MAX_UTILITY_EVIDENCE_MB),
    allowedMimeTypes: imageMimeTypes,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    allowedResourceTypes: ['image'],
    roles: ['TENANT', 'MANAGER']
  },
  PAYMENT_PROOF: {
    folder: `${rootFolder}/payment-proofs`,
    maxBytes: megabytes(env.UPLOAD_MAX_PAYMENT_PROOF_MB),
    allowedMimeTypes: imageMimeTypes,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    allowedResourceTypes: ['image'],
    roles: ['TENANT']
  },
  CONTRACT_DOCUMENT: {
    folder: `${rootFolder}/contract-documents`,
    maxBytes: megabytes(env.UPLOAD_MAX_CONTRACT_DOCUMENT_MB),
    allowedMimeTypes: imageAndPdfMimeTypes,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    allowedResourceTypes: ['image', 'raw'],
    roles: ['MANAGER']
  }
};

const hasUsableCredential = (value: string | undefined, minimumLength: number): boolean => (
  Boolean(value && value.trim().length >= minimumLength)
);

const cloudinaryConfigured = () => (
  hasUsableCredential(env.CLOUDINARY_CLOUD_NAME, 2)
  && hasUsableCredential(env.CLOUDINARY_API_KEY, 6)
  && hasUsableCredential(env.CLOUDINARY_API_SECRET, 8)
);

const inferResourceType = (mimeType: string): UploadResourceType => (
  mimeType.startsWith('image/') ? 'image' : 'raw'
);

const signParams = (params: Record<string, string | number>, apiSecret: string): string => {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
};

export const getUploadContextConfig = (context: UploadContext): UploadContextConfig => contextConfig[context];

export const assertUploadContextAllowed = (context: UploadContext, role: AppRole): void => {
  const config = getUploadContextConfig(context);
  if (!config.roles.includes(role)) {
    throw new AppError(403, 'Upload context is not allowed for this role', 'UPLOAD_CONTEXT_FORBIDDEN');
  }
};

export const validateUploadFile = (
  context: UploadContext,
  payload: Pick<UploadFileMetadata, 'mime_type' | 'file_size' | 'resource_type'> & { folder?: string | null }
): UploadResourceType => {
  const config = getUploadContextConfig(context);
  const mimeType = payload.mime_type.trim().toLowerCase();
  const resourceType = payload.resource_type ?? inferResourceType(mimeType);

  if (payload.folder && payload.folder !== config.folder) {
    throw new AppError(400, 'Upload folder is not allowed for this context', 'UPLOAD_FOLDER_INVALID');
  }

  if (!config.allowedMimeTypes.includes(mimeType)) {
    throw new AppError(400, 'File type is not allowed for this upload context', 'UPLOAD_MIME_INVALID');
  }

  if (!config.allowedResourceTypes.includes(resourceType)) {
    throw new AppError(400, 'Resource type is not allowed for this upload context', 'UPLOAD_RESOURCE_TYPE_INVALID');
  }

  if (resourceType !== inferResourceType(mimeType)) {
    throw new AppError(400, 'Resource type does not match the declared file type', 'UPLOAD_RESOURCE_TYPE_INVALID');
  }

  if (!Number.isInteger(payload.file_size) || payload.file_size <= 0 || payload.file_size > config.maxBytes) {
    throw new AppError(400, 'File size exceeds the upload limit for this context', 'UPLOAD_SIZE_INVALID');
  }

  return resourceType;
};

export const assertCloudinaryUrl = (
  fileUrl: string,
  expected?: {
    folder: string;
    resourceType: UploadResourceType;
    mimeType: string;
  }
): void => {
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') {
      throw new AppError(400, 'Uploaded file must be hosted on the configured Cloudinary cloud', 'UPLOAD_URL_INVALID');
    }

    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (env.CLOUDINARY_CLOUD_NAME && segments[0] !== env.CLOUDINARY_CLOUD_NAME) {
      throw new AppError(400, 'Uploaded file must be hosted on the configured Cloudinary cloud', 'UPLOAD_URL_INVALID');
    }

    if (expected) {
      const uploadIndex = segments.indexOf('upload');
      const resourceType = segments[uploadIndex - 1];
      const assetSegments = segments
        .slice(uploadIndex + 1)
        .filter((segment, index) => !(index === 0 && /^v\d+$/.test(segment)));
      const assetPath = assetSegments.join('/');
      const extension = assetSegments.at(-1)?.split('.').pop()?.toLowerCase() ?? '';
      const allowedExtensions = expected.mimeType === 'image/jpeg'
        ? ['jpg', 'jpeg']
        : [expected.mimeType.split('/')[1]];

      if (
        uploadIndex < 2
        || resourceType !== expected.resourceType
        || !assetPath.startsWith(`${expected.folder}/`)
        || !allowedExtensions.includes(extension)
      ) {
        throw new AppError(
          400,
          'Uploaded file does not match the signed upload context',
          'UPLOAD_URL_INVALID'
        );
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'Uploaded file URL is invalid', 'UPLOAD_URL_INVALID');
  }
};

export const validateStoredUpload = (context: UploadContext, payload: UploadFileMetadata, role?: AppRole): UploadResourceType => {
  if (role) assertUploadContextAllowed(context, role);
  const resourceType = validateUploadFile(context, payload);
  const config = getUploadContextConfig(context);
  assertCloudinaryUrl(payload.file_url, {
    folder: config.folder,
    resourceType,
    mimeType: payload.mime_type.trim().toLowerCase()
  });
  return resourceType;
};

export const createCloudinaryUploadSignature = (
  context: UploadContext,
  payload: Pick<UploadFileMetadata, 'mime_type' | 'file_size' | 'resource_type'> & { folder?: string | null },
  role: AppRole
) => {
  assertUploadContextAllowed(context, role);

  if (!cloudinaryConfigured()) {
    throw new AppError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const config = getUploadContextConfig(context);
  const resourceType = validateUploadFile(context, { ...payload, folder: payload.folder ?? config.folder });
  const timestamp = Math.floor(Date.now() / 1000);
  const allowedFormats = config.allowedFormats.join(',');
  const signature = signParams({
    allowed_formats: allowedFormats,
    folder: config.folder,
    timestamp
  }, env.CLOUDINARY_API_SECRET!);

  return {
    cloud_name: env.CLOUDINARY_CLOUD_NAME!,
    api_key: env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    folder: config.folder,
    allowed_formats: allowedFormats,
    resource_type: resourceType,
    upload_url: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    allowed_mime_types: config.allowedMimeTypes,
    max_file_size: config.maxBytes
  };
};

export const resolveCloudinaryAsset = (metadata: CloudinaryAssetMetadata): { publicId: string; resourceType: UploadResourceType } => {
  assertCloudinaryUrl(metadata.file_url);
  try {
    const url = new URL(metadata.file_url);
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const uploadIndex = segments.indexOf('upload');
    const resourceType = segments[uploadIndex - 1] as UploadResourceType | undefined;
    const assetSegments = segments.slice(uploadIndex + 1).filter((segment, index) => !(index === 0 && /^v\d+$/.test(segment)));
    if (uploadIndex < 2 || !uploadResourceTypeValues.includes(resourceType as UploadResourceType) || assetSegments.length === 0) {
      throw new Error('Invalid Cloudinary asset URL');
    }

    const validatedResourceType = resourceType as UploadResourceType;
    let publicId = assetSegments.join('/');
    if (validatedResourceType === 'image') publicId = publicId.replace(/\.[^/.]+$/, '');
    return { publicId, resourceType: validatedResourceType };
  } catch {
    throw new AppError(409, 'Cloudinary asset metadata is missing', 'CLOUDINARY_ASSET_METADATA_MISSING');
  }
};

export const deleteCloudinaryUpload = async (metadata: CloudinaryAssetMetadata): Promise<void> => {
  if (!cloudinaryConfigured()) {
    throw new AppError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const { publicId, resourceType } = resolveCloudinaryAsset(metadata);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ invalidate: 'true', public_id: publicId, timestamp }, env.CLOUDINARY_API_SECRET!);
  const formData = new FormData();
  formData.append('api_key', env.CLOUDINARY_API_KEY!);
  formData.append('timestamp', String(timestamp));
  formData.append('public_id', publicId);
  formData.append('invalidate', 'true');
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`, {
    method: 'POST',
    body: formData
  });
  const payload = await response.json().catch(() => null) as { result?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload || !['ok', 'not found'].includes(payload.result ?? '')) {
    throw new AppError(502, payload?.error?.message ?? 'Unable to delete file from Cloudinary', 'CLOUDINARY_DELETE_FAILED');
  }
};
