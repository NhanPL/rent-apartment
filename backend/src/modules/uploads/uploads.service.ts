import crypto from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/app-error';
import type { AppRole } from '../../shared/middleware/auth';

export const uploadContextValues = ['TENANT_DOCUMENT', 'UTILITY_EVIDENCE', 'PAYMENT_PROOF', 'CONTRACT_DOCUMENT'] as const;
export type UploadContext = typeof uploadContextValues[number];

export const uploadResourceTypeValues = ['image', 'raw'] as const;
export type UploadResourceType = typeof uploadResourceTypeValues[number];
export const cloudinaryDeliveryTypeValues = ['upload', 'private', 'authenticated'] as const;
export type CloudinaryDeliveryType = typeof cloudinaryDeliveryTypeValues[number];

export interface UploadFileMetadata {
  file_name?: string | null;
  file_url: string;
  mime_type: string;
  file_size: number;
  resource_type?: UploadResourceType;
  public_id?: string;
  asset_id?: string;
  version?: number;
  format?: string;
  delivery_type?: CloudinaryDeliveryType;
}

export interface CloudinaryAssetMetadata {
  file_url?: string | null;
  public_id?: string | null;
  asset_id?: string | null;
  resource_type?: UploadResourceType | null;
  version?: number | string | null;
  format?: string | null;
  delivery_type?: CloudinaryDeliveryType | null;
}

export interface ResolvedCloudinaryAsset {
  publicId: string;
  assetId: string | null;
  resourceType: UploadResourceType;
  version: number | null;
  format: string | null;
  deliveryType: CloudinaryDeliveryType;
}

interface UploadContextConfig {
  folder: string;
  maxBytes: number;
  retentionDays: number;
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
    retentionDays: env.TENANT_DOCUMENT_RETENTION_DAYS,
    allowedMimeTypes: imageAndPdfMimeTypes,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    allowedResourceTypes: ['image', 'raw'],
    roles: ['TENANT', 'MANAGER']
  },
  UTILITY_EVIDENCE: {
    folder: `${rootFolder}/utility-evidence`,
    maxBytes: megabytes(env.UPLOAD_MAX_UTILITY_EVIDENCE_MB),
    retentionDays: env.UTILITY_EVIDENCE_RETENTION_DAYS,
    allowedMimeTypes: imageMimeTypes,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    allowedResourceTypes: ['image'],
    roles: ['TENANT', 'MANAGER']
  },
  PAYMENT_PROOF: {
    folder: `${rootFolder}/payment-proofs`,
    maxBytes: megabytes(env.UPLOAD_MAX_PAYMENT_PROOF_MB),
    retentionDays: env.PAYMENT_PROOF_RETENTION_DAYS,
    allowedMimeTypes: imageMimeTypes,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    allowedResourceTypes: ['image'],
    roles: ['TENANT']
  },
  CONTRACT_DOCUMENT: {
    folder: `${rootFolder}/contract-documents`,
    maxBytes: megabytes(env.UPLOAD_MAX_CONTRACT_DOCUMENT_MB),
    retentionDays: env.CONTRACT_DOCUMENT_RETENTION_DAYS,
    allowedMimeTypes: imageAndPdfMimeTypes,
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    allowedResourceTypes: ['image', 'raw'],
    roles: ['MANAGER']
  }
};

const hasUsableCredential = (value: string | undefined, minimumLength: number): boolean => (
  Boolean(value && value.trim().length >= minimumLength)
);

