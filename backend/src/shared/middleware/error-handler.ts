import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { env, type AppEnvironment } from '../../config/env';

interface DatabaseError {
  code?: string;
  constraint?: string;
}

interface RequestParserError extends Error {
  status?: number;
  type?: string;
}

const isDatabaseError = (error: unknown): error is DatabaseError => (
  Boolean(error && typeof error === 'object' && 'code' in error)
);

const isRequestParserError = (error: unknown): error is RequestParserError => (
  error instanceof Error && 'type' in error
);

const uniqueConstraintErrors: Record<string, { message: string; code: string }> = {
  uq_tenant_identity: {
    message: 'This citizen ID number is already used by another tenant.',
    code: 'TENANT_IDENTITY_EXISTS'
  },
  app_user_email_key: {
    message: 'This email address is already used by another account.',
    code: 'TENANT_EMAIL_EXISTS'
  },
  app_user_username_key: {
    message: 'This email address is already used by another account.',
    code: 'TENANT_EMAIL_EXISTS'
  },
  app_user_phone_key: {
    message: 'This phone number is already used by another account.',
    code: 'TENANT_PHONE_EXISTS'
  }
};

export const createErrorHandler = (appEnvironment: AppEnvironment) => (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const includeStack = appEnvironment === 'development' || appEnvironment === 'test';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      message: err.message,
      code: err.code,
      ...(includeStack ? { stack: err.stack } : {})
    });
    return;
  }

  if (isRequestParserError(err) && err.type === 'entity.too.large') {
    res.status(413).json({
      message: 'Request body is too large.',
      code: 'PAYLOAD_TOO_LARGE'
    });
    return;
  }

  if (isRequestParserError(err) && err.type === 'entity.parse.failed') {
    res.status(400).json({
      message: 'Request body contains invalid JSON.',
      code: 'INVALID_JSON'
    });
    return;
  }

  if (isDatabaseError(err) && err.code === '23505') {
    const mapped = uniqueConstraintErrors[err.constraint ?? ''] ?? {
      message: 'The submitted information is already used by another record.',
      code: 'DUPLICATE_RECORD'
    };
    res.status(409).json(mapped);
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

export const errorHandler = createErrorHandler(env.APP_ENV);
