import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody, parseParams, uuidSchema } from '../../shared/utils/validation';
import {
  createAuthorizedDocumentAccessUrl,
  documentKindValues,
  fetchAuthorizedDocument
} from './document-assets.service';

export const documentDeliveryRoutes = Router();

const documentDeliveryParamsSchema = z.object({
  token: z.string().trim().min(32).max(2048)
});

documentDeliveryRoutes.get('/delivery/:token', asyncHandler(async (req, res) => {
  const params = parseParams(documentDeliveryParamsSchema, req.params, {
    code: 'DOCUMENT_ACCESS_INVALID',
    message: 'Document access link is invalid'
  });
  const document = await fetchAuthorizedDocument(params.token);
  res.setHeader('Content-Type', document.contentType);
  res.setHeader('Content-Disposition', document.contentDisposition);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(document.body);
}));

const router = Router();

const accessSchema = z.object({
  action: z.enum(['VIEW', 'DOWNLOAD']).default('VIEW')
});

const documentAccessParamsSchema = z.object({
  kind: z.enum(documentKindValues),
  id: uuidSchema
});

router.post('/:kind/:id/access', asyncHandler(async (req, res) => {
  const params = parseParams(documentAccessParamsSchema, req.params);
  const body = parseBody(accessSchema, req.body);
  const access = await createAuthorizedDocumentAccessUrl(req, params.kind, params.id, req.auth!, body.action);
  res.json({
    url: access.url,
    expires_at: access.expiresAt
  });
}));

export default router;
