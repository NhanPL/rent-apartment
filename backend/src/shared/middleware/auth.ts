import { NextFunction, Request, Response } from 'express';
import { query } from '../../db';
import { AppError } from '../errors/app-error';
import { verifyAccessToken } from '../utils/jwt';

export type AppRole = 'MANAGER' | 'TENANT';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: AppRole;
      };
    }
  }
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    next(new AppError(401, 'Unauthorized'));
    return;
  }

  const authenticateRequest = async (): Promise<void> => {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'MANAGER' && payload.role !== 'TENANT') throw new AppError(403, 'Forbidden');

    const result = await query<{
      role: AppRole;
      is_active: boolean;
      account_status: string;
      session_version: number;
    }>(
      `SELECT role, is_active, account_status, session_version
       FROM app_user
       WHERE id=$1
       LIMIT 1`,
      [payload.userId]
    );
    const user = result.rows[0];
    if (
      !user
      || !user.is_active
      || user.account_status !== 'ACTIVE'
      || user.role !== payload.role
      || user.session_version !== (payload.sessionVersion ?? 0)
    ) {
      throw new AppError(401, 'Invalid or expired token');
    }

    req.auth = { userId: payload.userId, role: payload.role };
    next();
  };

  void authenticateRequest().catch(() => next(new AppError(401, 'Invalid or expired token')));
};

export const requireRole = (...roles: AppRole[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.auth) throw new AppError(401, 'Unauthorized');
  if (!roles.includes(req.auth.role)) throw new AppError(403, 'Forbidden');
  next();
};
