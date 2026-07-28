import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody, parseQuery } from '../../shared/utils/validation';
import { uploadSignatureRateLimit } from '../../config/rate-limit';
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

router.get('/signature', uploadSignatureRateLimit, asyncHandler(async (req, res) => {
  const query = parseQuery(uploadSignatureSchema, req.query);
  res.json(createCloudinaryUploadSignature(query.context, query, req.auth!.role));
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
