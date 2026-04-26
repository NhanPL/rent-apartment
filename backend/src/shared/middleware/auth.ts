import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

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
  const userId = req.header('x-user-id');
  const role = req.header('x-user-role') as AppRole | undefined;

  if (!userId || !role) {
    throw new AppError(401, 'Missing auth headers x-user-id and x-user-role');
  }
  if (role !== 'MANAGER' && role !== 'TENANT') {
    throw new AppError(403, 'Invalid role');
  }

  req.auth = { userId, role };
  next();
};

export const requireRole = (...roles: AppRole[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.auth) throw new AppError(401, 'Unauthorized');
  if (!roles.includes(req.auth.role)) throw new AppError(403, 'Forbidden');
  next();
};
