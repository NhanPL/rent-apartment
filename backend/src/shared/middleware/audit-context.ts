import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import type { AppRole } from './auth';

export type AuditActorRole = AppRole | 'SYSTEM' | 'ANONYMOUS';

export interface AuditRequestContext {
  requestId: string;
  clientIpHash: string;
  userAgent: string | null;
  actorRole: AuditActorRole;
}

const auditContextStorage = new AsyncLocalStorage<AuditRequestContext>();
const requestIdPattern = /^[A-Za-z0-9._:-]{8,100}$/;

const hashClientIp = (clientIp: string): string => (
  crypto.createHmac('sha256', env.AUDIT_IP_HASH_SECRET)
    .update(clientIp.trim() || 'unknown', 'utf8')
    .digest('hex')
);

const normalizeUserAgent = (value: string | undefined): string | null => {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return normalized ? normalized.slice(0, 300) : null;
};

export const auditRequestContext = (req: Request, res: Response, next: NextFunction): void => {
  const suppliedRequestId = req.header('x-request-id')?.trim();
  const requestId = suppliedRequestId && requestIdPattern.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  res.setHeader('X-Request-ID', requestId);
  auditContextStorage.run({
    requestId,
    clientIpHash: hashClientIp(clientIp),
    userAgent: normalizeUserAgent(req.header('user-agent')),
    actorRole: 'ANONYMOUS'
  }, next);
};

export const setAuditActorRole = (role: AppRole): void => {
  const context = auditContextStorage.getStore();
  if (context) context.actorRole = role;
};

export const getAuditRequestContext = (): AuditRequestContext | undefined => (
  auditContextStorage.getStore()
);
