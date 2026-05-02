import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../shared/middleware/auth';
import { AppError } from '../../shared/errors/app-error';
import { authenticateLogin, getCurrentUser, refreshAccessToken } from './auth.service';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid login payload');
  }

  const result = await authenticateLogin(parsed.data.identifier, parsed.data.password);
  res.json(result);
});

router.post('/refresh', async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid refresh payload');
  }

  const result = await refreshAccessToken(parsed.data.refreshToken);
  res.json(result);
});

router.post('/logout', (_req, res) => {
  // Stateless JWT logout. Frontend clears stored tokens.
  res.status(200).json({ success: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await getCurrentUser(req.auth!.userId);
  res.json(user);
});

export default router;
