import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { parseBody } from '../../shared/utils/validation';
import { getInvoiceBranding, updateInvoiceBranding } from './invoice-branding.service';

const router = Router();
router.use(requireRole('MANAGER'));

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const brandingSchema = z.object({
  display_name: z.string().trim().min(1).max(120),
  business_address: nullableText(500),
  tax_code: nullableText(50),
  logo_url: z.string().trim().url().refine((value) => value.startsWith('https://'), 'Logo URL must use HTTPS').nullable(),
  accent_color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
  invoice_title: z.string().trim().min(1).max(100),
  default_note: nullableText(1000)
});

router.get('/', asyncHandler(async (req, res) => {
  res.json(await getInvoiceBranding(req.auth!.userId));
}));

router.put('/', asyncHandler(async (req, res) => {
  res.json(await updateInvoiceBranding(req.auth!.userId, parseBody(brandingSchema, req.body)));
}));

export default router;
