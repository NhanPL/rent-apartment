import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import {
  authenticateLogin,
  changePassword,
  getCurrentUser,
  INVALID_CREDENTIALS_MESSAGE,
  refreshAccessToken
} from './auth.service';
import {
  activateTenantAccount,
  validateActivationToken
} from './account-activation.service';
import {
  confirmPasswordReset,
  PASSWORD_RESET_REQUEST_MESSAGE,
  requestPasswordReset
} from './password-reset.service';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1).max(72)
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

const activationTokenSchema = z.string().trim().min(32).max(256);

const activateAccountSchema = z.object({
  token: activationTokenSchema,
  newPassword: z.string().min(8).max(72),
  confirmPassword: z.string().min(8).max(72)
}).superRefine((data, ctx) => {
  if (data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmPassword'],
      message: 'Password confirmation does not match'
    });
  }
});

const requestPasswordResetSchema = z.object({
  email: z.string().trim().email().max(320)
});

const confirmPasswordResetSchema = z.object({
  token: z.string().trim().min(1).max(256),
  newPassword: z.string().min(8).max(72),
  confirmPassword: z.string().min(8).max(72)
}).superRefine((data, ctx) => {
  if (data.newPassword !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['confirmPassword'],
      message: 'Password confirmation does not match'
    });
  }
});

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(401, INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS');
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

router.get('/activation', asyncHandler(async (req, res) => {
  const parsed = activationTokenSchema.safeParse(req.query.token);
  if (!parsed.success) {
    throw new AppError(
      400,
      'This activation link is invalid, expired, or has already been used.',
      'ACTIVATION_TOKEN_INVALID'
    );
  }

  res.json(await validateActivationToken(parsed.data));
}));

router.post('/activate', asyncHandler(async (req, res) => {
  const parsed = activateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Please enter and confirm a valid password.', 'VALIDATION_ERROR');
  }

  await activateTenantAccount(parsed.data.token, parsed.data.newPassword);
  res.json({ success: true });
}));

router.post('/password-reset/request', asyncHandler(async (req, res) => {
  const parsed = requestPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Please enter a valid email address.', 'VALIDATION_ERROR');
  }

  await requestPasswordReset(parsed.data.email, req.ip || req.socket.remoteAddress || 'unknown');
  res.status(202).json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
}));

router.post('/password-reset/confirm', asyncHandler(async (req, res) => {
  const parsed = confirmPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Please enter and confirm a valid password.', 'VALIDATION_ERROR');
  }

  await confirmPasswordReset(parsed.data.token, parsed.data.newPassword);
  res.json({ success: true });
}));

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