export const isCloudinaryConfigured = () => (
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
    deliveryType?: CloudinaryDeliveryType;
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
      const deliveryIndex = segments.findIndex((segment) => cloudinaryDeliveryTypeValues.includes(segment as CloudinaryDeliveryType));
      const resourceType = segments[deliveryIndex - 1];
      const deliveryType = segments[deliveryIndex] as CloudinaryDeliveryType | undefined;
      const assetSegments = segments
        .slice(deliveryIndex + 1)
        .filter((segment, index) => !(index === 0 && /^v\d+$/.test(segment)));
      const assetPath = assetSegments.join('/');
      const extension = assetSegments.at(-1)?.split('.').pop()?.toLowerCase() ?? '';
      const allowedExtensions = expected.mimeType === 'image/jpeg'
        ? ['jpg', 'jpeg']
        : [expected.mimeType.split('/')[1]];

      if (
        deliveryIndex < 2
        || resourceType !== expected.resourceType
        || (expected.deliveryType && deliveryType !== expected.deliveryType)
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

export const validateStoredUpload = (
  context: UploadContext,
  payload: UploadFileMetadata,
  role?: AppRole,
  actorUserId?: string
): UploadResourceType => {
  if (role) assertUploadContextAllowed(context, role);
  const resourceType = validateUploadFile(context, payload);
  const config = getUploadContextConfig(context);
  const expectedFolder = actorUserId ? `${config.folder}/${actorUserId}` : config.folder;
  if (payload.delivery_type && payload.delivery_type !== 'authenticated') {
    throw new AppError(400, 'Sensitive documents must use authenticated Cloudinary delivery', 'UPLOAD_DELIVERY_TYPE_INVALID');
  }
  assertCloudinaryUrl(payload.file_url, {
    folder: expectedFolder,
    resourceType,
    mimeType: payload.mime_type.trim().toLowerCase(),
    deliveryType: payload.delivery_type ? 'authenticated' : undefined
  });

  if (payload.public_id && !payload.public_id.startsWith(`${expectedFolder}/`)) {
    throw new AppError(400, 'Uploaded asset does not match the signed upload context', 'UPLOAD_PUBLIC_ID_INVALID');
  }
  if (payload.version !== undefined && (!Number.isInteger(payload.version) || payload.version <= 0)) {
    throw new AppError(400, 'Uploaded asset version is invalid', 'UPLOAD_VERSION_INVALID');
  }

  return resourceType;
};

export const createCloudinaryUploadSignature = (
  context: UploadContext,
  payload: Pick<UploadFileMetadata, 'mime_type' | 'file_size' | 'resource_type'> & { folder?: string | null },
  role: AppRole,
  actorUserId: string
) => {
  assertUploadContextAllowed(context, role);

  if (!isCloudinaryConfigured()) {
    throw new AppError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }

  const config = getUploadContextConfig(context);
  const resourceType = validateUploadFile(context, { ...payload, folder: config.folder });
  const actorFolder = `${config.folder}/${actorUserId}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const allowedFormats = config.allowedFormats.join(',');
  const signature = signParams({
    allowed_formats: allowedFormats,
    folder: actorFolder,
    timestamp,
    type: 'authenticated'
  }, env.CLOUDINARY_API_SECRET!);

  return {
    cloud_name: env.CLOUDINARY_CLOUD_NAME!,
    api_key: env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    folder: actorFolder,
    allowed_formats: allowedFormats,
    resource_type: resourceType,
    delivery_type: 'authenticated' as const,
    upload_url: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    allowed_mime_types: config.allowedMimeTypes,
    max_file_size: config.maxBytes
  };
};

export const resolveCloudinaryAsset = (metadata: CloudinaryAssetMetadata): ResolvedCloudinaryAsset => {
  if (
    metadata.public_id
    && metadata.resource_type
    && uploadResourceTypeValues.includes(metadata.resource_type)
  ) {
    const version = metadata.version === null || metadata.version === undefined
      ? null
      : Number(metadata.version);
    return {
      publicId: metadata.public_id,
      assetId: metadata.asset_id ?? null,
      resourceType: metadata.resource_type,
      version: Number.isInteger(version) && Number(version) > 0 ? version : null,
      format: metadata.format ?? null,
      deliveryType: metadata.delivery_type ?? 'authenticated'
    };
  }

  if (!metadata.file_url) {
    throw new AppError(409, 'Cloudinary asset metadata is missing', 'CLOUDINARY_ASSET_METADATA_MISSING');
  }

  assertCloudinaryUrl(metadata.file_url);
  try {
    const url = new URL(metadata.file_url);
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const deliveryIndex = segments.findIndex((segment) => cloudinaryDeliveryTypeValues.includes(segment as CloudinaryDeliveryType));
    const resourceType = segments[deliveryIndex - 1] as UploadResourceType | undefined;
    const deliveryType = segments[deliveryIndex] as CloudinaryDeliveryType | undefined;
    const versionSegment = segments[deliveryIndex + 1];
    const version = /^v\d+$/.test(versionSegment ?? '') ? Number(versionSegment.slice(1)) : null;
    const assetSegments = segments.slice(deliveryIndex + 1).filter((segment, index) => !(index === 0 && /^v\d+$/.test(segment)));
    if (
      deliveryIndex < 2
      || !uploadResourceTypeValues.includes(resourceType as UploadResourceType)
      || !cloudinaryDeliveryTypeValues.includes(deliveryType as CloudinaryDeliveryType)
      || assetSegments.length === 0
    ) {
      throw new Error('Invalid Cloudinary asset URL');
    }

    const validatedResourceType = resourceType as UploadResourceType;
    const fileName = assetSegments.at(-1) ?? '';
    const extension = fileName.includes('.') ? fileName.split('.').pop() ?? null : null;
    let publicId = assetSegments.join('/');
    if (validatedResourceType === 'image') publicId = publicId.replace(/\.[^/.]+$/, '');
    return {
      publicId,
      assetId: metadata.asset_id ?? null,
      resourceType: validatedResourceType,
      version,
      format: metadata.format ?? extension,
      deliveryType: deliveryType as CloudinaryDeliveryType
    };
  } catch {
    throw new AppError(409, 'Cloudinary asset metadata is missing', 'CLOUDINARY_ASSET_METADATA_MISSING');
  }
};

export const normalizeStoredUpload = (
  context: UploadContext,
  payload: UploadFileMetadata,
  role?: AppRole,
  actorUserId?: string
): ResolvedCloudinaryAsset => {
  const resourceType = validateStoredUpload(context, payload, role, actorUserId);
  const resolved = resolveCloudinaryAsset({
    file_url: payload.file_url,
    public_id: payload.public_id,
    asset_id: payload.asset_id,
    resource_type: payload.resource_type ?? resourceType,
    version: payload.version,
    format: payload.format,
    delivery_type: payload.delivery_type
  });

  const contextFolder = getUploadContextConfig(context).folder;
  const expectedFolder = actorUserId ? `${contextFolder}/${actorUserId}` : contextFolder;
  if (!resolved.publicId.startsWith(`${expectedFolder}/`)) {
    throw new AppError(400, 'Uploaded asset does not match the signed upload context', 'UPLOAD_PUBLIC_ID_INVALID');
  }
  return resolved;
};

export const getDocumentRetentionUntil = (context: UploadContext, from = new Date()): Date => {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + getUploadContextConfig(context).retentionDays);
  return result;
};

const assertCloudinaryConfigured = (): void => {
  if (!isCloudinaryConfigured()) {
    throw new AppError(500, 'Cloudinary is not configured', 'CLOUDINARY_NOT_CONFIGURED');
  }
};

const cloudinaryAdminAuthHeader = (): string => (
  `Basic ${Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64')}`
);

export const createCloudinaryPrivateDownloadUrl = (
  metadata: CloudinaryAssetMetadata,
  expiresAt: number
): string => {
  assertCloudinaryConfigured();
  const asset = resolveCloudinaryAsset(metadata);
  const params: Record<string, string | number> = {
    expires_at: expiresAt,
    public_id: asset.publicId,
    type: asset.deliveryType
  };
  if (asset.format) params.format = asset.format;
  const signature = signParams(params, env.CLOUDINARY_API_SECRET!);
  const search = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    api_key: env.CLOUDINARY_API_KEY!,
    signature
  });
  return `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${asset.resourceType}/download?${search.toString()}`;
};

export interface CloudinaryResource {
  asset_id?: string;
  public_id: string;
  resource_type: UploadResourceType;
  type: CloudinaryDeliveryType;
  version?: number;
  format?: string;
}

export const listCloudinaryResources = async (
  resourceType: UploadResourceType,
  deliveryType: CloudinaryDeliveryType,
  prefix: string
): Promise<CloudinaryResource[]> => {
  assertCloudinaryConfigured();
  const resources: CloudinaryResource[] = [];
  let cursor: string | undefined;

  do {
    const search = new URLSearchParams({ prefix, max_results: '500' });
    if (cursor) search.set('next_cursor', cursor);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/${resourceType}/${deliveryType}?${search.toString()}`,
      { headers: { authorization: cloudinaryAdminAuthHeader() } }
    );
    const payload = await response.json().catch(() => null) as {
      resources?: CloudinaryResource[];
      next_cursor?: string;
    } | null;
    if (!response.ok || !payload?.resources) {
      throw new AppError(502, 'Unable to reconcile Cloudinary assets', 'CLOUDINARY_LIST_FAILED');
    }
    resources.push(...payload.resources);
    cursor = payload.next_cursor;
  } while (cursor);

  return resources;
};

export const getCloudinaryResource = async (
  publicId: string,
  resourceType: UploadResourceType,
  deliveryType: CloudinaryDeliveryType
): Promise<CloudinaryResource | null> => {
  assertCloudinaryConfigured();
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/${resourceType}/${deliveryType}/${encodeURIComponent(publicId)}`,
    { headers: { authorization: cloudinaryAdminAuthHeader() } }
  );
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => null) as CloudinaryResource | null;
  if (!response.ok || !payload?.public_id) {
    throw new AppError(502, 'Unable to inspect Cloudinary asset', 'CLOUDINARY_RESOURCE_LOOKUP_FAILED');
  }
  return payload;
};

