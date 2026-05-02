import { NextFunction, Request, Response } from 'express';
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
    throw new AppError(401, 'Unauthorized');
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'MANAGER' && payload.role !== 'TENANT') {
      throw new AppError(403, 'Forbidden');
    }

    req.auth = { userId: payload.userId, role: payload.role };
    next();
  } catch (_error) {
    throw new AppError(401, 'Invalid or expired token');
  }
};

export const requireRole = (...roles: AppRole[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.auth) throw new AppError(401, 'Unauthorized');
  if (!roles.includes(req.auth.role)) throw new AppError(403, 'Forbidden');
  next();
};
