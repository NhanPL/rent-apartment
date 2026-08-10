import * as Sentry from '@sentry/node';
import { env } from '../../config/env';
import { getAuditRequestContext } from '../middleware/audit-context';
import { sanitizeLogValue } from './logger.service';
import { toSafeErrorLog } from '../utils/safe-log';

let initialized = false;

export const sanitizeMonitoringEvent = (event: Sentry.ErrorEvent): Sentry.ErrorEvent => {
  const safeEvent = { ...event };
  if (safeEvent.request) {
    safeEvent.request = { method: safeEvent.request.method };
  }
  if (safeEvent.user) {
    safeEvent.user = safeEvent.user.id ? { id: String(safeEvent.user.id) } : undefined;
  }
  safeEvent.extra = sanitizeLogValue(safeEvent.extra) as Sentry.ErrorEvent['extra'];
  safeEvent.contexts = sanitizeLogValue(safeEvent.contexts) as Sentry.ErrorEvent['contexts'];
  safeEvent.breadcrumbs = safeEvent.breadcrumbs?.map((breadcrumb) => ({
    ...breadcrumb,
    data: sanitizeLogValue(breadcrumb.data) as typeof breadcrumb.data
  }));
  safeEvent.exception = safeEvent.exception ? {
    ...safeEvent.exception,
    values: safeEvent.exception.values?.map((value) => ({
      ...value,
      value: value.value ? toSafeErrorLog(new Error(value.value)).message : value.value,
      stacktrace: undefined
    }))
  } : undefined;
  return safeEvent;
};

export const initializeMonitoring = (): void => {
  if (initialized || !env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.APP_ENV,
    release: env.APP_VERSION,
    sendDefaultPii: false,
    beforeSend: sanitizeMonitoringEvent
  });
  initialized = true;
};

export const captureRequestError = (
  error: unknown,
  details: { method: string; feature: string; userId?: string; role?: string }
): void => {
  if (!env.SENTRY_DSN) return;
  const requestId = getAuditRequestContext()?.requestId ?? 'unknown';
  Sentry.withScope((scope) => {
    scope.setTag('request_id', requestId);
    scope.setTag('feature', details.feature);
    scope.setTag('http.method', details.method);
    if (details.role) scope.setTag('actor.role', details.role);
    if (details.userId) scope.setUser({ id: details.userId });
    Sentry.captureException(error);
  });
};

export const flushMonitoring = async (timeoutMs = 2000): Promise<boolean> => (
  env.SENTRY_DSN ? Sentry.flush(timeoutMs) : true
);
