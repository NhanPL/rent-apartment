import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

export const errorHandler = (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const includeStack = process.env.NODE_ENV !== 'production';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      message: err.message,
      code: err.code,
      ...(includeStack ? { stack: err.stack } : {})
    });
    return;
  }

  if (err instanceof Error) {
    res.status(500).json({
      message: includeStack ? err.message : 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(includeStack ? { stack: err.stack } : {})
    });
    return;
  }

  res.status(500).json({
    message: 'Unknown error',
    code: 'UNKNOWN_ERROR',
    ...(includeStack ? { stack: String(err) } : {})
  });
};
