import { z } from 'zod';
import type { Router } from 'express';

import { AppError } from '../errors/app-error';

type RequestPart = 'body' | 'query';

const parseRequestPart = <T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  part: RequestPart
): z.infer<T> => {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AppError(
      400,
      part === 'body' ? 'Invalid request payload' : 'Invalid request query',
      'VALIDATION_ERROR'
    );
  }

  return result.data;
};

export const parseBody = <T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): z.infer<T> => parseRequestPart(schema, body, 'body');

export const parseQuery = <T extends z.ZodTypeAny>(
  schema: T,
  query: unknown
): z.infer<T> => parseRequestPart(schema, query, 'query');

export const uuidSchema = z.string().trim().uuid().transform((value) => value.toLowerCase());

export const registerUuidParams = (
  router: Router,
  paramNames: readonly string[]
): void => {
  for (const paramName of paramNames) {
    router.param(paramName, (req, _res, next, rawValue) => {
      const parsed = uuidSchema.safeParse(rawValue);
      if (!parsed.success) {
        next(new AppError(
          400,
          `Invalid UUID path parameter: ${paramName}`,
          'VALIDATION_ERROR'
        ));
        return;
      }

      req.params[paramName] = parsed.data;
      next();
    });
  }
};
