import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';

const router = Router();

const uploadMetadataSchema = z.object({
  file_name: z.string().trim().nullable().optional(),
  file_url: z.string().trim().min(1),
  mime_type: z.string().trim().nullable().optional(),
  file_size: z.coerce.number().int().nonnegative().nullable().optional()
});

// Storage abstraction placeholder: client uploads file elsewhere and sends metadata/url.
router.post('/metadata', asyncHandler(async (req, res) => {
  const body = parseBody(uploadMetadataSchema, req.body);
  res.status(201).json({
    file_name: body.file_name ?? null,
    file_url: body.file_url,
    mime_type: body.mime_type ?? null,
    file_size: body.file_size ?? null,
    note: 'Metadata accepted; actual storage integration can be added later.'
  });
}));

export default router;
