import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { parseBody } from '../../shared/utils/validation';
import {
  createCloudinaryUploadSignature,
  uploadContextValues,
  uploadResourceTypeValues,
  validateStoredUpload
} from './uploads.service';

const router = Router();

const uploadSignatureSchema = z.object({
  context: z.enum(uploadContextValues),
  mime_type: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive(),
  resource_type: z.enum(uploadResourceTypeValues).optional(),
  folder: z.string().trim().nullable().optional()
});

const uploadMetadataSchema = z.object({
  context: z.enum(uploadContextValues),
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().url(),
  mime_type: z.string().trim().min(1),
  file_size: z.coerce.number().int().positive(),
  resource_type: z.enum(uploadResourceTypeValues).optional()
});

router.get('/signature', asyncHandler(async (req, res) => {
  const result = uploadSignatureSchema.safeParse(req.query);
  if (!result.success) {
    throw new AppError(400, 'Invalid upload signature query', 'VALIDATION_ERROR');
  }

  res.json(createCloudinaryUploadSignature(result.data.context, result.data, req.auth!.role));
}));

router.post('/metadata', asyncHandler(async (req, res) => {
  const body = parseBody(uploadMetadataSchema, req.body);
  validateStoredUpload(body.context, body, req.auth!.role);

  res.status(201).json({
    context: body.context,
    file_name: body.file_name ?? null,
    file_url: body.file_url,
    mime_type: body.mime_type,
    file_size: body.file_size,
    note: 'Metadata validated. Use the context-specific endpoint to persist the uploaded file.'
  });
}));

export default router;
