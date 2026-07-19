import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import { authenticateLogin, changePassword, getCurrentUser, refreshAccessToken } from './auth.service';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().optional().default('')
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
  confirmPassword: z.string().min(1).max(72)
}).superRefine((data, ctx) => {
  if (data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmPassword'],
      message: 'Password confirmation does not match'
    });
  }

  if (data.currentPassword === data.newPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['newPassword'],
      message: 'New password must be different from the current password'
    });
  }
});

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid login payload');
  }

  const result = await authenticateLogin(parsed.data.identifier, parsed.data.password);
  res.json(result);
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid refresh payload');
  }

  const result = await refreshAccessToken(parsed.data.refreshToken);
  res.json(result);
}));

router.post('/logout', (_req, res) => {
  // Stateless JWT logout. Frontend clears stored tokens.
  res.status(200).json({ success: true });
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.auth!.userId);
  res.json(user);
}));

router.put('/password', requireAuth, asyncHandler(async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid password change payload', 'VALIDATION_ERROR');
  }

  await changePassword(req.auth!.userId, parsed.data.currentPassword, parsed.data.newPassword);
  res.json({ success: true });
}));

export default router;
