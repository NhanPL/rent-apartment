import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
import { updatePreferredLanguage } from './preferences.service';

const router = Router();
const languageSchema = z.object({ language: z.enum(['en', 'vi']) });

router.put('/language', asyncHandler(async (req, res) => {
  const { language } = parseBody(languageSchema, req.body);
  res.json(await updatePreferredLanguage(req.auth!.userId, language));
}));

export default router;
