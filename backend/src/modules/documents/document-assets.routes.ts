import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { parseBody, registerUuidParams } from '../../shared/utils/validation';
import {
  createAuthorizedDocumentAccessUrl,
  documentKindValues,
  fetchAuthorizedDocument
} from './document-assets.service';

export const documentDeliveryRoutes = Router();

documentDeliveryRoutes.get('/delivery/:token', asyncHandler(async (req, res) => {
  const document = await fetchAuthorizedDocument(req.params.token);
  res.setHeader('Content-Type', document.contentType);
  res.setHeader('Content-Disposition', document.contentDisposition);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(document.body);
}));

const router = Router();
registerUuidParams(router, ['id']);

const accessSchema = z.object({
  action: z.enum(['VIEW', 'DOWNLOAD']).default('VIEW')
});

router.post('/:kind/:id/access', asyncHandler(async (req, res) => {
  const parsedKind = z.enum(documentKindValues).safeParse(req.params.kind);
  if (!parsedKind.success) {
    throw new AppError(400, 'Invalid document kind', 'VALIDATION_ERROR');
  }
  const body = parseBody(accessSchema, req.body);
  const access = await createAuthorizedDocumentAccessUrl(req, parsedKind.data, req.params.id, req.auth!, body.action);
  res.json({
    url: access.url,
    expires_at: access.expiresAt
  });
}));

export default router;
