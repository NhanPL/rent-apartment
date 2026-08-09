import { z } from 'zod';
import type { ParamsDictionary, Router } from 'express-serve-static-core';

import { AppError, type FieldErrors } from '../errors/app-error';

type RequestPart = 'body' | 'query' | 'params';

export interface ValidationErrorOptions {
  statusCode?: number;
  code?: string;
  message?: string;
  includeFieldErrors?: boolean;
}

const validationMessage = (part: RequestPart): string => {
  switch (part) {
    case 'body': return 'Invalid request payload';
    case 'query': return 'Invalid request query';
    case 'params': return 'Invalid route parameters';
  }
};

const zodFieldErrors = (error: z.ZodError, part: RequestPart): FieldErrors => {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join('.') : part;
    (errors[field] ??= []).push(issue.message);
  }
  return errors;
};

const parseRequestPart = <T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  part: RequestPart,
  options: ValidationErrorOptions = {}
): z.infer<T> => {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AppError(
      options.statusCode ?? 400,
      options.message ?? validationMessage(part),
      options.code ?? 'VALIDATION_ERROR',
      options.includeFieldErrors === false ? null : zodFieldErrors(result.error, part)
    );
  }

  return result.data;
};

export const parseBody = <T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  options?: ValidationErrorOptions
): z.infer<T> => parseRequestPart(schema, body, 'body', options);

export const parseQuery = <T extends z.ZodTypeAny>(
  schema: T,
  query: unknown,
  options?: ValidationErrorOptions
): z.infer<T> => parseRequestPart(schema, query, 'query', options);

export const parseParams = <T extends z.ZodTypeAny>(
  schema: T,
  params: ParamsDictionary,
  options?: ValidationErrorOptions
): z.infer<T> => parseRequestPart(schema, params, 'params', options);

export const emptyBodySchema = z.object({}).strict();

export const parseEmptyBody = (body: unknown): Record<string, never> => (
  parseBody(emptyBodySchema, body === undefined ? {} : body)
);

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
          'Invalid route parameters',
          'VALIDATION_ERROR',
          { [paramName]: ['Must be a valid UUID'] }
        ));
        return;
      }

      req.params[paramName] = parsed.data;
      next();
    });
  }
};
