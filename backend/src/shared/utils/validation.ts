import { z } from 'zod';

import { AppError } from '../errors/app-error';

export const parseBody = <T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> => {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new AppError(400, 'Invalid request payload', 'VALIDATION_ERROR');
  }

  return result.data;
};