export const migrateCloudinaryUploadToAuthenticated = async (
  metadata: CloudinaryAssetMetadata
): Promise<CloudinaryResource> => {
  assertCloudinaryConfigured();
  const asset = resolveCloudinaryAsset(metadata);
  if (asset.deliveryType === 'authenticated') {
    return {
      asset_id: asset.assetId ?? undefined,
      public_id: asset.publicId,
      resource_type: asset.resourceType,
      type: 'authenticated',
      version: asset.version ?? undefined,
      format: asset.format ?? undefined
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    from_public_id: asset.publicId,
    invalidate: 'true',
    timestamp,
    to_public_id: asset.publicId,
    to_type: 'authenticated',
    type: asset.deliveryType
  };
  const signature = signParams(params, env.CLOUDINARY_API_SECRET!);
  const formData = new FormData();
  Object.entries(params).forEach(([key, value]) => formData.append(key, String(value)));
  formData.append('api_key', env.CLOUDINARY_API_KEY!);
  formData.append('signature', signature);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${asset.resourceType}/rename`,
    { method: 'POST', body: formData }
  );
  const payload = await response.json().catch(() => null) as (CloudinaryResource & { error?: { message?: string } }) | null;
  if (!response.ok || !payload?.public_id) {
    throw new AppError(502, 'Unable to protect legacy Cloudinary asset', 'CLOUDINARY_MIGRATION_FAILED');
  }
  return { ...payload, resource_type: asset.resourceType, type: 'authenticated' };
};

export const deleteCloudinaryUpload = async (metadata: CloudinaryAssetMetadata): Promise<void> => {
  assertCloudinaryConfigured();

  const { publicId, resourceType, deliveryType } = resolveCloudinaryAsset(metadata);
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureParams = {
    invalidate: 'true',
    public_id: publicId,
    timestamp,
    type: deliveryType
  };
  const signature = signParams(signatureParams, env.CLOUDINARY_API_SECRET!);
  const formData = new FormData();
  formData.append('api_key', env.CLOUDINARY_API_KEY!);
  formData.append('timestamp', String(timestamp));
  formData.append('public_id', publicId);
  formData.append('invalidate', 'true');
  formData.append('type', deliveryType);
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`, {
    method: 'POST',
    body: formData
  });
  const payload = await response.json().catch(() => null) as { result?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload || !['ok', 'not found'].includes(payload.result ?? '')) {
    throw new AppError(502, 'Unable to delete file from Cloudinary', 'CLOUDINARY_DELETE_FAILED');
  }
};
