import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message, code: err.code });
    return;
  }

  if (err instanceof Error) {
    res.status(500).json({ message: err.message, code: 'INTERNAL_ERROR' });
    return;
  }

  res.status(500).json({ message: 'Unknown error', code: 'UNKNOWN_ERROR' });
};
