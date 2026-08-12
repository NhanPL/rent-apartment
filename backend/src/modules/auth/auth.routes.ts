import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { AppError } from '../../shared/errors/app-error';
import {
  assertPasswordPolicy,
  PASSWORD_MAX_LENGTH
} from '../../shared/utils/password';
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
  listUserSessions,
  revokeAllUserSessions,
  revokeOwnSession,
  revokeSessionByRefreshToken,
  rotateRefreshToken
} from './session.service';
import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  setRefreshTokenCookie
} from './refresh-cookie';
import {
  loginRateLimit,
  passwordResetRateLimit,
  refreshRateLimit
} from '../../config/rate-limit';
import { parseBody, parseEmptyBody, parseParams, parseQuery, uuidSchema } from '../../shared/utils/validation';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1)
});

const activationTokenSchema = z.string().trim().min(32).max(256);
const activationQuerySchema = z.object({ token: activationTokenSchema });

const activateAccountSchema = z.object({
  token: activationTokenSchema,
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1)
});

const requestPasswordResetSchema = z.object({
  email: z.string().trim().email().max(320)
});

const confirmPasswordResetSchema = z.object({
  token: z.string().trim().min(1).max(256),
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1)
});
const sessionParamsSchema = z.object({ sessionId: uuidSchema });

const validateNewPassword = (
  newPassword: string,
  confirmPassword: string,
  currentPassword?: string
): void => {
  assertPasswordPolicy(newPassword);
  if (newPassword !== confirmPassword) {
    throw new AppError(
      400,
      'Password confirmation does not match',
      'PASSWORD_CONFIRMATION_MISMATCH'
    );
  }
  if (currentPassword !== undefined && currentPassword === newPassword) {
    throw new AppError(
      400,
      'New password must be different from the current password',
      'PASSWORD_REUSE_NOT_ALLOWED'
    );
  }
};

router.post('/login', loginRateLimit, asyncHandler(async (req, res) => {
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

router.post('/refresh', refreshRateLimit, asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
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
  parseEmptyBody(req.body);
  const refreshToken = getRefreshTokenCookie(req);
  if (refreshToken) await revokeSessionByRefreshToken(refreshToken);
  clearRefreshTokenCookie(res);
  res.status(200).json({ success: true });
}));

router.get('/activation', asyncHandler(async (req, res) => {
  const parsed = parseQuery(activationQuerySchema, req.query, {
    code: 'ACTIVATION_TOKEN_INVALID',
    message: 'This activation link is invalid, expired, or has already been used.'
  });
  res.json(await validateActivationToken(parsed.token));
}));

router.post('/activate', asyncHandler(async (req, res) => {
  const parsed = parseBody(activateAccountSchema, req.body, {
    message: 'Please enter and confirm a valid password.'
  });

  validateNewPassword(parsed.newPassword, parsed.confirmPassword);
  await activateTenantAccount(parsed.token, parsed.newPassword);
  res.json({ success: true });
}));

router.post('/password-reset/request', passwordResetRateLimit, asyncHandler(async (req, res) => {
  const parsed = parseBody(requestPasswordResetSchema, req.body, {
    message: 'Please enter a valid email address.'
  });

  await requestPasswordReset(parsed.email, req.ip || req.socket.remoteAddress || 'unknown');
  res.status(202).json({ message: PASSWORD_RESET_REQUEST_MESSAGE });
}));

router.post('/password-reset/confirm', passwordResetRateLimit, asyncHandler(async (req, res) => {
  const parsed = parseBody(confirmPasswordResetSchema, req.body, {
    message: 'Please enter and confirm a valid password.'
  });

  validateNewPassword(parsed.newPassword, parsed.confirmPassword);
  await confirmPasswordReset(parsed.token, parsed.newPassword);
  clearRefreshTokenCookie(res);
  res.json({ success: true });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.auth!.userId);
  res.json(user);
}));

router.put('/password', requireAuth, asyncHandler(async (req, res) => {
  const parsed = parseBody(changePasswordSchema, req.body, {
    message: 'Invalid password change payload'
  });

  validateNewPassword(
    parsed.newPassword,
    parsed.confirmPassword,
    parsed.currentPassword
  );
  await changePassword(req.auth!.userId, parsed.currentPassword, parsed.newPassword);
  clearRefreshTokenCookie(res);
  res.json({ success: true });
}));

router.post('/sessions/revoke-all', requireAuth, asyncHandler(async (req, res) => {
  parseEmptyBody(req.body);
  await revokeAllUserSessions(req.auth!.userId);
  clearRefreshTokenCookie(res);
  res.json({ success: true });
}));

router.get('/sessions', requireAuth, asyncHandler(async (req, res) => {
  res.json({
    items: await listUserSessions(req.auth!.userId, req.auth!.sessionId)
  });
}));

router.delete('/sessions/:sessionId', requireAuth, asyncHandler(async (req, res) => {
  const { sessionId } = parseParams(sessionParamsSchema, req.params);
  const result = await revokeOwnSession(req.auth!.userId, sessionId, req.auth!.sessionId);
  if (result.revokedCurrent) clearRefreshTokenCookie(res);
  res.json(result);
}));

export default router;
