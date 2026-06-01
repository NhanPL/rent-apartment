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

interface UploadContextConfig {
  folder: string;
  maxBytes: number;
  allowedMimeTypes: string[];
  allowedResourceTypes: UploadResourceType[];
  roles: AppRole[];
}

const rootFolder = env.CLOUDINARY_UPLOAD_ROOT_FOLDER.replace(/^\/+|\/+$/g, '') || 'rent-apartment';

const imageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
const imageAndPdfMimeTypes = [...imageMimeTypes, 'application/pdf'];

const contextConfig: Record<UploadContext, UploadContextConfig> = {
  TENANT_DOCUMENT: {
    folder: `${rootFolder}/tenant-documents`,
    maxBytes: 10 * 1024 * 1024,
    allowedMimeTypes: imageAndPdfMimeTypes,
    allowedResourceTypes: ['image', 'raw'],
    roles: ['TENANT']
  },
  UTILITY_EVIDENCE: {
    folder: `${rootFolder}/utility-evidence`,
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: imageMimeTypes,
    allowedResourceTypes: ['image'],
    roles: ['TENANT', 'MANAGER']
  },
  PAYMENT_PROOF: {
    folder: `${rootFolder}/payment-proofs`,
    maxBytes: 5 * 1024 * 1024,
    allowedMimeTypes: imageMimeTypes,
    allowedResourceTypes: ['image'],
    roles: ['TENANT']
  },
  CONTRACT_DOCUMENT: {
    folder: `${rootFolder}/contract-documents`,
    maxBytes: 15 * 1024 * 1024,
    allowedMimeTypes: imageAndPdfMimeTypes,
    allowedResourceTypes: ['image', 'raw'],
    roles: ['MANAGER']
  }
};

const cloudinaryConfigured = () => Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

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

  if (!Number.isInteger(payload.file_size) || payload.file_size <= 0 || payload.file_size > config.maxBytes) {
    throw new AppError(400, 'File size exceeds the upload limit for this context', 'UPLOAD_SIZE_INVALID');
  }

  return resourceType;
};

export const assertCloudinaryUrl = (fileUrl: string): void => {
  if (!env.CLOUDINARY_CLOUD_NAME) return;

  try {
    const url = new URL(fileUrl);
    const expectedPathPrefix = `/${env.CLOUDINARY_CLOUD_NAME}/`;
    if (url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith(expectedPathPrefix)) {
      throw new AppError(400, 'Uploaded file must be hosted on the configured Cloudinary cloud', 'UPLOAD_URL_INVALID');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'Uploaded file URL is invalid', 'UPLOAD_URL_INVALID');
  }
};

export const validateStoredUpload = (context: UploadContext, payload: UploadFileMetadata, role?: AppRole): UploadResourceType => {
  if (role) assertUploadContextAllowed(context, role);
  const resourceType = validateUploadFile(context, payload);
  assertCloudinaryUrl(payload.file_url);
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
  const signature = signParams({ folder: config.folder, timestamp }, env.CLOUDINARY_API_SECRET!);

  return {
    cloud_name: env.CLOUDINARY_CLOUD_NAME!,
    api_key: env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    folder: config.folder,
    resource_type: resourceType,
    upload_url: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    allowed_mime_types: config.allowedMimeTypes,
    max_file_size: config.maxBytes
  };
};
