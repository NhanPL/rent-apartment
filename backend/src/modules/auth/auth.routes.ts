import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { requireAuth } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import {
  authenticateLogin,
  changePassword,
  getCurrentUser,
  INVALID_CREDENTIALS_MESSAGE
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
import {
  revokeAllUserSessions,
  revokeSessionByRefreshToken,
  rotateRefreshToken
} from './session.service';
import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  setRefreshTokenCookie
} from './refresh-cookie';

const router = Router();
const trustedOrigins = new Set(
  env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
);

const assertTrustedOrigin = (req: Request): void => {
  const origin = req.header('origin');
  if (origin && !trustedOrigins.has(origin)) {
    throw new AppError(403, 'Request origin is not allowed', 'UNTRUSTED_ORIGIN');
  }
};

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1).max(72)
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
  assertTrustedOrigin(req);
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(401, INVALID_CREDENTIALS_MESSAGE, 'INVALID_CREDENTIALS');
  }

  const result = await authenticateLogin(
    parsed.data.identifier,
    parsed.data.password,
    {
      clientIp: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.header('user-agent') ?? null
    }
  );
  setRefreshTokenCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  res.json({ accessToken: result.accessToken, user: result.user });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshToken = getRefreshTokenCookie(req);
  if (!refreshToken) {
    clearRefreshTokenCookie(res);
    throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }
  try {
    const result = await rotateRefreshToken(refreshToken, {
      clientIp: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.header('user-agent') ?? null
    });
    setRefreshTokenCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    res.json({ accessToken: result.accessToken });
  } catch (error) {
    clearRefreshTokenCookie(res);
    throw error;
  }
}));

router.post('/logout', asyncHandler(async (req, res) => {
  assertTrustedOrigin(req);
  const refreshToken = getRefreshTokenCookie(req);
  if (refreshToken) await revokeSessionByRefreshToken(refreshToken);
  clearRefreshTokenCookie(res);
  res.status(200).json({ success: true });
}));

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
  clearRefreshTokenCookie(res);
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
  clearRefreshTokenCookie(res);
  res.json({ success: true });
}));

router.post('/sessions/revoke-all', requireAuth, asyncHandler(async (req, res) => {
  await revokeAllUserSessions(req.auth!.userId);
  clearRefreshTokenCookie(res);
  res.json({ success: true });
}));

export default router;
