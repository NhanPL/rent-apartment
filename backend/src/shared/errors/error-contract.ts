import type { Response } from 'express';
import { getAuditRequestContext } from '../middleware/audit-context';
import type { FieldErrors } from './app-error';

export interface ErrorResponseBody {
  code: string;
  message: string;
  fieldErrors: FieldErrors | null;
  requestId: string;
}

export const getResponseRequestId = (response: Response): string => {
  const contextRequestId = getAuditRequestContext()?.requestId;
  if (contextRequestId) return contextRequestId;
  const headerRequestId = response.getHeader('X-Request-ID');
  return typeof headerRequestId === 'string' && headerRequestId ? headerRequestId : 'unknown';
};

export const buildErrorResponse = (
  response: Response,
  code: string,
  message: string,
  fieldErrors: FieldErrors | null = null
): ErrorResponseBody => ({
  code,
  message,
  fieldErrors,
  requestId: getResponseRequestId(response)
});
