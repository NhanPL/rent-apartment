import type { NextFunction, Request, Response } from 'express';
import { logger } from '../services/logger.service';
import {
  classifyOperationalFeature,
  observeHttpRequest
} from '../services/metrics.service';

export interface RequestLogEntry {
  [key: string]: unknown;
  requestId: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  userId?: string;
  role?: string;
}

const routePattern = (req: Request): string => {
  const path = typeof req.route?.path === 'string' ? req.route.path : null;
  return path ? `${req.baseUrl || ''}${path}` : 'UNMATCHED';
};

export const buildRequestLogEntry = (
  req: Request,
  res: Response,
  startedAt: bigint
): RequestLogEntry => ({
  requestId: String(res.getHeader('X-Request-ID') || 'unknown'),
  method: req.method,
  route: routePattern(req),
  statusCode: res.statusCode,
  durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
  ...(req.auth ? { userId: req.auth.userId, role: req.auth.role } : {})
});

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const entry = buildRequestLogEntry(req, res, startedAt);
    observeHttpRequest({
      durationMs: entry.durationMs,
      statusCode: entry.statusCode,
      feature: classifyOperationalFeature(req.originalUrl)
    });
    if (entry.statusCode >= 500) logger.error(entry, 'HTTP request completed');
    else if (entry.statusCode >= 400) logger.warn(entry, 'HTTP request completed');
    else logger.info(entry, 'HTTP request completed');
  });
  next();
};
